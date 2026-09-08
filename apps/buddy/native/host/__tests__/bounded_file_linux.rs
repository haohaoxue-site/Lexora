#![cfg(target_os = "linux")]

use lexora_buddy_host::file_reader::{ReadError, ReadRequest, read_bounded_file};
use std::{fs, os::unix::fs::symlink, path::Path};

fn read(root: &Path, path: &Path, max_bytes: u64) -> Result<Vec<u8>, ReadError> {
    read_bounded_file(&ReadRequest {
        root: root.to_str().unwrap().to_owned(),
        path: path.to_str().unwrap().to_owned(),
        max_bytes,
    })
}

#[test]
fn reads_regular_files_with_exact_and_zero_limits() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("文档.txt");
    fs::write(&file, b"hello").unwrap();
    assert_eq!(read(root.path(), &file, 5).unwrap(), b"hello");
    assert!(matches!(
        read(root.path(), &file, 4),
        Err(ReadError::OutputLimit)
    ));
    fs::write(&file, []).unwrap();
    assert!(read(root.path(), &file, 0).unwrap().is_empty());
}

#[test]
fn link_replacement_never_returns_bytes_from_outside_the_root() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("root");
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("safe"), b"allowed").unwrap();
    let outside = directory.path().join("outside");
    std::fs::write(&outside, b"not-allowed").unwrap();
    let link = root.join("link");
    std::os::unix::fs::symlink("safe", &link).unwrap();
    std::thread::scope(|scope| {
        scope.spawn(|| {
            let candidate = root.join("candidate");
            for iteration in 0..500 {
                let target = if iteration % 2 == 0 {
                    std::path::Path::new("safe")
                } else {
                    outside.as_path()
                };
                std::os::unix::fs::symlink(target, &candidate).unwrap();
                std::fs::rename(&candidate, &link).unwrap();
            }
        });
        for _ in 0..500 {
            if let Ok(bytes) = read(&root, &link, 64) {
                assert_eq!(bytes, b"allowed");
            }
        }
    });
}

#[test]
fn allows_internal_relative_links_but_rejects_escape_and_root_aliases() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(root.path().join("inside"), b"inside").unwrap();
    fs::write(outside.path().join("secret"), b"outside").unwrap();
    let link = root.path().join("link");
    symlink("inside", &link).unwrap();
    assert_eq!(read(root.path(), &link, 20).unwrap(), b"inside");
    fs::remove_file(&link).unwrap();
    symlink(outside.path(), &link).unwrap();
    assert!(read(root.path(), &link.join("secret"), 20).is_err());
    assert!(read(root.path(), &outside.path().join("secret"), 20).is_err());
    let alias = outside.path().join("alias");
    symlink(root.path(), &alias).unwrap();
    assert!(read(&alias, &alias.join("inside"), 20).is_err());
}

#[test]
fn rejects_directories_fifos_and_magic_links_without_reading_them() {
    let root = tempfile::tempdir().unwrap();
    let fifo = root.path().join("fifo");
    rustix::fs::mkfifoat(rustix::fs::CWD, &fifo, rustix::fs::Mode::RUSR).unwrap();
    assert!(read(root.path(), root.path(), 20).is_err());
    assert!(read(root.path(), &fifo, 20).is_err());
    let magic = root.path().join("magic");
    symlink("/proc/self/fd/0", &magic).unwrap();
    assert!(read(root.path(), &magic, 20).is_err());
    assert!(read(Path::new("/dev"), Path::new("/dev/null"), 20).is_err());
}
