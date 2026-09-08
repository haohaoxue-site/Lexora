use super::{
    manifest::{
        NativePetManifest, NativePetManifestAnimation, NativePetManifestAnimationFrame,
        NativePetTimedManifestAnimationFrame,
    },
    native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
    NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
    NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
    NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile, NativePetAnimationSet,
    NativePetAnimationTarget, NativePetLifecycleAnimationDecision,
    NativePetPlaybackFallbackDecision,
};
use crate::native_pet::assets::load_default_pet_animation_set;
use std::collections::HashMap;

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

fn test_target(animations: &NativePetAnimationSet, manifest_key: &str) -> NativePetAnimationTarget {
    animations.animation_target_for_test_key(manifest_key)
}

fn test_playback(
    animations: &NativePetAnimationSet,
    manifest_key: &str,
) -> NativePetAnimationPlayback {
    animations.playback_for_test_key(manifest_key)
}

fn lifecycle_decision(
    animations: &NativePetAnimationSet,
    manifest_key: &str,
) -> NativePetLifecycleAnimationDecision {
    NativePetLifecycleAnimationDecision::from(test_target(animations, manifest_key))
}

fn fallback_decision(
    animations: &NativePetAnimationSet,
    manifest_key: &str,
) -> NativePetPlaybackFallbackDecision {
    NativePetPlaybackFallbackDecision::from(test_target(animations, manifest_key))
}

fn timed_manifest_frame(index: usize, duration_ms: u64) -> NativePetManifestAnimationFrame {
    NativePetManifestAnimationFrame::Timed(NativePetTimedManifestAnimationFrame::new(
        index,
        Some(duration_ms),
    ))
}

#[test]
fn sleep_enter_plays_once_then_falls_back_to_static_sleep_hold() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let mut playback = test_playback(&animations, "sleep_enter");
    let sleep_enter = animations.test_animation("sleep_enter");
    let fallback = native_pet_completed_animation_fallback(
        &animations,
        playback,
        fallback_decision(&animations, "idle"),
        test_target(&animations, "idle"),
    );

    assert_eq!(sleep_enter.frame_indices(), vec![40, 41, 42, 43]);
    assert!(!sleep_enter.loop_animation);
    assert_eq!(animations.test_animation("sleep").frame_indices(), vec![43]);
    assert!(animations.test_animation("sleep").loop_animation);

    playback.advance(&animations, sleep_enter.total_duration_ms(), fallback);

    assert_eq!(playback, test_playback(&animations, "sleep"));
}

#[test]
fn bundled_animation_set_uses_registry_runtime_profiles_for_manifest_handles() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let key = NativePetAnimationKey::parse("fallen_idle_left").expect("valid animation key");
    let handle = animations
        .animation_handle_for_key(&key)
        .expect("fallen idle animation exists");
    let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

    assert_eq!(
        animations.render_profile_for_playback(playback),
        NativePetAnimationRenderProfile::Fallen
    );
    assert_eq!(
        animations.local_interaction_profile_for_playback(playback),
        NativePetAnimationLocalInteractionProfile::FallenIdleLeft
    );
}

#[test]
fn playback_can_target_custom_manifest_animation_handle() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture future clip".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(0, 120)],
        loop_animation: false,
        name: "future_clip".to_owned(),
        row: 0,
    });
    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
    let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
    let handle = animations
        .animation_handle_for_key(&animation)
        .expect("future clip has manifest handle");
    let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

    assert_eq!(animations.frame_index(playback), 0);
    assert_eq!(playback.manifest_handle(), Some(handle));
}

#[test]
fn manifest_loader_accepts_animation_keys_beyond_bundled_actions() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    let expected_animation_count = manifest.animations.len() + 1;
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture future clip".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(0, 120)],
        loop_animation: false,
        name: "future_clip".to_owned(),
        row: 0,
    });

    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");

    assert_eq!(animations.len(), expected_animation_count);
    assert!(animations
        .animation_for_manifest_key("future_clip")
        .is_some());
    let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
    assert!(matches!(
        animations
            .animation_target_for_key(&animation)
            .expect("future clip has target"),
        NativePetAnimationTarget::ManifestHandle(_)
    ));
}

