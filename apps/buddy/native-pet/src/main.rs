fn main() {
    if run_cli_command() {
        return;
    }

    eprintln!("lexora-buddy-pet requires --native-pet or a pet verification command");
    std::process::exit(2);
}

fn run_cli_command() -> bool {
    macro_rules! run_output_command {
        ($command:expr) => {
            if let Some(result) = $command {
                match result {
                    Ok(output) => println!("{output}"),
                    Err(error) => {
                        eprintln!("{error}");
                        std::process::exit(1);
                    }
                }
                return true;
            }
        };
    }

    run_output_command!(lexora_buddy_pet::run_native_pet_smoke_command_from_env());
    run_output_command!(lexora_buddy_pet::run_native_pet_drag_replay_command_from_env());

    if let Some(result) = lexora_buddy_pet::run_native_pet_sidecar_from_env() {
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return true;
    }

    false
}
