use std::{io, process::ExitCode};

fn main() -> ExitCode {
    match lexora_buddy_host::private_directories::run(io::stdin().lock(), io::stdout().lock()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
