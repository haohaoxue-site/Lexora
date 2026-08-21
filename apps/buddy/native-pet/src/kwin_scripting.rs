use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};

use crate::error::{BuddyError, BuddyResult};

const KWIN_SCRIPTING_SERVICE: &str = "org.kde.KWin";
const KWIN_SCRIPTING_PATH: &str = "/Scripting";
const KWIN_SCRIPTING_LOAD_SCRIPT_METHOD: &str = "org.kde.kwin.Scripting.loadScript";
const KWIN_SCRIPTING_START_METHOD: &str = "org.kde.kwin.Scripting.start";
const KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD: &str = "org.kde.kwin.Scripting.unloadScript";

pub(crate) fn run_temporary_kwin_script(
    plugin_name: &str,
    script: &str,
    failure_message: &'static str,
) -> BuddyResult<()> {
    let script_file = TemporaryKWinScript::create(script)?;

    run_kwin_script(script_file.path(), plugin_name, failure_message)
}

struct TemporaryKWinScript {
    path: PathBuf,
}

impl TemporaryKWinScript {
    fn create(script: &str) -> BuddyResult<Self> {
        let path =
            std::env::temp_dir().join(format!("lexora-buddy-kwin-{}.js", uuid::Uuid::now_v7()));
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;
        file.write_all(script.as_bytes())
            .and_then(|()| file.flush())
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;

        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryKWinScript {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn run_kwin_script(
    script_path: &std::path::Path,
    plugin_name: &str,
    failure_message: &'static str,
) -> BuddyResult<()> {
    run_kwin_script_with(script_path, plugin_name, failure_message, run_qdbus6)
}

fn run_kwin_script_with(
    script_path: &Path,
    plugin_name: &str,
    failure_message: &'static str,
    mut run: impl FnMut(&[&str], &'static str) -> BuddyResult<String>,
) -> BuddyResult<()> {
    let script_path = script_path
        .to_str()
        .ok_or_else(|| BuddyError::Runtime("KWin script path is not valid UTF-8".to_owned()))?;
    let _ = run(
        &[
            KWIN_SCRIPTING_SERVICE,
            KWIN_SCRIPTING_PATH,
            KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
            plugin_name,
        ],
        failure_message,
    );
    run(
        &[
            KWIN_SCRIPTING_SERVICE,
            KWIN_SCRIPTING_PATH,
            KWIN_SCRIPTING_LOAD_SCRIPT_METHOD,
            script_path,
            plugin_name,
        ],
        failure_message,
    )?;
    let start_result = run(
        &[
            KWIN_SCRIPTING_SERVICE,
            KWIN_SCRIPTING_PATH,
            KWIN_SCRIPTING_START_METHOD,
        ],
        failure_message,
    );
    let unload_result = run(
        &[
            KWIN_SCRIPTING_SERVICE,
            KWIN_SCRIPTING_PATH,
            KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
            plugin_name,
        ],
        failure_message,
    );

    match start_result {
        Ok(_) => unload_result.map(|_| ()),
        Err(error) => Err(error),
    }
}

fn run_qdbus6(args: &[&str], failure_message: &'static str) -> BuddyResult<String> {
    let mut command = Command::new(qdbus6_binary());
    if let Some(session_bus_address) = session_bus_address() {
        command.env("DBUS_SESSION_BUS_ADDRESS", session_bus_address);
    }

    let output = command
        .args(args.iter().copied())
        .output()
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map_err(|error| BuddyError::Runtime(error.to_string()));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    Err(BuddyError::Runtime(if stderr.is_empty() {
        failure_message.to_owned()
    } else {
        stderr
    }))
}

fn qdbus6_binary() -> &'static str {
    if std::path::Path::new("/usr/bin/qdbus6").exists() {
        "/usr/bin/qdbus6"
    } else {
        "qdbus6"
    }
}

fn session_bus_address() -> Option<String> {
    std::env::var("DBUS_SESSION_BUS_ADDRESS")
        .ok()
        .filter(|address| !address.is_empty())
        .or_else(|| {
            std::env::var("XDG_RUNTIME_DIR")
                .ok()
                .filter(|runtime_dir| !runtime_dir.is_empty())
                .map(|runtime_dir| format!("unix:path={runtime_dir}/bus"))
        })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn start_failure_still_unloads_the_temporary_kwin_plugin() {
        let mut methods = Vec::new();

        let error = run_kwin_script_with(
            Path::new("/tmp/lexora-buddy-kwin-test.js"),
            "lexora-buddy-test",
            "KWin script failed",
            |args, _| {
                methods.push(args[2].to_owned());
                if args[2] == KWIN_SCRIPTING_START_METHOD {
                    return Err(BuddyError::Runtime("KWin start failed".to_owned()));
                }
                Ok(String::new())
            },
        )
        .expect_err("start failure should be returned");

        assert_eq!(error.to_string(), "runtime failed: KWin start failed");
        assert_eq!(
            methods,
            vec![
                KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
                KWIN_SCRIPTING_LOAD_SCRIPT_METHOD,
                KWIN_SCRIPTING_START_METHOD,
                KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
            ]
        );
    }
}
