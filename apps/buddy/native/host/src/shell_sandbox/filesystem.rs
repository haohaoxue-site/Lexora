use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    os::windows::{
        fs::OpenOptionsExt,
        io::{AsRawHandle, OwnedHandle},
    },
    path::{Path, PathBuf},
    ptr,
};

use serde::{Deserialize, Serialize};
use windows_sys::Win32::{
    Foundation::{ERROR_INSUFFICIENT_BUFFER, WAIT_ABANDONED, WAIT_OBJECT_0},
    Security::{
        Authorization::{
            EXPLICIT_ACCESS_W, GRANT_ACCESS, REVOKE_ACCESS, SetEntriesInAclW, TRUSTEE_IS_SID,
            TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
        },
        CONTAINER_INHERIT_ACE, DACL_SECURITY_INFORMATION, GetKernelObjectSecurity,
        GetSecurityDescriptorControl, GetSecurityDescriptorDacl, InitializeSecurityDescriptor,
        OBJECT_INHERIT_ACE, SE_DACL_AUTO_INHERIT_REQ, SE_DACL_AUTO_INHERITED, SE_DACL_PROTECTED,
        SECURITY_DESCRIPTOR, SetKernelObjectSecurity, SetSecurityDescriptorControl,
        SetSecurityDescriptorDacl,
    },
    Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, DELETE, FILE_ATTRIBUTE_REPARSE_POINT,
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_EXECUTE,
        FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_READ_ATTRIBUTES, FILE_SHARE_READ,
        FILE_SHARE_WRITE, GetFileInformationByHandle, GetFinalPathNameByHandleW, READ_CONTROL,
        WRITE_DAC,
    },
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
};

use super::cancellation::Cancellation;
use super::security::{
    LocalMemory, Profile, SecurityDescriptor, boolean, check, current_process, owned, sid_text,
    wide,
};
use crate::windows_security::{Sid, process_user_sid};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Grant {
    pub(super) path: String,
    pub(super) access: Access,
    pub(super) device: String,
    pub(super) inode: String,
    #[serde(default = "inherited")]
    pub(super) inherit: bool,
    #[serde(default)]
    pub(super) exceptions: Vec<String>,
}

fn inherited() -> bool {
    true
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Access {
    Read,
    Write,
    DenyRead,
    DenyWrite,
}

pub(super) struct Grants<'a> {
    sid: &'a Sid,
    handles: Vec<File>,
    validation_handles: Vec<File>,
    journal: Option<Journal>,
    roots: Vec<Grant>,
}

impl<'a> Grants<'a> {
    pub(super) fn apply(
        profile: &'a Profile,
        grants: &[Grant],
        cancellation: &Cancellation,
    ) -> io::Result<Self> {
        cancellation.check()?;
        if grants.is_empty() || grants.len() > 1024 {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        let directory = journal_directory()?;
        let _lock = AclLock::acquire()?;
        recover(&directory)?;
        let mut result = Self {
            sid: &profile.sid,
            handles: Vec::new(),
            validation_handles: Vec::new(),
            journal: None,
            roots: grants
                .iter()
                .filter(|grant| matches!(grant.access, Access::Read | Access::Write))
                .cloned()
                .collect(),
        };
        for grant in grants {
            cancellation.check()?;
            if super::policy::contains(&directory.to_string_lossy(), &grant.path) {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
            result.validation_handles.push(open_grant(grant)?);
        }
        let grants = super::policy::compile(grants, cancellation)?;
        let pinned = grants
            .iter()
            .map(|grant| {
                cancellation.check()?;
                open_grant(grant)
            })
            .collect::<io::Result<Vec<_>>>()?;
        result.journal = Some(Journal::create(directory, profile, &grants, &result.roots)?);
        profile.register()?;
        for (grant, file) in grants.iter().zip(pinned) {
            cancellation.check()?;
            let mask = match grant.access {
                Access::Read => FILE_GENERIC_READ | FILE_GENERIC_EXECUTE,
                Access::Write => {
                    FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE
                }
                _ => return Err(io::ErrorKind::InvalidData.into()),
            };
            result.handles.push(file);
            let file = result.handles.last().ok_or(io::ErrorKind::InvalidData)?;
            change_acl(file, result.sid, mask, GRANT_ACCESS, grant.inherit)?;
        }
        Ok(result)
    }

    pub(super) fn finish(&mut self) -> io::Result<()> {
        if self.journal.is_none() {
            return Ok(());
        }
        let _lock = AclLock::acquire()?;
        let mut failure = None;
        for root in &self.roots {
            if let Err(error) = revoke_tree(root, self.sid) {
                failure.get_or_insert(error);
            }
        }
        for file in &self.handles {
            if let Err(error) = change_acl(file, self.sid, 0, REVOKE_ACCESS, false) {
                failure.get_or_insert(error);
            }
        }
        if let Some(error) = failure {
            return Err(error);
        }
        if let Some(journal) = self.journal.take() {
            journal.remove()?;
        }
        Ok(())
    }
}

impl Drop for Grants<'_> {
    fn drop(&mut self) {
        if self.finish().is_err() {
            eprintln!(
                "{}",
                serde_json::json!({"type":"cleanupError","code":"SANDBOX_ACL_CLEANUP_FAILED"})
            );
        }
    }
}

pub(super) struct AclLock(OwnedHandle);
impl AclLock {
    fn acquire() -> io::Result<Self> {
        let user = sid_text(&process_user_sid(current_process())?)?;
        Self::for_user(&user)
    }

