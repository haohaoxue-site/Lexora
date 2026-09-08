use std::{
    fs::{File, OpenOptions},
    io::Read,
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
};

use windows_sys::Win32::Storage::FileSystem::{
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_SEQUENTIAL_SCAN, FILE_LIST_DIRECTORY, FILE_SHARE_READ,
    FILE_SHARE_WRITE, FILE_TYPE_DISK, GetFileType, GetFinalPathNameByHandleW,
};

use super::{ReadError, ReadRequest};

pub fn read(request: &ReadRequest) -> Result<Vec<u8>, ReadError> {
    if !crate::windows_path::valid(&request.root) || !crate::windows_path::valid(&request.path) {
        return Err(ReadError::ReadFailed);
    }
    let root = OpenOptions::new()
        .access_mode(FILE_LIST_DIRECTORY)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(&request.root)
        .map_err(|_| ReadError::ReadFailed)?;
    if !root.metadata().map_err(|_| ReadError::ReadFailed)?.is_dir() {
        return Err(ReadError::ReadFailed);
    }
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_SEQUENTIAL_SCAN)
        .open(&request.path)
        .map_err(|_| ReadError::ReadFailed)?;
    // SAFETY: The live File owns this handle throughout the call.
    if unsafe { GetFileType(file.as_raw_handle()) } != FILE_TYPE_DISK {
        return Err(ReadError::ReadFailed);
    }
    let final_root = final_path(&root)?;
    let final_file = final_path(&file)?;
    let authorized_root = request.root.trim_end_matches('\\');
    let actual_root = final_root.trim_end_matches('\\');
    // Canonical caller paths and case-sensitive containment also protect case-sensitive NTFS directories.
    if actual_root != authorized_root || !final_file.starts_with(&format!("{actual_root}\\")) {
        return Err(ReadError::ReadFailed);
    }
    let metadata = file.metadata().map_err(|_| ReadError::ReadFailed)?;
    if !metadata.is_file() {
        return Err(ReadError::ReadFailed);
    }
    if metadata.len() > request.max_bytes {
        return Err(ReadError::OutputLimit);
    }
    let mut bytes = Vec::new();
    file.take(request.max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ReadError::ReadFailed)?;
    if bytes.len() as u64 > request.max_bytes {
        return Err(ReadError::OutputLimit);
    }
    // Keep the root's delete-denying handle alive until all bytes have been read.
    drop(root);
    Ok(bytes)
}

fn final_path(file: &File) -> Result<String, ReadError> {
    let mut buffer = vec![0u16; 32768];
    // SAFETY: The file handle is live and buffer has capacity for the supplied UTF-16 length.
    let size = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle(),
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            0,
        )
    } as usize;
    if size == 0 || size >= buffer.len() {
        return Err(ReadError::ReadFailed);
    }
    let path = String::from_utf16(&buffer[..size]).map_err(|_| ReadError::ReadFailed)?;
    if let Some(path) = path.strip_prefix("\\\\?\\UNC\\") {
        return Ok(format!("\\\\{path}"));
    }
    path.strip_prefix("\\\\?\\")
        .map(str::to_owned)
        .ok_or(ReadError::ReadFailed)
}
