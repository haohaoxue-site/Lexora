use super::{ReadError, ReadRequest};
use rustix::fs::{CWD, Mode, OFlags, ResolveFlags, openat2};
use std::{
    fs::{self, File},
    io::Read,
    os::fd::AsRawFd,
    path::{Component, Path, PathBuf},
};

pub fn read(request: &ReadRequest) -> Result<Vec<u8>, ReadError> {
    let root_path = Path::new(&request.root);
    let path = Path::new(&request.path);
    if !root_path.is_absolute()
        || !path.is_absolute()
        || root_path
            .components()
            .chain(path.components())
            .any(|part| matches!(part, Component::ParentDir))
    {
        return Err(ReadError::ReadFailed);
    }
    let relative = path
        .strip_prefix(root_path)
        .map_err(|_| ReadError::ReadFailed)?;
    if relative.as_os_str().is_empty() {
        return Err(ReadError::ReadFailed);
    }
    let root = File::from(
        openat2(
            CWD,
            root_path,
            OFlags::PATH | OFlags::DIRECTORY | OFlags::CLOEXEC,
            Mode::empty(),
            ResolveFlags::NO_SYMLINKS | ResolveFlags::NO_MAGICLINKS,
        )
        .map_err(open_error)?,
    );
    if fs::read_link(descriptor_path(&root)).map_err(|_| ReadError::ReadFailed)? != root_path {
        return Err(ReadError::ReadFailed);
    }
    let target = File::from(
        openat2(
            &root,
            relative,
            OFlags::PATH | OFlags::CLOEXEC,
            Mode::empty(),
            ResolveFlags::BENEATH | ResolveFlags::NO_MAGICLINKS,
        )
        .map_err(open_error)?,
    );
    let metadata = target.metadata().map_err(|_| ReadError::ReadFailed)?;
    if !metadata.is_file() {
        return Err(ReadError::ReadFailed);
    }
    if metadata.len() > request.max_bytes {
        return Err(ReadError::OutputLimit);
    }
    // Reopen the pinned ordinary file, never the caller's replaceable pathname.
    let file = File::open(descriptor_path(&target)).map_err(|_| ReadError::ReadFailed)?;
    let mut bytes = Vec::new();
    file.take(request.max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ReadError::ReadFailed)?;
    if bytes.len() as u64 > request.max_bytes {
        return Err(ReadError::OutputLimit);
    }
    if fs::read_link(descriptor_path(&root)).map_err(|_| ReadError::ReadFailed)? != root_path
        || !fs::read_link(descriptor_path(&target))
            .map_err(|_| ReadError::ReadFailed)?
            .starts_with(root_path)
    {
        return Err(ReadError::ReadFailed);
    }
    Ok(bytes)
}

fn descriptor_path(file: &File) -> PathBuf {
    PathBuf::from(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

fn open_error(error: rustix::io::Errno) -> ReadError {
    if error == rustix::io::Errno::NOSYS {
        ReadError::Unavailable
    } else {
        ReadError::ReadFailed
    }
}
