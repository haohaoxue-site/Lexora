use serde::Deserialize;

use crate::error::{BuddyError, BuddyResult};

use super::{PET_FRAME_HEIGHT, PET_FRAME_WIDTH, PET_SPRITESHEET_COLUMNS};

#[derive(Debug, Deserialize)]
pub(in crate::native_pet) struct NativePetManifest {
    pub(in crate::native_pet) animations: Vec<NativePetManifestAnimation>,
    pub(in crate::native_pet) frame: NativePetManifestFrame,
    pub(in crate::native_pet) sheet: NativePetManifestSheet,
}

#[derive(Debug, Deserialize)]
pub(in crate::native_pet) struct NativePetManifestFrame {
    pub(in crate::native_pet) height: i32,
    pub(in crate::native_pet) width: i32,
}

#[derive(Debug, Deserialize)]
pub(in crate::native_pet) struct NativePetManifestSheet {
    pub(in crate::native_pet) columns: usize,
    pub(in crate::native_pet) rows: usize,
}

impl NativePetManifestSheet {
    pub(super) fn frame_count(&self) -> usize {
        self.columns * self.rows
    }
}

#[derive(Debug, Deserialize)]
pub(in crate::native_pet) struct NativePetManifestAnimation {
    pub(super) fps: Option<u32>,
    pub(super) frames: Vec<NativePetManifestAnimationFrame>,
    #[serde(rename = "loop")]
    pub(super) loop_animation: bool,
    pub(super) name: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
pub(super) enum NativePetManifestAnimationFrame {
    Index(usize),
    Timed {
        index: usize,
        #[serde(rename = "durationMs")]
        duration_ms: Option<u64>,
    },
}

impl NativePetManifestAnimationFrame {
    pub(super) fn index(self) -> usize {
        match self {
            Self::Index(index) => index,
            Self::Timed { index, .. } => index,
        }
    }

    pub(super) fn duration_ms(self) -> Option<u64> {
        match self {
            Self::Index(_) => None,
            Self::Timed { duration_ms, .. } => duration_ms,
        }
    }
}

pub(super) fn validate_native_pet_manifest_shape(manifest: &NativePetManifest) -> BuddyResult<()> {
    if manifest.frame.width != PET_FRAME_WIDTH || manifest.frame.height != PET_FRAME_HEIGHT {
        return Err(BuddyError::Runtime(
            "native pet manifest frame size does not match bundled renderer".to_owned(),
        ));
    }

    if manifest.sheet.columns != PET_SPRITESHEET_COLUMNS {
        return Err(BuddyError::Runtime(
            "native pet manifest sheet columns do not match bundled renderer".to_owned(),
        ));
    }

    if manifest.sheet.rows == 0 {
        return Err(BuddyError::Runtime(
            "native pet manifest sheet rows must be positive".to_owned(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::animation::NativePetAnimationName;

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../../packages/assets/buddy/pets/default/manifest.json");

    #[test]
    fn bundled_manifest_uses_uniform_fps_only_for_continuous_motion() {
        let manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let uniform_fps_animations = manifest
            .animations
            .iter()
            .filter_map(|animation| animation.fps.map(|_| animation.name.as_str()))
            .collect::<Vec<_>>();

        assert_eq!(
            uniform_fps_animations,
            vec!["run_left", "run_right", "drag"]
        );

        for animation in manifest
            .animations
            .iter()
            .filter(|animation| !uniform_fps_animations.contains(&animation.name.as_str()))
        {
            assert!(
                animation
                    .frames
                    .iter()
                    .all(|frame| frame.duration_ms().is_some()),
                "{} should use per-frame timing",
                animation.name
            );
        }
    }

    #[test]
    fn bundled_manifest_exposes_only_active_animation_controls() {
        let manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let animation_names = manifest
            .animations
            .iter()
            .map(|animation| animation.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            animation_names,
            vec![
                "idle",
                "run_left",
                "run_right",
                "drag",
                "grab_start",
                "celebrate",
                "sleep",
                "wake",
                "thinking",
                "approval",
                "sad",
                "reassure",
                "working",
                "explain",
                "tap",
                "hover",
                "curious",
                "trip_fall_left",
                "fallen_idle_left",
                "fallen_get_up_left",
                "trip_fall_right",
                "fallen_idle_right",
                "fallen_get_up_right",
                "stumble_recover_left",
                "stumble_recover_right",
            ]
        );
        for active_name in animation_names {
            assert!(NativePetAnimationName::from_manifest_key(active_name).is_some());
        }
    }
}
