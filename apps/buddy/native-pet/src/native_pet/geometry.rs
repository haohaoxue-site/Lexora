use super::animation::{
    NativePetAnimationPlayback, NativePetAnimationRenderProfile, NativePetAnimationSet,
    NativePetSpritesheetGeometry,
};
use super::coordinates::NativePetLogicalSize;

const PET_WINDOW_SIDE_PADDING: i32 = 48;
const PET_WINDOW_TOP_PADDING: i32 = 48;
const DEFAULT_PET_DISPLAY_SCALE: f64 = 0.88;
pub(super) const PET_FRAME_BOTTOM_MARGIN: i32 = 28;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetFacing {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetFrameRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: i32,
    pub(super) height: i32,
}

pub(super) fn native_pet_frame_rect(
    geometry: NativePetSpritesheetGeometry,
    frame_index: usize,
) -> NativePetFrameRect {
    let column = (frame_index % geometry.sheet_columns()) as i32;
    let row = (frame_index / geometry.sheet_columns()) as i32;

    NativePetFrameRect {
        x: column * geometry.frame_width(),
        y: row * geometry.frame_height(),
        width: geometry.frame_width(),
        height: geometry.frame_height(),
    }
}

pub(super) fn native_pet_target_size(geometry: NativePetSpritesheetGeometry) -> (i32, i32) {
    (
        (geometry.frame_width() as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
        (geometry.frame_height() as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
    )
}

pub(super) fn native_pet_window_size(geometry: NativePetSpritesheetGeometry) -> (i32, i32) {
    let size = native_pet_window_logical_size(geometry);
    (size.width, size.height)
}

pub(super) fn native_pet_window_logical_size(
    geometry: NativePetSpritesheetGeometry,
) -> NativePetLogicalSize {
    let (target_width, target_height) = native_pet_target_size(geometry);

    NativePetLogicalSize::new(
        target_width + PET_WINDOW_SIDE_PADDING * 2,
        target_height + PET_WINDOW_TOP_PADDING + PET_FRAME_BOTTOM_MARGIN,
    )
}

pub(super) fn native_pet_bob_offset(
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
) -> i32 {
    if matches!(
        animations.render_profile_for_playback(playback),
        NativePetAnimationRenderProfile::GrabStart
            | NativePetAnimationRenderProfile::Drag
            | NativePetAnimationRenderProfile::RunLeft
            | NativePetAnimationRenderProfile::RunRight
            | NativePetAnimationRenderProfile::Dance
            | NativePetAnimationRenderProfile::Sleep
    ) {
        return 0;
    }

    match playback.frame_phase % 8 {
        1 | 2 => -4,
        3 | 4 => 3,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{native_pet_bob_offset, native_pet_frame_rect};
    use crate::native_pet::{
        animation::{
            NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
            NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
            NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile,
            NativePetAnimationSet, NativePetManifest, NativePetSpritesheetGeometry,
        },
        assets::load_default_pet_animation_set,
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    #[test]
    fn maps_native_pet_frame_index_to_spritesheet_rect() {
        let geometry =
            NativePetSpritesheetGeometry::new(192, 208, 8, 20).expect("test geometry is valid");
        let first = native_pet_frame_rect(geometry, 0);
        assert_eq!(first.x, 0);
        assert_eq!(first.y, 0);
        assert_eq!(first.width, 192);
        assert_eq!(first.height, 208);

        let next_row = native_pet_frame_rect(geometry, geometry.sheet_columns());
        assert_eq!(next_row.x, 0);
        assert_eq!(next_row.y, 208);
    }

    #[test]
    fn maps_native_pet_frame_index_with_manifest_geometry() {
        let geometry =
            NativePetSpritesheetGeometry::new(200, 300, 5, 4).expect("test geometry is valid");

        let first = native_pet_frame_rect(geometry, 0);
        assert_eq!(
            first,
            super::NativePetFrameRect {
                x: 0,
                y: 0,
                width: 200,
                height: 300
            }
        );

        let next_row = native_pet_frame_rect(geometry, 5);
        assert_eq!(
            next_row,
            super::NativePetFrameRect {
                x: 0,
                y: 300,
                width: 200,
                height: 300
            }
        );
    }

    #[test]
    fn keeps_sleep_on_a_stable_resting_baseline_without_idle_bob() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut idle = animations.playback_for_test_key("idle");
        idle.frame_phase = 2;
        let mut sleep = animations.playback_for_test_key("sleep");
        sleep.frame_phase = 2;

        assert_ne!(native_pet_bob_offset(&animations, idle), 0);
        assert_eq!(native_pet_bob_offset(&animations, sleep), 0);
    }

    #[test]
    fn manifest_only_sleep_uses_stable_resting_baseline_without_idle_bob() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture manifest-only sleep",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_sleep_bob",
                "row": 0,
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with fixture sleep");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_sleep_bob".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Sleep,
                local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("fixture animation set loads");
        let key = NativePetAnimationKey::parse("future_sleep_bob").expect("valid key");
        let mut sleep = NativePetAnimationPlayback::from_target(
            animations
                .animation_target_for_key(&key)
                .expect("fixture sleep target exists"),
        );
        sleep.frame_phase = 2;

        assert_eq!(native_pet_bob_offset(&animations, sleep), 0);
    }
}
