use windows_sys::Win32::{
    Foundation::{ERROR_NO_MORE_FILES, GetLastError, INVALID_HANDLE_VALUE},
    Globalization::{CSTR_EQUAL, CompareStringOrdinal},
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    },
};

use super::{Handle, ProcessError};

pub(super) struct Entry {
    pub pid: u32,
    pub parent: u32,
    pub name: String,
}

pub(super) fn read() -> Result<Vec<Entry>, ProcessError> {
    // SAFETY: Process snapshots require no remote handles or mutable input buffers.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(ProcessError::Failed);
    }
    let snapshot = Handle(snapshot);
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut entries = Vec::new();
    // SAFETY: Snapshot is live and the sized output struct is writable.
    let mut found = unsafe { Process32FirstW(snapshot.0, &mut entry) };
    while found != 0 {
        let len = entry
            .szExeFile
            .iter()
            .position(|&unit| unit == 0)
            .ok_or(ProcessError::Failed)?;
        entries.push(Entry {
            pid: entry.th32ProcessID,
            parent: entry.th32ParentProcessID,
            name: String::from_utf16(&entry.szExeFile[..len]).map_err(|_| ProcessError::Failed)?,
        });
        if entries.len() > 65536 {
            return Err(ProcessError::Failed);
        }
        // SAFETY: The same live snapshot and sized output struct are reused synchronously.
        found = unsafe { Process32NextW(snapshot.0, &mut entry) };
    }
    // SAFETY: No other Win32 call occurred since the failed enumeration step.
    if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
        return Err(ProcessError::Failed);
    }
    Ok(entries)
}

pub(super) fn same_name(left: &str, right: &str) -> bool {
    let left: Vec<u16> = left.encode_utf16().collect();
    let right: Vec<u16> = right.encode_utf16().collect();
    // SAFETY: Both buffers are owned here; names are bounded to Win32 path/name sizes.
    unsafe {
        CompareStringOrdinal(
            left.as_ptr(),
            left.len() as i32,
            right.as_ptr(),
            right.len() as i32,
            1,
        ) == CSTR_EQUAL
    }
}