    pub(super) fn for_user(user: &str) -> io::Result<Self> {
        if !user.starts_with("S-1-")
            || !user[4..]
                .bytes()
                .all(|byte| byte.is_ascii_digit() || byte == b'-')
        {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        let descriptor =
            SecurityDescriptor::new(&format!("D:P(A;;GA;;;{user})(A;;GA;;;SY)(A;;GA;;;BA)"))?;
        let attributes = descriptor.attributes(false);
        // SAFETY: The mutex is scoped to the host user, with no AppContainer access or inherited handle.
        let handle = owned(unsafe {
            CreateMutexW(
                &attributes,
                0,
                wide(&format!("Global\\LexoraBuddySandboxAcl-{user}")).as_ptr(),
            )
        })?;
        // SAFETY: The owned mutex remains live through the bounded wait and matching ReleaseMutex.
        match unsafe { WaitForSingleObject(handle.as_raw_handle(), 10000) } {
            WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Self(handle)),
            _ => Err(io::ErrorKind::TimedOut.into()),
        }
    }
}

pub(super) fn inspect(path: &str, access: Access) -> io::Result<Grant> {
    let file = open_path(path)?;
    let (device, inode) = identity(&file, path)?;
    Ok(Grant {
        path: path.to_owned(),
        access,
        device,
        inode,
        inherit: true,
        exceptions: Vec::new(),
    })
}

fn open_path(path: &str) -> io::Result<File> {
    if !crate::windows_path::valid(path) || path.starts_with(r"\\") {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    OpenOptions::new()
        .access_mode(READ_CONTROL | WRITE_DAC | FILE_READ_ATTRIBUTES)
        .share_mode(
            FILE_SHARE_READ
                | FILE_SHARE_WRITE
                | windows_sys::Win32::Storage::FileSystem::FILE_SHARE_DELETE,
        )
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

pub(super) fn identity(file: &File, path: &str) -> io::Result<(String, String)> {
    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: A live pinned file is queried into the matching fixed-size information structure.
    boolean(unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut information) })?;
    if information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let mut name = vec![0u16; 32768];
    // SAFETY: The declared UTF-16 capacity matches the live output buffer.
    let count = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle(),
            name.as_mut_ptr(),
            name.len() as u32,
            0,
        )
    } as usize;
    if count == 0 {
        return Err(io::Error::last_os_error());
    }
    if count >= name.len() {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let name = String::from_utf16(&name[..count]).map_err(|_| io::ErrorKind::InvalidData)?;
    let canonical = name.strip_prefix(r"\\?\").unwrap_or(&name);
    if !super::policy::contains(canonical, path) || !super::policy::contains(path, canonical) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    Ok((
        information.dwVolumeSerialNumber.to_string(),
        ((u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow))
            .to_string(),
    ))
}

fn open_grant(grant: &Grant) -> io::Result<File> {
    let file = open_path(&grant.path)?;
    let (device, inode) = identity(&file, &grant.path)?;
    if device != grant.device || inode != grant.inode {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    Ok(file)
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Record {
    profile: String,
    grants: Vec<Grant>,
    #[serde(default)]
    roots: Vec<Grant>,
}
struct Journal {
    path: PathBuf,
    file: File,
}
impl Journal {
    fn create(
        directory: PathBuf,
        profile: &Profile,
        grants: &[Grant],
        roots: &[Grant],
    ) -> io::Result<Self> {
        let pending_path = directory.join(format!("{}.pending", profile.name));
        let pending = PendingJournal(pending_path);
        let path = directory.join(format!("{}.json", profile.name));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(FILE_SHARE_READ)
            .open(&pending.0)?;
        serde_json::to_writer(
            &mut file,
            &Record {
                profile: profile.name.clone(),
                grants: grants.to_vec(),
                roots: roots.to_vec(),
            },
        )?;
        file.flush()?;
        if file.metadata()?.len() > 64 * 1024 * 1024 {
            return Err(io::ErrorKind::InvalidData.into());
        }
        file.sync_all()?;
        drop(file);
        fs::rename(&pending.0, &path)?;
        let file = OpenOptions::new()
            .write(true)
            .share_mode(FILE_SHARE_READ)
            .open(&path)?;
        Ok(Self { path, file })
    }
    fn remove(self) -> io::Result<()> {
        drop(self.file);
        fs::remove_file(self.path)
    }
}

struct PendingJournal(PathBuf);
impl Drop for PendingJournal {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn journal_directory() -> io::Result<PathBuf> {
    let directory =
        super::setup::known_folder(&windows_sys::Win32::UI::Shell::FOLDERID_LocalAppData)?
            .join("Lexora Buddy Sandbox")
            .join("leases");
    crate::private_directories::ensure(&[directory.to_string_lossy().into_owned()])
        .map_err(io::Error::other)?;
    Ok(directory)
}

fn recover(directory: &Path) -> io::Result<()> {
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        let Some(name) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        if super::network::valid_profile(name)
            && path
                .extension()
                .is_some_and(|extension| extension == "pending")
        {
            fs::remove_file(&path)?;
            continue;
        }
        if !super::network::valid_profile(name)
            || path.extension().is_none_or(|extension| extension != "json")
        {
            continue;
        }
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&path);
        let mut file = match file {
            Ok(file) => file,
            Err(error)
                if error.raw_os_error()
                    == Some(windows_sys::Win32::Foundation::ERROR_SHARING_VIOLATION as i32) =>
            {
                continue;
            }
            Err(error) => return Err(error),
        };
        let mut bytes = Vec::new();
        (&mut file)
            .take(64 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 64 * 1024 * 1024 {
            return Err(io::ErrorKind::InvalidData.into());
        }
        let record: Record = serde_json::from_slice(&bytes)?;
        if record.profile != name || record.grants.len() > 100_000 {
            return Err(io::ErrorKind::InvalidData.into());
        }
        let profile = Profile::from_name(record.profile)?;
        if record.roots.len() > 1024 {
            return Err(io::ErrorKind::InvalidData.into());
        }
        for grant in &record.roots {
            revoke_tree(grant, &profile.sid)?;
        }
        for grant in &record.grants {
            match open_grant(grant) {
                Ok(file) => {
                    change_acl(&file, &profile.sid, 0, REVOKE_ACCESS, false)?;
                }
                Err(error)
                    if [io::ErrorKind::NotFound, io::ErrorKind::InvalidInput]
                        .contains(&error.kind()) => {}
                Err(error) => return Err(error),
            }
        }
        drop(profile);
        drop(file);
        fs::remove_file(path)?;
    }
    Ok(())
}
impl Drop for AclLock {
    fn drop(&mut self) {
        // SAFETY: Only a successful acquisition constructs this guard, on the same thread that drops it.
        unsafe { ReleaseMutex(self.0.as_raw_handle()) };
    }
}

pub(super) fn read_dacl_descriptor(file: &File) -> io::Result<Vec<usize>> {
    let mut needed = 0;
    // SAFETY: A zero-length query reads only the required size from this live file handle.
    let result = boolean(unsafe {
        GetKernelObjectSecurity(
            file.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            ptr::null_mut(),
            0,
            &mut needed,
        )
    });
    if let Err(error) = result
        && error.raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32)
    {
        return Err(error);
    }
    if needed == 0 {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let mut storage = vec![0usize; (needed as usize).div_ceil(size_of::<usize>())];
    // SAFETY: This aligned buffer has at least the declared size; the returned self-relative descriptor owns no pointers.
    boolean(unsafe {
        GetKernelObjectSecurity(
            file.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            storage.as_mut_ptr().cast(),
            needed,
            &mut needed,
        )
    })?;
    Ok(storage)
}

pub(super) fn change_acl(
    file: &File,
    sid: &Sid,
    mask: u32,
    mode: i32,
    inherit: bool,
) -> io::Result<()> {
    let mut storage = read_dacl_descriptor(file)?;
    let descriptor = storage.as_mut_ptr().cast();
    let mut dacl = ptr::null_mut();
    let mut present = 0;
    let mut defaulted = 0;
    // SAFETY: The self-relative descriptor remains backed by aligned storage throughout this update.
    boolean(unsafe {
        GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted)
    })?;
    if present == 0 || dacl.is_null() {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut control = 0;
    let mut revision = 0;
    // SAFETY: The live descriptor backs the ACL above and retains its original inheritance flags.
    boolean(unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) })?;
    let mut preserved = control & (SE_DACL_AUTO_INHERITED | SE_DACL_PROTECTED);
    if preserved & SE_DACL_AUTO_INHERITED != 0 {
        preserved |= SE_DACL_AUTO_INHERIT_REQ;
    }
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: mask,
        grfAccessMode: mode,
        grfInheritance: if inherit {
            OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
        } else {
            0
        },
        Trustee: TRUSTEE_W {
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid.as_ptr().cast(),
            ..Default::default()
        },
    };
    let mut updated = ptr::null_mut();
    // SAFETY: Both input ACL and SID have live backing allocations; the API returns a new ACL.
    check(unsafe { SetEntriesInAclW(1, &entry, dacl, &mut updated) })?;
    let _updated = LocalMemory(updated.cast());
    let mut security = SECURITY_DESCRIPTOR::default();
    // SAFETY: The absolute descriptor and updated ACL remain live for the handle-scoped synchronous update.
    unsafe {
        boolean(InitializeSecurityDescriptor(
            ptr::from_mut(&mut security).cast(),
            1,
        ))?;
        boolean(SetSecurityDescriptorDacl(
            ptr::from_mut(&mut security).cast(),
            1,
            updated,
            0,
        ))?;
        // The low-level setter requires AUTO_INHERIT_REQ to retain AUTO_INHERITED without propagating ACEs.
        boolean(SetSecurityDescriptorControl(
            ptr::from_mut(&mut security).cast(),
            SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ | SE_DACL_PROTECTED,
            preserved,
        ))?;
        boolean(SetKernelObjectSecurity(
            file.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            ptr::from_mut(&mut security).cast(),
        ))
    }
}

#[cfg(test)]
#[path = "../../__tests__/shell_sandbox_filesystem.rs"]
mod tests;

fn revoke_tree(root: &Grant, sid: &Sid) -> io::Result<()> {
    match open_grant(root) {
        Ok(_) => {}
        Err(error)
            if [io::ErrorKind::NotFound, io::ErrorKind::InvalidInput].contains(&error.kind()) =>
        {
            return Ok(());
        }
        Err(error) => return Err(error),
    }
    let mut pending = vec![PathBuf::from(&root.path)];
    while let Some(path) = pending.pop() {
        use std::os::windows::fs::MetadataExt;
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            continue;
        }
        let file = open_path(&path.to_string_lossy())?;
        identity(&file, &path.to_string_lossy())?;
        change_acl(&file, sid, 0, REVOKE_ACCESS, false)?;
        if metadata.is_dir() {
            for entry in fs::read_dir(&path)? {
                pending.push(entry?.path());
            }
        }
    }
    Ok(())
}
