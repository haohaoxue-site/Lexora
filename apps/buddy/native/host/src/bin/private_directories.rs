use std::{io, process::ExitCode};

fn main() -> ExitCode {
    match lexora_buddy_host::private_directories::run(io::stdin().lock(), io::stdout().lock()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let _ = serde_json::to_writer(io::stderr().lock(), &error);
            ExitCode::FAILURE
        }
    }
}
