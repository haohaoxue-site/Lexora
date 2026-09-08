use std::collections::HashMap;

use super::{native_pet_bob_offset, native_pet_frame_rect};
use crate::native_pet::{
    animation::{
        NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
        NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
        NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile, NativePetAnimationSet,
        NativePetManifest, NativePetSpritesheetGeometry,
    },
    assets::load_default_pet_animation_set,
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

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
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
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
    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
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
