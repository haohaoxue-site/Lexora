fn main() {
    #[cfg(windows)]
    let result = lexora_buddy_host::runtime_guard::run();
    #[cfg(not(windows))]
    let result: Result<(), &str> = Err("RUNTIME_GUARD_UNAVAILABLE");
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
