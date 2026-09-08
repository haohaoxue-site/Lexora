use std::process::ExitCode;

fn main() -> ExitCode {
    match lexora_buddy_pet::run_native_pet_sidecar_from_env() {
        Some(Ok(())) => ExitCode::SUCCESS,
        Some(Err(error)) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
        None => {
            eprintln!("lexora-buddy-pet requires --native-pet");
            ExitCode::from(2)
        }
    }
}
