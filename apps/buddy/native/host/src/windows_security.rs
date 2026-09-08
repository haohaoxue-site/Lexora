use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
};

use windows_sys::Win32::{
    Foundation::HANDLE,
    Security::{
        CopySid, CreateWellKnownSid, GetTokenInformation, IsValidSid, PSID, SECURITY_MAX_SID_SIZE,
        TOKEN_QUERY, TOKEN_USER, TokenUser, WELL_KNOWN_SID_TYPE,
    },
    System::Threading::OpenProcessToken,
};

#[derive(PartialEq, Eq)]
pub(crate) struct Sid([u32; 17]);

impl Sid {
    pub(crate) fn as_ptr(&self) -> PSID {
        self.0.as_ptr().cast_mut().cast()
    }

    /// # Safety
    /// The pointer must refer to readable SID storage for the duration of the call.
    pub(crate) unsafe fn copy(source: PSID) -> io::Result<Self> {
        let mut sid = Self([0; 17]);
        // SAFETY: The caller guarantees readable SID storage; the destination is aligned and sized for the largest SID.
        if unsafe {
            IsValidSid(source) == 0
                || CopySid(SECURITY_MAX_SID_SIZE, sid.0.as_mut_ptr().cast(), source) == 0
        } {
            return Err(io::Error::last_os_error());
        }
        Ok(sid)
    }

    pub(crate) fn well_known(kind: WELL_KNOWN_SID_TYPE) -> io::Result<Self> {
        let mut sid = Self([0; 17]);
        let mut len = SECURITY_MAX_SID_SIZE;
        // SAFETY: The destination is aligned and has the declared SID capacity; built-in identities have no domain SID.
        if unsafe { CreateWellKnownSid(kind, ptr::null_mut(), sid.0.as_mut_ptr().cast(), &mut len) }
            == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(sid)
    }
}

pub(crate) fn process_user_sid(process: HANDLE) -> io::Result<Sid> {
    let mut token = ptr::null_mut();
    // SAFETY: The borrowed process handle is live and the output receives a new owned token handle.
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: OpenProcessToken succeeded and ownership transfers exactly once.
    let token = unsafe { OwnedHandle::from_raw_handle(token) };
    let mut buffer = [0usize; 32];
    let mut needed = 0;
    // SAFETY: The pointer-aligned buffer exceeds TOKEN_USER plus SECURITY_MAX_SID_SIZE.
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            size_of_val(&buffer) as u32,
            &mut needed,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if needed as usize > size_of_val(&buffer) || (needed as usize) < size_of::<TOKEN_USER>() {
        return Err(io::Error::from(io::ErrorKind::InvalidData));
    }
    // SAFETY: The successful TokenUser query initialized this aligned struct and its SID in the live buffer.
    unsafe { Sid::copy((*buffer.as_ptr().cast::<TOKEN_USER>()).User.Sid) }
}
