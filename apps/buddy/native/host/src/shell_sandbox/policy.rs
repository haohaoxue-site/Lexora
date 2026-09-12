use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, OpenOptions},
    io,
    os::windows::{
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    },
    ptr,
};

use windows_sys::{
    Wdk::Foundation::{NtQueryObject, ObjectBasicInformation},
    Win32::{
        Foundation::{ERROR_ACCESS_DENIED, HANDLE},
        Globalization::{CSTR_EQUAL, CompareStringOrdinal},
        Security::{ImpersonateLoggedOnUser, RevertToSelf, TOKEN_DUPLICATE, TOKEN_QUERY},
        Storage::FileSystem::{
            DELETE, FILE_APPEND_DATA, FILE_ATTRIBUTE_REPARSE_POINT, FILE_DELETE_CHILD,
            FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_DATA,
            FILE_WRITE_ATTRIBUTES, FILE_WRITE_DATA, FILE_WRITE_EA, WRITE_DAC, WRITE_OWNER,
        },
        System::{
            SystemServices::MAXIMUM_ALLOWED, Threading::OpenProcessToken,
            WindowsProgramming::PUBLIC_OBJECT_BASIC_INFORMATION,
        },
    },
};

use super::{
    cancellation::Cancellation,
    filesystem::{Access, Grant, inspect},
    security::{boolean, owned},
};

pub(super) fn contains(root: &str, path: &str) -> bool {
    let root: Vec<u16> = root.trim_end_matches('\\').encode_utf16().collect();
    let path: Vec<u16> = path.trim_end_matches('\\').encode_utf16().collect();
    if root.len() > path.len() || (root.len() < path.len() && path[root.len()] != b'\\' as u16) {
        return false;
    }
    // SAFETY: Both slices have at least root.len() UTF-16 units; Windows ordinal comparison matches filesystem case rules.
    unsafe {
        CompareStringOrdinal(
            root.as_ptr(),
            root.len() as i32,
            path.as_ptr(),
            root.len() as i32,
            1,
        ) == CSTR_EQUAL
    }
}

pub(super) fn compile(grants: &[Grant], cancellation: &Cancellation) -> io::Result<Vec<Grant>> {
    let mut output = Vec::new();
    let mut visited = HashSet::new();
    for grant in grants
        .iter()
        .filter(|grant| matches!(grant.access, Access::Read | Access::Write))
    {
        expand(
            grant.clone(),
            grants,
            &mut output,
            &mut visited,
            cancellation,
            0,
        )?;
    }
    Ok(output)
}

fn expand(
    mut grant: Grant,
    policy: &[Grant],
    output: &mut Vec<Grant>,
    visited: &mut HashSet<String>,
    cancellation: &Cancellation,
    depth: usize,
) -> io::Result<()> {
    cancellation.check()?;
    if visited.contains(&grant.path.to_uppercase()) {
        return Ok(());
    }
    if output.len() >= 100_000 || depth > 128 {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    grant.access = if policy.iter().any(|boundary| {
        matches!(boundary.access, Access::Write) && contains(&boundary.path, &grant.path)
    }) {
        Access::Write
    } else {
        Access::Read
    };
    for boundary in policy
        .iter()
        .filter(|boundary| contains(&boundary.path, &grant.path))
    {
        match boundary.access {
            Access::DenyRead
                if !boundary
                    .exceptions
                    .iter()
                    .any(|path| contains(path, &grant.path)) =>
            {
                return Ok(());
            }
            Access::DenyWrite => grant.access = Access::Read,
            _ => {}
        }
    }
    grant.inherit = true;
    visited.insert(grant.path.to_uppercase());
    let access = grant.access;
    let path = grant.path.clone();
    output.push(grant);
    if fs::symlink_metadata(&path)?.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            if fs::symlink_metadata(entry.path())?.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT
                != 0
            {
                continue;
            }
            expand(
                inspect(&entry.path().to_string_lossy(), access)?,
                policy,
                output,
                visited,
                cancellation,
                depth + 1,
            )?;
        }
    }
    Ok(())
}