#[test]
fn manifest_loader_does_not_require_legacy_bundled_keys() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest
        .animations
        .iter_mut()
        .find(|animation| animation.name == "wake")
        .expect("bundled manifest has wake animation")
        .name = "future_wake".to_owned();
    let mut profiles = HashMap::new();
    profiles.insert(
        "future_wake".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::Wake,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );

    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
        .expect("manifest can replace a legacy slot key with registry-profiled clip");
    let animation = NativePetAnimationKey::parse("future_wake").expect("valid key");

    assert!(matches!(
        animations
            .animation_target_for_key(&animation)
            .expect("future wake has target"),
        NativePetAnimationTarget::ManifestHandle(_)
    ));
}

#[test]
fn manifest_loader_rejects_animation_keys_that_control_protocol_cannot_address() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture invalid clip".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(0, 120)],
        loop_animation: false,
        name: "Future Clip!".to_owned(),
        row: 0,
    });

    let error = NativePetAnimationSet::from_manifest(manifest)
        .expect_err("manifest animation key should match control protocol");

    assert_eq!(
        error.to_string(),
        "runtime failed: native pet manifest has invalid animation key: Future Clip!"
    );
}

#[test]
fn maps_native_pet_animation_playback_to_manifest_frames() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");

    let mut playback = test_playback(&animations, "run_right");
    assert_eq!(animations.frame_index(playback), 16);

    playback.frame_phase = 7;
    assert_eq!(animations.frame_index(playback), 23);

    playback.frame_phase = 8;
    assert_eq!(animations.frame_index(playback), 16);

    let mut playback = test_playback(&animations, "drag");
    assert_eq!(animations.frame_index(playback), 24);

    playback.frame_phase = 5;
    assert_eq!(animations.frame_index(playback), 29);

    playback.frame_phase = 6;
    assert_eq!(animations.frame_index(playback), 24);
}

#[test]
fn returns_to_idle_after_one_shot_native_pet_animation() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let mut playback = test_playback(&animations, "tap");
    let tap = animations.test_animation("tap");
    let fallback: NativePetPlaybackFallbackDecision = test_target(&animations, "idle").into();

    playback.advance(&animations, tap.total_duration_ms(), fallback);

    assert_eq!(playback, test_playback(&animations, "idle"));
}

#[test]
fn held_playback_stays_on_last_frame_until_the_next_action_restarts_it() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let tap = animations.test_animation("tap");
    let tap_target = test_target(&animations, "tap");
    let idle_fallback = fallback_decision(&animations, "idle");
    let mut playback = NativePetAnimationPlayback::from_target(tap_target);

    playback.hold_last_frame(&animations);
    playback.advance(&animations, tap.total_duration_ms() * 2, idle_fallback);

    assert_eq!(playback.animation_target(), tap_target);
    assert_eq!(playback.frame_phase, tap.frame_count() - 1);

    playback.restart_animation_target(tap_target);

    assert_eq!(playback.frame_phase, 0);
    assert_eq!(playback.elapsed_ms, 0);
}

#[test]
fn returns_to_requested_looping_animation_after_one_shot_interaction() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let mut playback = test_playback(&animations, "tap");
    let tap = animations.test_animation("tap");

    playback.advance(
        &animations,
        tap.total_duration_ms(),
        fallback_decision(&animations, "working"),
    );

    assert_eq!(playback, test_playback(&animations, "working"));
    assert_eq!(
        native_pet_requested_animation_fallback(
            &animations,
            lifecycle_decision(&animations, "working"),
            test_target(&animations, "idle"),
        )
        .animation_target(),
        test_target(&animations, "working")
    );
    assert_eq!(
        native_pet_requested_animation_fallback(
            &animations,
            lifecycle_decision(&animations, "celebrate"),
            test_target(&animations, "idle"),
        )
        .animation_target(),
        test_target(&animations, "idle")
    );
}

#[test]
fn playback_fallback_can_return_to_manifest_only_animation_target() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture future loop".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(0, 120)],
        loop_animation: true,
        name: "future_loop".to_owned(),
        row: 0,
    });
    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra loop loads");
    let key = NativePetAnimationKey::parse("future_loop").expect("valid animation key");
    let handle = animations
        .animation_handle_for_key(&key)
        .expect("future loop has manifest handle");
    let fallback: NativePetPlaybackFallbackDecision =
        NativePetAnimationTarget::ManifestHandle(handle).into();
    let mut playback = test_playback(&animations, "tap");
    let tap = animations.test_animation("tap");

    playback.advance(&animations, tap.total_duration_ms(), fallback);

    assert_eq!(playback.manifest_handle(), Some(handle));
}

