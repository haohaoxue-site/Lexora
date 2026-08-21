use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use serde::{Deserialize, Serialize};

use crate::error::{BuddyError, BuddyResult};

use super::coordinates::NativePetPosition;

const NATIVE_PET_POSITION_STATE_VERSION: u8 = 1;
const NATIVE_PET_POSITION_STATE_PATH_ENV: &str = "LEXORA_BUDDY_PET_STATE_PATH";
const XDG_STATE_HOME_ENV: &str = "XDG_STATE_HOME";
const HOME_ENV: &str = "HOME";

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct NativePetPositionStateFile {
    version: u8,
    position: NativePetStoredPosition,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct NativePetStoredPosition {
    x: i32,
    y: i32,
}

pub(super) fn resolve_native_pet_position_state_path() -> BuddyResult<PathBuf> {
    if let Some(value) =
        env::var_os(NATIVE_PET_POSITION_STATE_PATH_ENV).filter(|value| !value.is_empty())
    {
        return require_absolute_path(PathBuf::from(value), NATIVE_PET_POSITION_STATE_PATH_ENV);
    }

    let state_home = match env::var_os(XDG_STATE_HOME_ENV).filter(|value| !value.is_empty()) {
        Some(value) => require_absolute_path(PathBuf::from(value), XDG_STATE_HOME_ENV)?,
        None => {
            let home = env::var_os(HOME_ENV)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| BuddyError::Validation("HOME is required".to_owned()))?;
            require_absolute_path(PathBuf::from(home), HOME_ENV)?.join(".local/state")
        }
    };

    Ok(state_home.join("lexora-buddy/pet-state.json"))
}

pub(super) fn load_native_pet_position_state(
    path: &Path,
) -> BuddyResult<Option<NativePetPosition>> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    parse_native_pet_position_state(&content).map(Some)
}

pub(super) fn save_native_pet_position_state(
    path: &Path,
    position: NativePetPosition,
) -> BuddyResult<()> {
    let parent = path.parent().ok_or_else(|| {
        BuddyError::Validation("native pet state path has no parent directory".to_owned())
    })?;
    fs::create_dir_all(parent)?;
    #[cfg(unix)]
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;

    let state = NativePetPositionStateFile {
        version: NATIVE_PET_POSITION_STATE_VERSION,
        position: NativePetStoredPosition {
            x: position.x,
            y: position.y,
        },
    };
    let content = serde_json::to_vec(&state)?;
    let temporary_path = path.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let write_result = write_private_state_file(&temporary_path, &content)
        .and_then(|()| fs::rename(&temporary_path, path).map_err(BuddyError::from));
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

pub(super) fn clear_native_pet_position_state(path: &Path) -> BuddyResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn should_persist_native_pet_rest_position(
    pending_user_drag: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    is_edge_runout_active: bool,
    is_scripted_walk_active: bool,
) -> bool {
    pending_user_drag
        && !is_dragging
        && !is_inertia_active
        && !is_edge_runout_active
        && !is_scripted_walk_active
}

fn parse_native_pet_position_state(content: &str) -> BuddyResult<NativePetPosition> {
    let state = serde_json::from_str::<NativePetPositionStateFile>(content)?;
    if state.version != NATIVE_PET_POSITION_STATE_VERSION {
        return Err(BuddyError::Validation(format!(
            "unsupported native pet position state version: {}",
            state.version
        )));
    }

    Ok(NativePetPosition {
        x: state.position.x,
        y: state.position.y,
    })
}

fn write_private_state_file(path: &Path, content: &[u8]) -> BuddyResult<()> {
    let mut options = fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path)?;
    file.write_all(content)?;
    file.sync_all()?;
    Ok(())
}

fn require_absolute_path(path: PathBuf, name: &str) -> BuddyResult<PathBuf> {
    if path.is_absolute() {
        Ok(path)
    } else {
        Err(BuddyError::Validation(format!(
            "{name} must be an absolute path"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::coordinates::NativePetPosition;

    #[test]
    fn parses_versioned_rest_position_state() {
        let position =
            parse_native_pet_position_state(r#"{"version":1,"position":{"x":320,"y":240}}"#)
                .expect("parse position state");

        assert_eq!(position, NativePetPosition { x: 320, y: 240 });
    }

    #[test]
    fn rejects_unknown_position_state_versions() {
        let result =
            parse_native_pet_position_state(r#"{"version":2,"position":{"x":320,"y":240}}"#);

        assert!(result.is_err());
    }

    #[test]
    fn persists_only_after_user_drag_motion_has_stabilized() {
        assert!(should_persist_native_pet_rest_position(
            true, false, false, false, false,
        ));
        assert!(!should_persist_native_pet_rest_position(
            false, false, false, false, false,
        ));

        for motion in [
            [true, false, false, false],
            [false, true, false, false],
            [false, false, true, false],
            [false, false, false, true],
        ] {
            assert!(!should_persist_native_pet_rest_position(
                true, motion[0], motion[1], motion[2], motion[3],
            ));
        }
    }
}
