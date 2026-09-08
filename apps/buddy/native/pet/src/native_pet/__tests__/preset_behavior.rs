use std::cell::{Cell, RefCell};

use super::*;
use crate::{
    action_registry::ActionRegistry,
    native_pet::{
        animation::{
            NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
            NativePetAnimationLocalInteractionProfile, NativePetAnimationRenderProfile,
            NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetManifest,
        },
        assets::load_default_pet_animation_set,
        control_runtime::native_pet_apply_completed_play_action_behavior,
        lifecycle::NativePetLifecycleActionTargets,
        process::step_protocol::{
            step_completed_response, ExecuteStepPayload, ExecuteStepPlayback, SidecarStepResponse,
        },
        step_runtime::{
            native_pet_active_play_action_completion_behavior, native_pet_advance_active_step,
            native_pet_play_action_completion_behavior_for_response,
        },
        window_tick::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState},
    },
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

fn idle_target(animations: &NativePetAnimationSet) -> NativePetAnimationTarget {
    let idle_key = NativePetAnimationKey::parse("idle").expect("valid animation key");
    animations
        .animation_target_for_key(&idle_key)
        .expect("idle animation target resolves")
}

fn test_target(animations: &NativePetAnimationSet, manifest_key: &str) -> NativePetAnimationTarget {
    animations.animation_target_for_test_key(manifest_key)
}

fn requested_idle_state(animations: &NativePetAnimationSet) -> NativePetRequestedAnimationState {
    NativePetRequestedAnimationState::from(idle_target(animations))
}

#[test]
fn throw_after_drag_finish_selects_action_id_and_resolves_registry_target() {
    let registry = ActionRegistry::load_bundled().expect("load bundled action registry");
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let targets = NativePetThrowAfterDragFinishTargets::load(&registry, &animations)
        .expect("throw finish targets resolve from registry");
    let cases = [
        (
            NativePetFacing::Left,
            0,
            "throw_after_drag.none",
            "none",
            "idle",
            false,
        ),
        (
            NativePetFacing::Left,
            1,
            "throw_after_drag.fall.left",
            "fall",
            "trip_fall_left",
            true,
        ),
        (
            NativePetFacing::Right,
            1,
            "throw_after_drag.fall.right",
            "fall",
            "trip_fall_right",
            true,
        ),
        (
            NativePetFacing::Left,
            2,
            "throw_after_drag.stumble.left",
            "stumble",
            "stumble_recover_left",
            false,
        ),
        (
            NativePetFacing::Right,
            2,
            "throw_after_drag.stumble.right",
            "stumble",
            "stumble_recover_right",
            false,
        ),
        (
            NativePetFacing::Left,
            5,
            "throw_after_drag.stumble.left",
            "stumble",
            "stumble_recover_left",
            false,
        ),
        (
            NativePetFacing::Right,
            5,
            "throw_after_drag.stumble.right",
            "stumble",
            "stumble_recover_right",
            false,
        ),
    ];

    for (run_facing, seed, action_id, outcome, animation_key, waits_for_get_up) in cases {
        let finish = native_pet_throw_after_drag_finish_after_runout(run_facing, seed);
        let animation = targets.animation_target(finish);
        let event = native_pet_throw_after_drag_preset_behavior_event(
            finish,
            animation,
            "interaction_test".to_owned(),
            &animations,
        );

        assert_eq!(finish.action_id(), action_id);
        assert_eq!(finish.outcome(), outcome);
        assert_eq!(finish.waits_for_get_up(), waits_for_get_up);
        assert_eq!(animations.manifest_key_for_target(animation), animation_key);
        assert_eq!(event.outcome, outcome);
        assert_eq!(event.animation, animation_key);
    }
}

#[test]
fn fallen_get_up_event_reuses_throw_interaction_id() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let event = native_pet_fallen_get_up_preset_behavior_event(
        test_target(&animations, "fallen_get_up_left"),
        "interaction_test".to_owned(),
        &animations,
    );

    assert_eq!(
        event.preset_behavior_id,
        THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID
    );
    assert_eq!(event.interaction_id.as_deref(), Some("interaction_test"));
    assert_eq!(event.outcome, "get_up");
    assert_eq!(event.animation, "fallen_get_up_left");
}

#[test]
fn fallen_recovery_state_waits_only_for_fall_outcomes() {
    let state = native_pet_fallen_recovery_state_after_throw_finish(
        NativePetThrowAfterDragFinish::FallRight,
        "interaction_test".to_owned(),
    )
    .expect("fall waits for recovery");

    assert_eq!(state.clone().into_interaction_id(), "interaction_test");
    assert_eq!(state.into_interaction_id(), "interaction_test");
    assert!(native_pet_fallen_recovery_state_after_throw_finish(
        NativePetThrowAfterDragFinish::StumbleRight,
        "interaction_stumble".to_owned(),
    )
    .is_none());
    assert!(native_pet_fallen_recovery_state_after_throw_finish(
        NativePetThrowAfterDragFinish::None,
        "interaction_none".to_owned(),
    )
    .is_none());
}

