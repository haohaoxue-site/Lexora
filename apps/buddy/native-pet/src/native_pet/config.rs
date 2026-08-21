use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;

use crate::error::{BuddyError, BuddyResult};

const LEXORA_HOME_ENV: &str = "LEXORA_HOME";
const HOME_ENV: &str = "HOME";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub(super) struct NativePetConfig {
    pub(super) always_on_top: bool,
    pub(super) enabled: bool,
    pub(super) remember_position: bool,
}

impl Default for NativePetConfig {
    fn default() -> Self {
        Self {
            always_on_top: true,
            enabled: true,
            remember_position: true,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct LexoraConfigFile {
    #[serde(default)]
    pet: NativePetConfig,
}

pub(super) fn resolve_native_pet_config_path() -> BuddyResult<PathBuf> {
    let lexora_home = match env::var_os(LEXORA_HOME_ENV).filter(|value| !value.is_empty()) {
        Some(value) => require_absolute_path(PathBuf::from(value), LEXORA_HOME_ENV)?,
        None => {
            let home = env::var_os(HOME_ENV)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| BuddyError::Validation("HOME is required".to_owned()))?;
            require_absolute_path(PathBuf::from(home), HOME_ENV)?.join(".lexora")
        }
    };

    Ok(lexora_home.join("config.toml"))
}

pub(super) fn load_native_pet_config(path: &Path) -> BuddyResult<NativePetConfig> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(NativePetConfig::default());
        }
        Err(error) => return Err(error.into()),
    };

    parse_native_pet_config(&content)
}

fn parse_native_pet_config(content: &str) -> BuddyResult<NativePetConfig> {
    toml::from_str::<LexoraConfigFile>(content)
        .map(|config| config.pet)
        .map_err(|error| BuddyError::Validation(format!("invalid Lexora config: {error}")))
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

    #[test]
    fn missing_pet_section_uses_enabled_core_defaults() {
        let config = parse_native_pet_config("[desktop]\ntheme = \"dark\"\n")
            .expect("parse config without pet section");

        assert_eq!(config, NativePetConfig::default());
    }

    #[test]
    fn parses_core_pet_preferences_from_shared_config() {
        let config = parse_native_pet_config(
            "[pet]\nenabled = false\nalways_on_top = false\nremember_position = false\n",
        )
        .expect("parse pet config");

        assert_eq!(
            config,
            NativePetConfig {
                always_on_top: false,
                enabled: false,
                remember_position: false,
            }
        );
    }
}