pub(super) fn verify_denials(
    process: HANDLE,
    grants: &[Grant],
    cancellation: &Cancellation,
) -> io::Result<()> {
    let mut probes = BTreeMap::new();
    for grant in grants {
        let mask = match grant.access {
            Access::DenyRead => {
                FILE_READ_DATA
                    | FILE_WRITE_DATA
                    | FILE_APPEND_DATA
                    | DELETE
                    | WRITE_DAC
                    | WRITE_OWNER
            }
            Access::DenyWrite | Access::Read => {
                FILE_WRITE_DATA
                    | FILE_APPEND_DATA
                    | FILE_WRITE_EA
                    | FILE_WRITE_ATTRIBUTES
                    | DELETE
                    | WRITE_DAC
                    | WRITE_OWNER
            }
            Access::Write => continue,
        };
        let mut exceptions = grant.exceptions.clone();
        if matches!(grant.access, Access::Read) {
            exceptions.extend(
                grants
                    .iter()
                    .filter(|boundary| matches!(boundary.access, Access::Write))
                    .map(|boundary| boundary.path.clone()),
            );
        }
        collect_probes(&grant.path, mask, &exceptions, &mut probes, cancellation, 0)?;
    }
    let mut token = ptr::null_mut();
    // SAFETY: The exact child is still suspended; only query/duplication rights are requested for same-user impersonation.
    boolean(unsafe { OpenProcessToken(process, TOKEN_QUERY | TOKEN_DUPLICATE, &mut token) })?;
    let token = owned(token)?;
    // SAFETY: No user command runs on this thread; impersonation is checked before performing access-only probes.
    boolean(unsafe { ImpersonateLoggedOnUser(token.as_raw_handle()) })?;
    let _impersonation = Impersonation;
    for (path, forbidden) in probes {
        cancellation.check()?;
        let file = match OpenOptions::new()
            .access_mode(MAXIMUM_ALLOWED)
            .share_mode(7)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
        {
            Ok(file) => file,
            Err(error) if error.raw_os_error() == Some(ERROR_ACCESS_DENIED as i32) => continue,
            Err(error) => return Err(error),
        };
        let mut information = PUBLIC_OBJECT_BASIC_INFORMATION::default();
        // SAFETY: This queries access already granted to the exact probe handle, without modifying or reading file contents.
        let status = unsafe {
            NtQueryObject(
                file.as_raw_handle(),
                ObjectBasicInformation,
                ptr::from_mut(&mut information).cast(),
                size_of_val(&information) as u32,
                ptr::null_mut(),
            )
        };
        if status < 0 || information.GrantedAccess & forbidden != 0 {
            return Err(io::ErrorKind::PermissionDenied.into());
        }
    }
    Ok(())
}

fn collect_probes(
    path: &str,
    mask: u32,
    exceptions: &[String],
    probes: &mut BTreeMap<String, u32>,
    cancellation: &Cancellation,
    depth: usize,
) -> io::Result<()> {
    cancellation.check()?;
    if exceptions.iter().any(|exception| contains(exception, path)) {
        return Ok(());
    }
    if probes.len() >= 100_000 || depth > 128 {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let metadata = fs::symlink_metadata(path)?;
    let mask = mask
        | if metadata.is_dir() {
            FILE_DELETE_CHILD
        } else {
            0
        };
    *probes.entry(path.to_owned()).or_default() |= mask;
    if metadata.is_dir() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0 {
        for entry in fs::read_dir(path)? {
            collect_probes(
                &entry?.path().to_string_lossy(),
                mask & !FILE_DELETE_CHILD,
                exceptions,
                probes,
                cancellation,
                depth + 1,
            )?;
        }
    }
    Ok(())
}

struct Impersonation;
impl Drop for Impersonation {
    fn drop(&mut self) {
        // SAFETY: This guard exists only after successful impersonation on this same thread.
        if unsafe { RevertToSelf() } == 0 {
            std::process::abort();
        }
    }
}
