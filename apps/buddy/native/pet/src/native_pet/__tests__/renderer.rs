use std::collections::HashMap;

use super::pose::{NativePetRenderProfile, NativePetRenderProfileKind};
use super::{native_pet_pointer_hits_visible_frame, native_pet_should_mirror_frame};
use crate::native_pet::{
    animation::{
        NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
        NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
        NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile, NativePetAnimationSet,
        NativePetManifest,
    },
    assets::load_default_pet_animation_set,
    geometry::NativePetFacing,
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

#[test]
fn uses_explicit_directional_frames_without_runtime_mirroring() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let drag = animations.playback_for_test_key("drag");
    let run_left = animations.playback_for_test_key("run_left");
    let run_right = animations.playback_for_test_key("run_right");

    assert!(!native_pet_should_mirror_frame(
        drag,
        NativePetFacing::Right
    ));
    assert!(!native_pet_should_mirror_frame(
        run_left,
        NativePetFacing::Right
    ));
    assert!(!native_pet_should_mirror_frame(
        run_right,
        NativePetFacing::Left
    ));
}

#[test]
fn projects_manifest_handles_to_renderer_profiles_once() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let trip_left = NativePetRenderProfile::from_playback(
        &animations,
        animations.playback_for_test_key("trip_fall_left"),
    );
    let trip_right = NativePetRenderProfile::from_playback(
        &animations,
        animations.playback_for_test_key("trip_fall_right"),
    );
    let cast = NativePetRenderProfile::from_playback(
        &animations,
        animations.playback_for_test_key("cast"),
    );
    let run_right = NativePetRenderProfile::from_playback(
        &animations,
        animations.playback_for_test_key("run_right"),
    );

    assert_eq!(trip_left.kind(), NativePetRenderProfileKind::TripFall);
    assert_eq!(trip_right.kind(), NativePetRenderProfileKind::TripFall);
    assert_eq!(cast.kind(), NativePetRenderProfileKind::Cast);
    assert_eq!(run_right.kind(), NativePetRenderProfileKind::RunRight);
}

#[test]
fn projects_manifest_handle_playback_to_renderer_profile_from_runtime_profile() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future run",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_run",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future run");
    let mut profiles = HashMap::new();
    profiles.insert(
        "future_run".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::RunRight,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );
    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
        .expect("manifest with future run loads");
    let key = NativePetAnimationKey::parse("future_run").expect("valid animation key");
    let handle = animations
        .animation_handle_for_key(&key)
        .expect("future run animation exists");
    let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

    let profile = NativePetRenderProfile::from_playback(&animations, playback);

    assert_eq!(profile.kind(), NativePetRenderProfileKind::RunRight);
}

#[test]
fn hit_tests_visible_frame_alpha_instead_of_window_rectangle() {
    let pixels =
        glib::Bytes::from_owned(vec![0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    let frame =
        gdk_pixbuf::Pixbuf::from_bytes(&pixels, gdk_pixbuf::Colorspace::Rgb, true, 8, 2, 2, 8);

    assert!(native_pet_pointer_hits_visible_frame(&frame, 1.25, 0.25));
    assert!(!native_pet_pointer_hits_visible_frame(&frame, 0.25, 0.25));
    assert!(!native_pet_pointer_hits_visible_frame(&frame, 1.25, 1.25));
    assert!(!native_pet_pointer_hits_visible_frame(&frame, -0.25, 0.25));
}

#[test]
fn visible_frame_hit_test_rejects_non_finite_coordinates() {
    let pixels = glib::Bytes::from_owned(vec![255, 255, 255, 255, 255, 255, 255, 255]);
    let frame =
        gdk_pixbuf::Pixbuf::from_bytes(&pixels, gdk_pixbuf::Colorspace::Rgb, true, 8, 2, 1, 8);

    assert!(!native_pet_pointer_hits_visible_frame(
        &frame,
        f64::NAN,
        0.0
    ));
}