#[test]
fn trip_fall_waits_for_click_before_getting_up() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let mut playback = test_playback(&animations, "trip_fall_left");
    let trip_left = animations.test_animation("trip_fall_left");
    let fallback = native_pet_completed_animation_fallback(
        &animations,
        playback,
        native_pet_requested_animation_fallback(
            &animations,
            lifecycle_decision(&animations, "idle"),
            test_target(&animations, "idle"),
        ),
        test_target(&animations, "idle"),
    );

    playback.advance(&animations, trip_left.total_duration_ms(), fallback);

    let fallen_key = NativePetAnimationKey::parse("fallen_idle_left").expect("valid animation key");
    let fallen_handle = animations
        .animation_handle_for_key(&fallen_key)
        .expect("fallen idle has manifest handle");
    assert_eq!(playback.manifest_handle(), Some(fallen_handle));

    let fallen_left = animations.test_animation("fallen_idle_left");
    playback.advance(
        &animations,
        fallen_left.total_duration_ms() * 3,
        fallback_decision(&animations, "idle"),
    );

    assert_eq!(playback.manifest_handle(), Some(fallen_handle));

    playback.restart_animation_target(test_target(&animations, "fallen_get_up_left"));
    let get_up_left = animations.test_animation("fallen_get_up_left");
    let fallback = native_pet_completed_animation_fallback(
        &animations,
        playback,
        native_pet_requested_animation_fallback(
            &animations,
            lifecycle_decision(&animations, "idle"),
            test_target(&animations, "idle"),
        ),
        test_target(&animations, "idle"),
    );
    playback.advance(&animations, get_up_left.total_duration_ms(), fallback);

    assert_eq!(playback, test_playback(&animations, "idle"));
}

#[test]
fn manifest_profile_trip_fall_waits_on_matching_fallen_idle_target() {
    let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture future trip fall".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(0, 120)],
        loop_animation: false,
        name: "future_trip_fall_left".to_owned(),
        row: 0,
    });
    manifest.animations.push(NativePetManifestAnimation {
        description: "Fixture future fallen idle".to_owned(),
        fps: None,
        frames: vec![timed_manifest_frame(1, 120)],
        loop_animation: true,
        name: "future_fallen_idle_left".to_owned(),
        row: 0,
    });
    let mut profiles = HashMap::new();
    profiles.insert(
        "future_trip_fall_left".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::TripFall,
            local_interaction_profile:
                NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
            completion_fallback_profile:
                NativePetAnimationCompletionFallbackProfile::FallenIdleLeft,
        },
    );
    profiles.insert(
        "future_fallen_idle_left".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::Fallen,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::FallenIdleLeft,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );
    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
        .expect("manifest with future fall set loads");
    let trip_key = NativePetAnimationKey::parse("future_trip_fall_left").expect("valid key");
    let fallen_key = NativePetAnimationKey::parse("future_fallen_idle_left").expect("valid key");
    let trip_handle = animations
        .animation_handle_for_key(&trip_key)
        .expect("future trip exists");
    let fallen_handle = animations
        .animation_handle_for_key(&fallen_key)
        .expect("future fallen idle exists");
    let mut playback = NativePetAnimationPlayback::from_manifest_handle(trip_handle);
    let trip_duration = animations
        .animation_for_handle(trip_handle)
        .expect("future trip animation exists")
        .total_duration_ms();
    let fallback = native_pet_completed_animation_fallback(
        &animations,
        playback,
        native_pet_requested_animation_fallback(
            &animations,
            lifecycle_decision(&animations, "idle"),
            test_target(&animations, "idle"),
        ),
        test_target(&animations, "idle"),
    );

    playback.advance(&animations, trip_duration, fallback);

    assert_eq!(playback.manifest_handle(), Some(fallen_handle));
}

#[test]
fn stumble_variants_return_to_idle_after_one_shot() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    for animation_key in ["stumble_recover_left", "stumble_recover_right"] {
        let mut playback = test_playback(&animations, animation_key);
        let animation = animations.test_animation(animation_key);
        let fallback = native_pet_completed_animation_fallback(
            &animations,
            playback,
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "idle"),
                test_target(&animations, "idle"),
            ),
            test_target(&animations, "idle"),
        );

        playback.advance(&animations, animation.total_duration_ms(), fallback);

        assert_eq!(playback, test_playback(&animations, "idle"));
    }
}

#[test]
fn can_restart_same_animation_for_explicit_control_replay() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let celebrate_target = test_target(&animations, "celebrate");
    let mut playback = test_playback(&animations, "celebrate");
    playback.elapsed_ms = 240;
    playback.frame_phase = 4;

    playback.restart_animation_target(celebrate_target);

    assert_eq!(playback, test_playback(&animations, "celebrate"));
}
