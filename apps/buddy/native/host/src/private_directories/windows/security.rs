use std::{ffi::c_void, fs::File, os::windows::io::AsRawHandle, ptr};

use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{
        ACCESS_ALLOWED_ACE, ACE_HEADER, ACL,
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            GetSecurityInfo, SDDL_REVISION_1, SE_FILE_OBJECT,
        },
        DACL_SECURITY_INFORMATION, GetAce, GetSecurityDescriptorDacl, GetSecurityDescriptorOwner,
        INHERIT_ONLY_ACE, IsValidAcl, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID,
        WinBuiltinAdministratorsSid, WinCreatorOwnerSid, WinLocalSystemSid,
    },
    System::{
        SystemServices::{ACCESS_ALLOWED_ACE_TYPE, ACCESS_DENIED_ACE_TYPE},
        Threading::GetCurrentProcess,
    },
};

use super::{DirectoryError, DirectoryFailure, DirectoryOperation, SystemErrorDomain};
use crate::windows_security::{Sid, process_user_sid};

struct LocalMemory(*mut c_void);

impl Drop for LocalMemory {
    fn drop(&mut self) {
        // SAFETY: This wrapper owns memory returned by a successful LocalAlloc-backed Win32 API.
        unsafe { LocalFree(self.0) };
    }
}

pub(super) struct PrivateSecurity {
    descriptor: LocalMemory,
    trusted: [Sid; 3],
    creator_owner: Sid,
}

impl PrivateSecurity {
    pub(super) fn new() -> Result<Self, DirectoryFailure> {
        // SAFETY: The pseudo process handle is borrowed and never closed.
        let user = process_user_sid(unsafe { GetCurrentProcess() })
            .map_err(|error| DirectoryFailure::io(DirectoryOperation::Identity, error))?;
        let mut text = ptr::null_mut();
        // SAFETY: user contains an aligned valid SID and text receives an owned string allocation.
        if unsafe { ConvertSidToStringSidW(user.as_ptr(), &mut text) } == 0 {
            return Err(DirectoryFailure::io(
                DirectoryOperation::Identity,
                std::io::Error::last_os_error(),
            ));
        }
        let text = LocalMemory(text.cast());
        let mut sid = Vec::new();
        for index in 0..256 {
            // SAFETY: The API returned a NUL-terminated SID string; scanning stops at its terminator.
            let unit = unsafe { *text.0.cast::<u16>().add(index) };
            if unit == 0 {
                break;
            }
            sid.push(unit);
        }
        let sid = String::from_utf16(&sid).map_err(|_| {
            DirectoryFailure::new(DirectoryError::Failed, DirectoryOperation::Identity)
        })?;
        let descriptor = from_sddl(&format!(
            "O:{sid}D:P(A;OICI;FA;;;{sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
        ))?;
        Ok(Self {
            descriptor,
            trusted: [
                user,
                Sid::well_known(WinLocalSystemSid)
                    .map_err(|error| DirectoryFailure::io(DirectoryOperation::Identity, error))?,
                Sid::well_known(WinBuiltinAdministratorsSid)
                    .map_err(|error| DirectoryFailure::io(DirectoryOperation::Identity, error))?,
            ],
            creator_owner: Sid::well_known(WinCreatorOwnerSid)
                .map_err(|error| DirectoryFailure::io(DirectoryOperation::Identity, error))?,
        })
    }

    pub(super) fn as_ptr(&self) -> PSECURITY_DESCRIPTOR {
        self.descriptor.0
    }

    pub(super) fn validate(&self, file: &File) -> Result<(), DirectoryFailure> {
        let mut descriptor = ptr::null_mut();
        // SAFETY: The live directory handle includes READ_CONTROL; the output receives owned descriptor storage.
        let result = unsafe {
            GetSecurityInfo(
                file.as_raw_handle(),
                SE_FILE_OBJECT,
                OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                &mut descriptor,
            )
        };
        if result != 0 {
            return Err(DirectoryFailure::system(
                DirectoryOperation::ValidateAcl,
                SystemErrorDomain::Win32,
                result,
            ));
        }
        self.validate_descriptor(&LocalMemory(descriptor))
    }

