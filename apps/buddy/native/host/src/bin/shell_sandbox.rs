#[cfg(windows)]
fn main() {
    match lexora_buddy_host::shell_sandbox::run() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!(
                "{}",
                serde_json::json!({
                    "type": "error", "code": "SANDBOX_UNAVAILABLE", "nativeCode": error.raw_os_error()
                })
            );
            std::process::exit(if error.kind() == std::io::ErrorKind::ResourceBusy {
                126
            } else {
                125
            });
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("SANDBOX_UNSUPPORTED");
    std::process::exit(125);
}
