use std::{
    fs::{File, OpenOptions},
    os::windows::{
        fs::OpenOptionsExt,
        io::{AsRawHandle, FromRawHandle},
    },
    ptr,
};

use windows_sys::{
    Wdk::{
        Foundation::OBJECT_ATTRIBUTES,
        Storage::FileSystem::{
            FILE_DIRECTORY_FILE, FILE_OPEN_IF, FILE_OPEN_REPARSE_POINT,
            FILE_SYNCHRONOUS_IO_NONALERT, NtCreateFile,
        },
    },
    Win32::{
        Foundation::{OBJ_CASE_INSENSITIVE, OBJ_DONT_REPARSE, UNICODE_STRING},
        Storage::FileSystem::{
            FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO,
            FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_LIST_DIRECTORY,
            FILE_READ_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, FileAttributeTagInfo,
            GetFileInformationByHandleEx, READ_CONTROL, SYNCHRONIZE,
        },
        System::{IO::IO_STATUS_BLOCK, WindowsProgramming::FILE_CREATED},
    },
};

use super::{DirectoryError, directory_parts};

mod security;
use security::PrivateSecurity;

pub(super) fn ensure(paths: &[String]) -> Result<(), DirectoryError> {
    let security = PrivateSecurity::new()?;
    for path in paths {
        let (root, parts) = directory_parts(path)?;
        let root = open_root(&root)?;
        let mut handles = vec![root];
        for (index, part) in parts.iter().enumerate() {
            let parent = handles.last().ok_or(DirectoryError::Failed)?;
            let (child, created) = open_child(parent, part, &security)?;
            if created || index + 1 == parts.len() {
                security.validate(&child)?;
            }
            handles.push(child);
        }
    }
    Ok(())
}

fn open_root(path: &str) -> Result<File, DirectoryError> {
    let root = OpenOptions::new()
        .access_mode(FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| DirectoryError::Failed)?;
    validate_directory(&root)?;
    Ok(root)
}

fn open_child(
    parent: &File,
    name: &str,
    security: &PrivateSecurity,
) -> Result<(File, bool), DirectoryError> {
    let mut name: Vec<u16> = name.encode_utf16().collect();
    let len = u16::try_from(name.len() * 2).map_err(|_| DirectoryError::Invalid)?;
    let name = UNICODE_STRING {
        Length: len,
        MaximumLength: len,
        Buffer: name.as_mut_ptr(),
    };
    let attributes = OBJECT_ATTRIBUTES {
        Length: size_of::<OBJECT_ATTRIBUTES>() as u32,
        RootDirectory: parent.as_raw_handle(),
        ObjectName: &name,
        Attributes: OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE,
        SecurityDescriptor: security.as_ptr().cast(),
        ..Default::default()
    };
    let mut handle = ptr::null_mut();
    let mut status = IO_STATUS_BLOCK::default();
    // SAFETY: One validated name is resolved relative to the live parent handle. ACL storage and all outputs stay live throughout this synchronous call.
    let result = unsafe {
        NtCreateFile(
            &mut handle,
            FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE,
            &attributes,
            &mut status,
            ptr::null(),
            FILE_ATTRIBUTE_DIRECTORY,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            FILE_OPEN_IF,
            FILE_DIRECTORY_FILE | FILE_OPEN_REPARSE_POINT | FILE_SYNCHRONOUS_IO_NONALERT,
            ptr::null(),
            0,
        )
    };
    if result < 0 {
        return Err(DirectoryError::Failed);
    }
    // SAFETY: NtCreateFile succeeded; the newly owned directory handle transfers exactly once.
    let file = unsafe { File::from_raw_handle(handle) };
    validate_directory(&file)?;
    Ok((file, status.Information == FILE_CREATED as usize))
}

fn validate_directory(file: &File) -> Result<(), DirectoryError> {
    let mut attributes = FILE_ATTRIBUTE_TAG_INFO::default();
    // SAFETY: The directory handle is live and the output has the declared size.
    if unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileAttributeTagInfo,
            ptr::from_mut(&mut attributes).cast(),
            size_of_val(&attributes) as u32,
        )
    } == 0
    {
        return Err(DirectoryError::Failed);
    }
    if attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(DirectoryError::Unsafe);
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../__tests__/private_directories_windows.rs"]
mod tests;