    fn validate_descriptor(&self, descriptor: &LocalMemory) -> Result<(), DirectoryFailure> {
        let mut owner = ptr::null_mut();
        let mut defaulted = 0;
        let mut present = 0;
        let mut acl = ptr::null_mut();
        // SAFETY: The descriptor is owned storage returned by a successful security-descriptor API; all outputs are writable.
        if unsafe {
            GetSecurityDescriptorOwner(descriptor.0, &mut owner, &mut defaulted) == 0
                || GetSecurityDescriptorDacl(descriptor.0, &mut present, &mut acl, &mut defaulted)
                    == 0
        } {
            return Err(DirectoryFailure::io(
                DirectoryOperation::ValidateAcl,
                std::io::Error::last_os_error(),
            ));
        }
        // SAFETY: The owner points into the live descriptor, or is null and rejected below.
        if owner.is_null() || !unsafe { self.trusts(owner) } || present == 0 || acl.is_null() {
            return Err(DirectoryFailure::new(
                DirectoryError::Unsafe,
                DirectoryOperation::ValidateAcl,
            ));
        }
        // SAFETY: The non-null ACL points into the live descriptor.
        if unsafe { IsValidAcl(acl) } == 0 {
            return Err(DirectoryFailure::new(
                DirectoryError::Unsafe,
                DirectoryOperation::ValidateAcl,
            ));
        }
        // SAFETY: The ACL has been validated and its backing descriptor remains live throughout enumeration.
        unsafe { self.validate_acl(acl) }
    }

    unsafe fn trusts(&self, sid: PSID) -> bool {
        // SAFETY: The caller provides a SID backed by the validated, live security descriptor.
        unsafe { Sid::copy(sid) }.is_ok_and(|sid| self.trusted.contains(&sid))
    }

    unsafe fn validate_acl(&self, acl: *const ACL) -> Result<(), DirectoryFailure> {
        // SAFETY: The caller guarantees a validated ACL backed by live descriptor storage.
        let count = unsafe { (*acl).AceCount };
        for index in 0..u32::from(count) {
            let mut ace = ptr::null_mut();
            // SAFETY: index is within the validated ACL's ACE count and the output is writable.
            if unsafe { GetAce(acl, index, &mut ace) } == 0 {
                return Err(DirectoryFailure::io(
                    DirectoryOperation::ValidateAcl,
                    std::io::Error::last_os_error(),
                ));
            }
            // SAFETY: GetAce succeeded for this entry within the live ACL.
            let header = unsafe { &*ace.cast::<ACE_HEADER>() };
            match u32::from(header.AceType) {
                ACCESS_ALLOWED_ACE_TYPE => {
                    let offset = std::mem::offset_of!(ACCESS_ALLOWED_ACE, SidStart);
                    if usize::from(header.AceSize) < offset + 8 {
                        return Err(DirectoryFailure::new(
                            DirectoryError::Unsafe,
                            DirectoryOperation::ValidateAcl,
                        ));
                    }
                    // SAFETY: This is a validated standard allow ACE; its inline SID begins at SidStart.
                    let sid = unsafe {
                        ptr::addr_of!((*ace.cast::<ACCESS_ALLOWED_ACE>()).SidStart)
                            .cast_mut()
                            .cast::<u8>()
                    };
                    // SAFETY: The ACE includes the fixed eight-byte SID header checked above.
                    let sid_size = 8 + 4 * usize::from(unsafe { *sid.add(1) });
                    if sid_size > usize::from(header.AceSize) - offset {
                        return Err(DirectoryFailure::new(
                            DirectoryError::Unsafe,
                            DirectoryOperation::ValidateAcl,
                        ));
                    }
                    // SAFETY: The inline SID remains backed by the live ACE in the descriptor.
                    let sid = unsafe { Sid::copy(sid.cast()) }.map_err(|_| {
                        DirectoryFailure::new(
                            DirectoryError::Unsafe,
                            DirectoryOperation::ValidateAcl,
                        )
                    })?;
                    let owner_template = u32::from(header.AceFlags) & INHERIT_ONLY_ACE != 0
                        && sid == self.creator_owner;
                    if !self.trusted.contains(&sid) && !owner_template {
                        return Err(DirectoryFailure::new(
                            DirectoryError::Unsafe,
                            DirectoryOperation::ValidateAcl,
                        ));
                    }
                }
                ACCESS_DENIED_ACE_TYPE => {}
                _ => {
                    return Err(DirectoryFailure::new(
                        DirectoryError::Unsafe,
                        DirectoryOperation::ValidateAcl,
                    ));
                }
            }
        }
        Ok(())
    }
}

fn from_sddl(sddl: &str) -> Result<LocalMemory, DirectoryFailure> {
    let text: Vec<u16> = sddl.encode_utf16().chain([0]).collect();
    let mut descriptor = ptr::null_mut();
    // SAFETY: text is a NUL-terminated UTF-16 string; the output receives an owned security descriptor.
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            text.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            ptr::null_mut(),
        )
    } == 0
    {
        return Err(DirectoryFailure::io(
            DirectoryOperation::Identity,
            std::io::Error::last_os_error(),
        ));
    }
    Ok(LocalMemory(descriptor))
}

#[cfg(test)]
#[path = "../../../__tests__/private_security_windows.rs"]
mod tests;
