static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[test]
fn detects_active_native_pet_control_socket() {
    use std::os::unix::net::UnixListener;

    let socket_path = std::env::temp_dir().join(format!(
        "lexora-buddy-native-pet-test-{}-{}.sock",
        std::process::id(),
        "active"
    ));
    let _ = std::fs::remove_file(&socket_path);
    let listener = UnixListener::bind(&socket_path).expect("bind test socket");

    assert!(super::native_pet_control_socket_is_active(&socket_path));

    drop(listener);
    let _ = std::fs::remove_file(socket_path);
}

#[test]
fn rejects_starting_control_reader_when_socket_is_already_active() {
    use std::os::unix::net::UnixListener;

    let _guard = ENV_LOCK.lock().expect("env lock");
    let previous_socket_path = std::env::var_os(super::NATIVE_PET_CONTROL_SOCKET_ENV);
    let socket_path = std::env::temp_dir().join(format!(
        "lexora-buddy-native-pet-test-{}-reader-active.sock",
        std::process::id(),
    ));
    let _ = std::fs::remove_file(&socket_path);
    let listener = UnixListener::bind(&socket_path).expect("bind active test socket");
    std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, &socket_path);
    let (sender, _receiver) = std::sync::mpsc::channel();

    let error = super::spawn_native_pet_socket_control_reader(sender)
        .expect_err("active control socket should block a second reader");

    assert!(error
        .to_string()
        .contains("native pet control socket is already active"));

    drop(listener);
    let _ = std::fs::remove_file(socket_path);
    match previous_socket_path {
        Some(value) => std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, value),
        None => std::env::remove_var(super::NATIVE_PET_CONTROL_SOCKET_ENV),
    }
}

#[test]
fn defaults_native_pet_control_socket_to_xdg_runtime_dir() {
    let _guard = ENV_LOCK.lock().expect("env lock");
    let previous_runtime_dir = std::env::var_os("XDG_RUNTIME_DIR");
    let runtime_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-xdg-runtime-test-{}",
        std::process::id(),
    ));
    std::env::set_var("XDG_RUNTIME_DIR", &runtime_dir);

    let socket_path = super::default_native_pet_control_socket_path();

    assert_eq!(
        socket_path,
        runtime_dir.join("lexora-buddy").join("native-pet.sock"),
    );
    assert_eq!(
        socket_path.file_name().and_then(|value| value.to_str()),
        Some("native-pet.sock"),
    );

    match previous_runtime_dir {
        Some(value) => std::env::set_var("XDG_RUNTIME_DIR", value),
        None => std::env::remove_var("XDG_RUNTIME_DIR"),
    }
}

#[test]
fn falls_back_native_pet_control_socket_to_private_uid_temp_path_without_xdg_runtime_dir() {
    let _guard = ENV_LOCK.lock().expect("env lock");
    let previous_runtime_dir = std::env::var_os("XDG_RUNTIME_DIR");
    std::env::remove_var("XDG_RUNTIME_DIR");

    let socket_path = super::default_native_pet_control_socket_path();
    let parent = socket_path.parent().expect("socket parent");
    let parent_name = parent
        .file_name()
        .and_then(|value| value.to_str())
        .expect("socket parent name");

    assert!(socket_path.starts_with(std::env::temp_dir()));
    assert_eq!(
        parent_name,
        format!("lexora-buddy-uid-{}", super::native_pet_effective_uid()),
    );
    assert_eq!(
        socket_path.file_name().and_then(|value| value.to_str()),
        Some("native-pet.sock"),
    );

    match previous_runtime_dir {
        Some(value) => std::env::set_var("XDG_RUNTIME_DIR", value),
        None => std::env::remove_var("XDG_RUNTIME_DIR"),
    }
}

#[test]
fn rejects_relative_native_pet_control_socket_override() {
    let _guard = ENV_LOCK.lock().expect("env lock");
    let previous_socket_path = std::env::var_os(super::NATIVE_PET_CONTROL_SOCKET_ENV);
    std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, "native-pet.sock");

    let error = super::native_pet_control_socket_path()
        .expect_err("relative socket override should be rejected");

    assert!(error
        .to_string()
        .contains("LEXORA_BUDDY_PET_SOCKET must be an absolute path"));

    match previous_socket_path {
        Some(value) => std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, value),
        None => std::env::remove_var(super::NATIVE_PET_CONTROL_SOCKET_ENV),
    }
}
