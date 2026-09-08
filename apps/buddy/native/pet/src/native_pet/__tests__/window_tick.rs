use std::{cell::Cell, collections::HashMap};

use super::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState};
use crate::native_pet::{
    animation::{
        NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
        NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
        NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile, NativePetAnimationSet,
        NativePetAnimationTarget, NativePetManifest, NativePetRequestedAnimationState,
    },
    assets::load_default_pet_animation_set,
    lifecycle::NativePetLifecycleActionTargets,
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

fn manifest_only_wake_animation_set() -> (NativePetAnimationSet, NativePetAnimationTarget) {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future wake action",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_wake_action",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future wake action");
    let mut profiles = HashMap::new();
    profiles.insert(
        "future_wake_action".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::Wake,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );
    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
        .expect("manifest with future wake action loads");
    let key = NativePetAnimationKey::parse("future_wake_action").expect("valid key");
    let target = animations
        .animation_target_for_key(&key)
        .expect("future wake target exists");

    (animations, target)
}

#[test]
fn lifecycle_tick_preserves_a_held_bridge_frame() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let mut playback = animations.playback_for_test_key("tap");
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
        lifecycle_action_targets.idle(),
    ));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);

    playback.hold_last_frame(&animations);
    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 16,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(animations.manifest_key_for_playback(playback), "tap");
    assert_eq!(
        playback.frame_phase,
        animations.test_animation("tap").frame_count() - 1
    );
}

#[test]
fn lifecycle_tick_applies_pending_request_after_manifest_only_wake_finishes() {
    let (animations, wake_target) = manifest_only_wake_animation_set();
    let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let mut playback = NativePetAnimationPlayback::from_target(wake_target);
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
        animations.animation_target_for_test_key("working"),
    ));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 120,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(
        playback.animation_target(),
        animations.animation_target_for_test_key("working")
    );
}

#[test]
fn lifecycle_tick_applies_sleep_request_after_manifest_only_wake_finishes() {
    let (animations, wake_target) = manifest_only_wake_animation_set();
    let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let mut playback = NativePetAnimationPlayback::from_target(wake_target);
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
        lifecycle_action_targets.sleep(),
    ));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 120,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(
        playback.animation_target(),
        lifecycle_action_targets.sleep()
    );
}

#[test]
fn lifecycle_tick_resets_idle_timer_after_wake_finishes() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let mut playback = animations.playback_for_test_key("wake");
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
        lifecycle_action_targets.idle(),
    ));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(45_000);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 10_000,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });
    assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 16,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(idle_lifecycle_elapsed_ms.get(), 16);
    assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());
}

#[test]
fn lifecycle_tick_finishes_sleep_enter_then_holds_sleep_until_wake_returns_idle() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let mut playback = animations.playback_for_test_key("idle");
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
        lifecycle_action_targets.idle(),
    ));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(45_000);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 16,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(
        playback.animation_target(),
        lifecycle_action_targets.sleep_enter()
    );
    assert_eq!(animations.frame_index(playback), 40);

    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: animations.test_animation("sleep_enter").total_duration_ms(),
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(
        playback.animation_target(),
        lifecycle_action_targets.sleep()
    );
    assert_eq!(animations.frame_index(playback), 43);

    pointer_hovered.set(true);
    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: 16,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(playback.animation_target(), lifecycle_action_targets.wake());
    assert_eq!(animations.frame_index(playback), 44);

    pointer_hovered.set(false);
    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        elapsed_ms: animations.test_animation("wake").total_duration_ms(),
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());
    assert_eq!(animations.frame_index(playback), 0);
}
