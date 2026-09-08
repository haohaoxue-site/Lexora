use std::sync::mpsc;

#[cfg(unix)]
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    os::unix::{
        fs::{FileTypeExt, PermissionsExt},
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use crate::error::{BuddyError, BuddyResult};

use super::{
    control_channel::NativePetControlRequest,
    control_protocol::parse_native_pet_control_request_kind,
};

#[cfg(unix)]
const NATIVE_PET_CONTROL_SOCKET_ENV: &str = "LEXORA_BUDDY_PET_SOCKET";
#[cfg(unix)]
const XDG_RUNTIME_DIR_ENV: &str = "XDG_RUNTIME_DIR";
#[cfg(unix)]
const NATIVE_PET_RUNTIME_DIR_NAME: &str = "lexora-buddy";
#[cfg(unix)]
const NATIVE_PET_CONTROL_SOCKET_FILE_NAME: &str = "native-pet.sock";
#[cfg(unix)]
const NATIVE_PET_CONTROL_RESPONSE_TIMEOUT_MS: u64 = 1_500;

#[cfg(unix)]
pub(super) fn spawn_native_pet_socket_control_reader(
    sender: mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    let listener = bind_native_pet_control_socket_listener()?;
    thread::spawn(move || {
        if let Err(error) = run_native_pet_socket_control_reader(listener, sender) {
            eprintln!("Lexora Buddy native pet control socket failed: {error}");
        }
    });

    Ok(())
}

#[cfg(not(unix))]
pub(super) fn spawn_native_pet_socket_control_reader(
    _sender: mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    Ok(())
}

#[cfg(unix)]
fn bind_native_pet_control_socket_listener() -> BuddyResult<UnixListener> {
    let socket_path = native_pet_control_socket_path()?;
    let uses_default_socket_path = std::env::var_os(NATIVE_PET_CONTROL_SOCKET_ENV).is_none();
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent)?;
        if uses_default_socket_path {
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;
        }
    }
    if socket_path.symlink_metadata().is_ok() {
        if native_pet_control_socket_is_active(&socket_path) {
            return Err(BuddyError::Runtime(format!(
                "native pet control socket is already active: {}",
                socket_path.display()
            )));
        }
        let file_type = socket_path.symlink_metadata()?.file_type();
        if !file_type.is_socket() {
            return Err(BuddyError::Runtime(format!(
                "native pet control socket path exists but is not a socket: {}",
                socket_path.display()
            )));
        }
        fs::remove_file(&socket_path)?;
    }

    Ok(UnixListener::bind(&socket_path)?)
}

#[cfg(unix)]
fn run_native_pet_socket_control_reader(
    listener: UnixListener,
    sender: mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    for stream in listener.incoming() {
        let stream = match stream {
            Ok(stream) => stream,
            Err(error) => {
                eprintln!("Lexora Buddy native pet control connection failed: {error}");
                continue;
            }
        };
        if let Err(error) = handle_native_pet_control_socket_stream(stream, &sender) {
            eprintln!("Lexora Buddy native pet control command failed: {error}");
        }
    }

    Ok(())
}

#[cfg(unix)]
fn native_pet_control_socket_is_active(socket_path: &Path) -> bool {
    UnixStream::connect(socket_path).is_ok()
}

#[cfg(unix)]
pub(super) fn native_pet_control_socket_path() -> BuddyResult<PathBuf> {
    if let Some(path) = std::env::var_os(NATIVE_PET_CONTROL_SOCKET_ENV) {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(BuddyError::Validation(format!(
                "{NATIVE_PET_CONTROL_SOCKET_ENV} must be an absolute path"
            )));
        }
        return Ok(path);
    }

    Ok(default_native_pet_control_socket_path())
}

#[cfg(unix)]
fn default_native_pet_control_socket_path() -> PathBuf {
    if let Some(runtime_dir) =
        std::env::var_os(XDG_RUNTIME_DIR_ENV).filter(|value| !value.is_empty())
    {
        return PathBuf::from(runtime_dir)
            .join(NATIVE_PET_RUNTIME_DIR_NAME)
            .join(NATIVE_PET_CONTROL_SOCKET_FILE_NAME);
    }

    std::env::temp_dir()
        .join(format!("lexora-buddy-uid-{}", native_pet_effective_uid()))
        .join(NATIVE_PET_CONTROL_SOCKET_FILE_NAME)
}

#[cfg(unix)]
fn native_pet_effective_uid() -> libc::uid_t {
    // SAFETY: geteuid has no preconditions and does not dereference pointers.
    unsafe { libc::geteuid() }
}

#[cfg(unix)]
fn handle_native_pet_control_socket_stream(
    stream: UnixStream,
    sender: &mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    let mut writer = stream.try_clone()?;
    let reader = BufReader::new(stream);
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }

        let Some(kind) = parse_native_pet_control_request_kind(&line) else {
            write_native_pet_control_socket_response(
                &mut writer,
                native_pet_control_error_response("invalid_control_message"),
            )?;
            continue;
        };

        let (request, response_receiver) = NativePetControlRequest::socket(kind);
        if sender.send(request).is_err() {
            write_native_pet_control_socket_response(
                &mut writer,
                native_pet_control_error_response("control_channel_closed"),
            )?;
            continue;
        }

        let response = response_receiver
            .recv_timeout(Duration::from_millis(
                NATIVE_PET_CONTROL_RESPONSE_TIMEOUT_MS,
            ))
            .unwrap_or_else(|_| native_pet_control_error_response("control_response_timeout"));
        write_native_pet_control_socket_response(&mut writer, response)?;
    }

    Ok(())
}

#[cfg(unix)]
fn write_native_pet_control_socket_response(
    writer: &mut UnixStream,
    response: serde_json::Value,
) -> BuddyResult<()> {
    let serialized = serde_json::to_string(&response)?;
    writer.write_all(serialized.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
}

#[cfg(unix)]
fn native_pet_control_error_response(error: &'static str) -> serde_json::Value {
    serde_json::json!({
        "ok": false,
        "error": error,
    })
}

#[cfg(test)]
#[cfg(unix)]
#[path = "__tests__/socket_control.rs"]
mod tests;
