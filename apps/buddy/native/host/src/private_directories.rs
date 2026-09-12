use std::io::{Read, Write};

use serde::Deserialize;

#[cfg(windows)]
mod windows;

const MAX_REQUEST_BYTES: u64 = 256 * 1024;

#[derive(Debug, PartialEq, thiserror::Error)]
pub enum DirectoryError {
    #[error("PRIVATE_DIRECTORIES_INVALID")]
    Invalid,
    #[error("PRIVATE_DIRECTORIES_UNSAFE")]
    Unsafe,
    #[error("PRIVATE_DIRECTORIES_FAILED")]
    Failed,
    #[error("PRIVATE_DIRECTORIES_UNAVAILABLE")]
    Unavailable,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    paths: Vec<String>,
}

fn read_request(input: impl Read) -> Result<Request, DirectoryError> {
    let mut bytes = Vec::new();
    input
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| DirectoryError::Invalid)?;
    if bytes.len() as u64 > MAX_REQUEST_BYTES {
        return Err(DirectoryError::Invalid);
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|_| DirectoryError::Invalid)?;
    if request.paths.is_empty() || request.paths.len() > 64 {
        return Err(DirectoryError::Invalid);
    }
    for path in &request.paths {
        directory_parts(path)?;
    }
    Ok(request)
}

fn directory_parts(path: &str) -> Result<(String, Vec<&str>), DirectoryError> {
    if !crate::windows_path::valid(path) {
        return Err(DirectoryError::Invalid);
    }
    let (root, rest) = if let Some(unc) = path.strip_prefix("\\\\") {
        let mut parts = unc.splitn(3, '\\');
        let server = parts.next().ok_or(DirectoryError::Invalid)?;
        let share = parts.next().ok_or(DirectoryError::Invalid)?;
        (
            format!("\\\\?\\UNC\\{server}\\{share}\\"),
            parts.next().unwrap_or_default(),
        )
    } else {
        (format!("\\\\?\\{}", &path[..3]), &path[3..])
    };
    let parts: Vec<_> = rest.trim_end_matches('\\').split('\\').collect();
    if parts.len() > 256
        || parts
            .iter()
            .any(|part| part.is_empty() || part.encode_utf16().count() > 255)
    {
        return Err(DirectoryError::Invalid);
    }
    Ok((root, parts))
}

pub fn run(input: impl Read, output: impl Write) -> Result<(), DirectoryError> {
    let request = read_request(input)?;
    #[cfg(windows)]
    {
        windows::ensure(&request.paths)?;
        let mut output = output;
        output
            .write_all(b"{\"ok\":true}")
            .map_err(|_| DirectoryError::Failed)
    }
    #[cfg(not(windows))]
    {
        let _ = (request, output);
        Err(DirectoryError::Unavailable)
    }
}

#[cfg(windows)]
pub(crate) fn ensure(paths: &[String]) -> Result<(), DirectoryError> {
    windows::ensure(paths)
}

#[cfg(test)]
#[path = "../__tests__/private_directories.rs"]
mod tests;
