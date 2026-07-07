use std::{fs, path::Path};

use crate::error::BuddyResult;

pub const BUDDY_APP_SETTINGS_CHANGED_EVENT: &str = "buddy-app-settings-changed";

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyAppSettings {
    pub allow_native_context_menu: bool,
    pub runtime_dialog_visibility: BuddyRuntimeDialogVisibility,
    pub config_path: String,
    pub language: String,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBuddyAppSettingsRequest {
    pub allow_native_context_menu: Option<bool>,
    pub runtime_dialog_visibility: Option<BuddyRuntimeDialogVisibility>,
    pub language: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRuntimeDialogVisibility {
    pub claude: bool,
    pub codex: bool,
}

#[derive(Clone, Debug, Default, serde::Deserialize, serde::Serialize)]
#[serde(default, rename_all = "camelCase")]
struct LexoraConfig {
    buddy: BuddyConfig,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(default, rename_all = "camelCase")]
struct BuddyConfig {
    allow_native_context_menu: bool,
    runtime_dialog_visibility: BuddyRuntimeDialogVisibility,
    language: String,
}

impl Default for BuddyRuntimeDialogVisibility {
    fn default() -> Self {
        Self {
            claude: false,
            codex: true,
        }
    }
}

fn default_language() -> String {
    "zh-CN".to_owned()
}

impl Default for BuddyConfig {
    fn default() -> Self {
        Self {
            allow_native_context_menu: false,
            runtime_dialog_visibility: BuddyRuntimeDialogVisibility::default(),
            language: default_language(),
        }
    }
}

pub fn read_buddy_app_settings(config_path: &Path) -> BuddyResult<BuddyAppSettings> {
    let config = read_lexora_config(config_path)?;

    Ok(create_buddy_app_settings(config_path, &config))
}

pub fn update_buddy_app_settings(
    config_path: &Path,
    request: UpdateBuddyAppSettingsRequest,
) -> BuddyResult<BuddyAppSettings> {
    let mut config = read_lexora_config(config_path)?;

    if let Some(allow_native_context_menu) = request.allow_native_context_menu {
        config.buddy.allow_native_context_menu = allow_native_context_menu;
    }

    if let Some(runtime_dialog_visibility) = request.runtime_dialog_visibility {
        config.buddy.runtime_dialog_visibility = runtime_dialog_visibility;
    }

    if let Some(language) = request.language {
        config.buddy.language = language;
    }

    write_lexora_config(config_path, &config)?;

    Ok(create_buddy_app_settings(config_path, &config))
}

fn read_lexora_config(config_path: &Path) -> BuddyResult<LexoraConfig> {
    if !config_path.exists() {
        return Ok(LexoraConfig::default());
    }

    let content = fs::read_to_string(config_path)?;
    if content.trim().is_empty() {
        return Ok(LexoraConfig::default());
    }

    Ok(serde_yaml::from_str(&content)?)
}

fn write_lexora_config(config_path: &Path, config: &LexoraConfig) -> BuddyResult<()> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(config_path, serde_yaml::to_string(config)?)?;

    Ok(())
}

fn create_buddy_app_settings(config_path: &Path, config: &LexoraConfig) -> BuddyAppSettings {
    BuddyAppSettings {
        allow_native_context_menu: config.buddy.allow_native_context_menu,
        runtime_dialog_visibility: config.buddy.runtime_dialog_visibility.clone(),
        config_path: path_to_string(config_path),
        language: config.buddy.language.clone(),
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        read_buddy_app_settings, update_buddy_app_settings, UpdateBuddyAppSettingsRequest,
    };

    #[test]
    fn defaults_to_intercepting_native_context_menu_when_config_is_missing() {
        let config_path = temporary_config_path();

        let settings = read_buddy_app_settings(&config_path).expect("read settings");

        assert!(!settings.allow_native_context_menu);
        assert!(settings.runtime_dialog_visibility.codex);
        assert!(!settings.runtime_dialog_visibility.claude);
        assert_eq!(settings.language, "zh-CN");
        assert_eq!(
            settings.config_path,
            config_path.to_string_lossy().into_owned()
        );
    }

    #[test]
    fn writes_and_reads_native_context_menu_preference_as_yaml() {
        let config_path = temporary_config_path();

        let updated = update_buddy_app_settings(
            &config_path,
            UpdateBuddyAppSettingsRequest {
                allow_native_context_menu: Some(true),
                runtime_dialog_visibility: None,
                language: None,
            },
        )
        .expect("update settings");
        let persisted = read_buddy_app_settings(&config_path).expect("read persisted settings");
        let content = std::fs::read_to_string(&config_path).expect("read config yaml");

        assert!(updated.allow_native_context_menu);
        assert!(persisted.allow_native_context_menu);
        assert!(content.contains("buddy:"));
        assert!(content.contains("allowNativeContextMenu: true"));
    }

    #[test]
    fn partially_updates_runtime_visibility() {
        let config_path = temporary_config_path();

        let updated = update_buddy_app_settings(
            &config_path,
            UpdateBuddyAppSettingsRequest {
                allow_native_context_menu: None,
                runtime_dialog_visibility: Some(super::BuddyRuntimeDialogVisibility {
                    claude: true,
                    codex: false,
                }),
                language: None,
            },
        )
        .expect("update settings");

        assert!(!updated.runtime_dialog_visibility.codex);
        assert!(updated.runtime_dialog_visibility.claude);
        assert!(!updated.allow_native_context_menu);
    }

    fn temporary_config_path() -> std::path::PathBuf {
        std::env::temp_dir()
            .join(format!("lexora-config-{}", uuid::Uuid::new_v4()))
            .join("config.yaml")
    }
}