#[test]
fn preset_behavior_execute_step_request_uses_manifest_animation_and_clip_duration() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");

    let request = native_pet_preset_behavior_execute_step_request(
        test_target(&animations, "stumble_recover_right"),
        "interaction_019f5200-0000-7000-8000-000000000001",
        &animations,
    );

    assert_eq!(
        request.step_id,
        "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right"
    );
    assert_eq!(
        request.step,
        ExecuteStepPayload::PlayAction {
            animation: "stumble_recover_right".to_owned(),
            playback: ExecuteStepPlayback::Once {
                duration_ms: animations
                    .test_animation("stumble_recover_right")
                    .total_duration_ms(),
            },
            interrupt_policy: SidecarInterruptPolicy::FinishStep,
            completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
            timeout_ms: 5_000,
        }
    );
}

#[test]
fn preset_behavior_execute_step_starts_active_step_for_runtime_completion() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let active_step = RefCell::new(None);
    let idle_target = idle_target(&animations);
    let requested_animation = Cell::new(requested_idle_state(&animations));
    let mut playback = animations.playback_for_test_key("idle");

    let request = native_pet_start_preset_behavior_execute_step(
        &active_step,
        &animations,
        &mut playback,
        &requested_animation,
        test_target(&animations, "stumble_recover_right"),
        idle_target,
        "interaction_019f5200-0000-7000-8000-000000000001",
    );

    assert_eq!(
        request.step_id,
        "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right"
    );
    assert_eq!(
        playback,
        animations.playback_for_test_key("stumble_recover_right")
    );
    assert_eq!(requested_animation.get().animation_target(), idle_target);
    assert_eq!(
        native_pet_advance_active_step(
            &mut active_step.borrow_mut(),
            animations
                .test_animation("stumble_recover_right")
                .total_duration_ms(),
        ),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right",
            animations
                .test_animation("stumble_recover_right")
                .total_duration_ms(),
        )))
    );
}

#[test]
fn trip_fall_execute_step_finishes_in_fallen_idle_until_click() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let lifecycle_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
        .expect("lifecycle action targets resolve");
    let active_step = RefCell::new(None);
    let requested_animation = Cell::new(requested_idle_state(&animations));
    let mut playback = animations.playback_for_test_key("idle");
    let trip_fall = test_target(&animations, "trip_fall_left");
    let duration_ms = animations
        .test_animation("trip_fall_left")
        .total_duration_ms();

    native_pet_start_preset_behavior_execute_step(
        &active_step,
        &animations,
        &mut playback,
        &requested_animation,
        trip_fall,
        lifecycle_targets.idle(),
        "interaction_fall",
    );
    let completion_behavior =
        native_pet_active_play_action_completion_behavior(&active_step.borrow());
    let response = native_pet_advance_active_step(&mut active_step.borrow_mut(), duration_ms)
        .expect("trip fall step completes");
    let completion_behavior =
        native_pet_play_action_completion_behavior_for_response(completion_behavior, &response)
            .expect("play action completion behavior resolves");
    native_pet_apply_completed_play_action_behavior(
        completion_behavior,
        &animations,
        &lifecycle_targets,
        &mut playback,
        &requested_animation,
    );
    native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
        playback: &mut playback,
        pet_animations: &animations,
        lifecycle_action_targets: &lifecycle_targets,
        requested_animation: &requested_animation,
        pointer_hovered: &Cell::new(false),
        idle_lifecycle_elapsed_ms: &Cell::new(0),
        idle_presence_schedule_seed: &Cell::new(0),
        task_presence_elapsed_ms: &Cell::new(0),
        elapsed_ms: duration_ms,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_scripted_walk_active: false,
    });

    assert_eq!(
        animations.manifest_key_for_playback(playback),
        "fallen_idle_left"
    );
}

#[test]
fn preset_behavior_execute_step_starts_manifest_only_target_by_runtime_profile() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future preset action",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_preset_action",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future preset action");
    let mut profiles = std::collections::HashMap::new();
    profiles.insert(
        "future_preset_action".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::StumbleRecover,
            local_interaction_profile:
                NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Idle,
        },
    );
    let animations = NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
        .expect("manifest with future preset action loads");
    let key = NativePetAnimationKey::parse("future_preset_action").expect("valid key");
    let target = animations
        .animation_target_for_key(&key)
        .expect("future preset action target exists");
    let active_step = RefCell::new(None);
    let idle_target = idle_target(&animations);
    let requested_animation = Cell::new(requested_idle_state(&animations));
    let mut playback = animations.playback_for_test_key("idle");

    let request = native_pet_start_preset_behavior_execute_step(
        &active_step,
        &animations,
        &mut playback,
        &requested_animation,
        target,
        idle_target,
        "interaction_019f5200-0000-7000-8000-000000000001",
    );

    assert_eq!(
        request.step_id,
        "step_019f5200-0000-7000-8000-000000000001_future_preset_action"
    );
    assert_eq!(
        request.step,
        ExecuteStepPayload::PlayAction {
            animation: "future_preset_action".to_owned(),
            playback: ExecuteStepPlayback::Once { duration_ms: 120 },
            interrupt_policy: SidecarInterruptPolicy::FinishStep,
            completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
            timeout_ms: 5_000,
        }
    );
    assert!(playback.manifest_handle().is_some());
    assert_eq!(requested_animation.get().animation_target(), idle_target);
    assert_eq!(
        native_pet_advance_active_step(&mut active_step.borrow_mut(), 120),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5200-0000-7000-8000-000000000001_future_preset_action",
            120,
        )))
    );
}
