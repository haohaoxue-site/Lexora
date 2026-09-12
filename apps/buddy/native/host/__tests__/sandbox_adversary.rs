#[cfg(windows)]
fn main() -> std::io::Result<()> {
    let argument = std::env::args()
        .nth(1)
        .ok_or(std::io::ErrorKind::InvalidInput)?;
    if argument == "--volume-metadata" {
        let directory = std::env::args().nth(2).unwrap_or_else(|| r"C:\".into());
        probe_directory_access(&directory);
        Ok(())
    } else {
        probe_token(&argument)
    }
}

#[cfg(windows)]
fn probe_directory_access(directory: &str) {
    use std::{os::windows::io::FromRawHandle, os::windows::io::OwnedHandle, ptr};
    use windows_sys::Win32::{Foundation::INVALID_HANDLE_VALUE, Storage::FileSystem::*};

    let root: Vec<u16> = directory.encode_utf16().chain([0]).collect();
    let mut results = serde_json::Map::new();
    // SAFETY: Queries attributes of a fixture-supplied directory without enumerating its contents.
    let query = if unsafe { GetFileAttributesW(root.as_ptr()) } == INVALID_FILE_ATTRIBUTES {
        std::io::Error::last_os_error().raw_os_error().unwrap_or(-1)
    } else {
        0
    };
    results.insert("queryAttributes".into(), query.into());
    for (name, mask) in [
        ("readAttributes", FILE_READ_ATTRIBUTES),
        ("listDirectory", FILE_LIST_DIRECTORY),
        ("addFile", FILE_ADD_FILE),
        ("addDirectory", FILE_ADD_SUBDIRECTORY),
        ("deleteChild", FILE_DELETE_CHILD),
        ("writeAttributes", FILE_WRITE_ATTRIBUTES),
        ("writeExtendedAttributes", FILE_WRITE_EA),
        ("writeDacl", WRITE_DAC),
        ("writeOwner", WRITE_OWNER),
        ("delete", DELETE),
    ] {
        // SAFETY: OPEN_EXISTING does not enumerate or mutate the fixture-supplied directory.
        let handle = unsafe {
            CreateFileW(
                root.as_ptr(),
                mask,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
                ptr::null_mut(),
            )
        };
        let code = if handle == INVALID_HANDLE_VALUE || handle.is_null() {
            std::io::Error::last_os_error().raw_os_error().unwrap_or(-1)
        } else {
            // SAFETY: The newly created handle transfers ownership exactly once.
            drop(unsafe { OwnedHandle::from_raw_handle(handle) });
            0
        };
        results.insert(name.into(), code.into());
    }
    println!("{}", serde_json::Value::Object(results));
}

#[cfg(windows)]
fn probe_token(path: &str) -> std::io::Result<()> {
    use std::{
        io,
        os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
        ptr,
    };
    use windows_sys::Win32::{
        Security::*,
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    let mut handle = ptr::null_mut();
    // SAFETY: This negative test requests only its own token; the runner grants no host token handles.
    if unsafe {
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE,
            &mut handle,
        )
    } == 0
    {
        println!("token-denied");
        return Ok(());
    }
    // SAFETY: Ownership of the successfully returned token handle transfers once.
    let token = unsafe { OwnedHandle::from_raw_handle(handle) };
    let mut storage = [0usize; 128];
    let mut needed = 0;
    // SAFETY: Aligned TOKEN_USER output has room for the largest valid SID.
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            storage.as_mut_ptr().cast(),
            size_of_val(&storage) as u32,
            &mut needed,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: The successful query initialized the TOKEN_USER header in live backing storage.
    let user = unsafe { &*storage.as_ptr().cast::<TOKEN_USER>() };
    let restriction = SID_AND_ATTRIBUTES {
        Sid: user.User.Sid,
        Attributes: 0,
    };
    let mut handle = ptr::null_mut();
    // SAFETY: Attempts to discard the command-specific denial SID while preserving its inherited user restriction.
    if unsafe {
        CreateRestrictedToken(
            token.as_raw_handle(),
            0,
            0,
            ptr::null(),
            0,
            ptr::null(),
            1,
            &restriction,
            &mut handle,
        )
    } == 0
    {
        println!("restriction-denied");
        return Ok(());
    }
    // SAFETY: Ownership of the newly restricted token handle transfers once.
    let restricted = unsafe { OwnedHandle::from_raw_handle(handle) };
    // SAFETY: The test impersonates only its own derived token, targeting a synthetic fixture.
    if unsafe { ImpersonateLoggedOnUser(restricted.as_raw_handle()) } == 0 {
        println!("impersonation-denied");
        return Ok(());
    }
    let result = std::fs::read_to_string(path);
    // SAFETY: Reverts only the impersonation started on this thread immediately above.
    unsafe { RevertToSelf() };
    println!(
        "{}",
        if result.is_ok() {
            "ESCAPED"
        } else {
            "file-denied"
        }
    );
    Ok(())
}

#[cfg(not(windows))]
fn main() {}
