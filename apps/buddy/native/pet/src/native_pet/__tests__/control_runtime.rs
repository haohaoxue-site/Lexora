use super::{
    compile_execute_step_control_message, native_pet_apply_completed_play_action_behavior,
    native_pet_apply_control_animation_with_request_mode, native_pet_control_message_moves_window,
    native_pet_execute_step_compile_error_response, native_pet_execute_step_runtime_error_response,
    native_pet_restore_idle_after_active_play_action, NativePetControlAnimationRequestMode,
    NativePetControlCommandRuntimeState,
};
use crate::{
    error::BuddyError,
    native_pet::{
        animation::{
            NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
            NativePetAnimationLocalInteractionProfile, NativePetAnimationRenderProfile,
            NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetManifest,
            NativePetRequestedAnimationState,
        },
        assets::load_default_pet_animation_set,
        coordinates::{NativePetLogicalSize, NativePetPosition},
        edge_runout::NativePetEdgeRunoutState,
        lifecycle::NativePetLifecycleActionTargets,
        physics::NativePetInertiaState,
        process::NativePetControlMessage,
        scripted_walk::{NativePetScriptedWalkComposition, NativePetScriptedWalkState},
        step_protocol::{
            protocol_error_response_with_code, step_failed_response_with_code, ExecuteStepPayload,
            ExecuteStepPlayback, ExecuteStepRequest, SidecarInterruptPolicy,
            SidecarPlayActionCompletionBehavior, SidecarStepErrorCode, SidecarStepResponse,
            SIDECAR_PROTOCOL_VERSION,
        },
    },
};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

fn lifecycle_action_targets(
    pet_animations: &NativePetAnimationSet,
) -> NativePetLifecycleActionTargets {
    NativePetLifecycleActionTargets::load_bundled(pet_animations)
        .expect("lifecycle action targets resolve from bundled registry")
}

#[test]
fn only_movement_commands_invalidate_a_pending_drag_rest_position() {
    assert!(!native_pet_control_message_moves_window(
        &NativePetControlMessage::SetAnimation(
            NativePetAnimationKey::parse("celebrate").expect("animation key"),
        ),
    ));
    assert!(native_pet_control_message_moves_window(
        &NativePetControlMessage::WalkToTarget {
            target: crate::native_pet::process::NativePetWalkTarget::Center,
            after: None,
        },
    ));
}

fn requested_idle_state(
    lifecycle_action_targets: &NativePetLifecycleActionTargets,
) -> NativePetRequestedAnimationState {
    NativePetRequestedAnimationState::from(lifecycle_action_targets.idle())
}

#[test]
fn set_animation_accepts_custom_manifest_animation() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future clip",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_clip",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future clip");
    let pet_animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
    let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
    let expected_handle = pet_animations
        .animation_handle_for_key(&animation)
        .expect("future clip has manifest handle");
    let mut playback = pet_animations.playback_for_test_key("idle");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);
    let inertia_state = RefCell::new(None::<NativePetInertiaState>);
    let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
    let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
    let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });
    let runtime_state = NativePetControlCommandRuntimeState {
        pet_animations: &pet_animations,
        lifecycle_action_targets: &lifecycle_action_targets,
        playback: &mut playback,
        requested_animation: &requested_animation,
        pointer_hovered: &pointer_hovered,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed: &idle_presence_schedule_seed,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        inertia_state: &inertia_state,
        edge_runout_state: &edge_runout_state,
        scripted_walk_state: &scripted_walk_state,
        window_position: &window_position,
        window_size: NativePetLogicalSize::new(192, 208),
        is_motion_locked: false,
    };

    native_pet_apply_control_animation_with_request_mode(
        animation,
        NativePetControlAnimationRequestMode::RuntimeProfile,
        runtime_state,
    )
    .expect("future manifest animation can be applied");

    assert_eq!(playback.manifest_handle(), Some(expected_handle));
    assert_eq!(pet_animations.frame_index(playback), 0);
    assert_eq!(
        pet_animations.manifest_key_for_requested_animation(requested_animation.get()),
        "future_clip"
    );
}

#[test]
fn set_animation_treats_bundled_finish_step_one_shots_as_finite_actions() {
    let pet_animations = load_default_pet_animation_set().expect("default pet animation set loads");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);

    for animation_name in [
        "wake",
        "celebrate",
        "sleep_enter",
        "reassure",
        "curious",
        "cast",
        "tap",
        "trip_fall_left",
        "trip_fall_right",
        "stumble_recover_left",
        "stumble_recover_right",
        "fallen_get_up_left",
        "fallen_get_up_right",
    ] {
        let animation =
            NativePetAnimationKey::parse(animation_name).expect("animation key is valid");
        let mut playback = pet_animations.playback_for_test_key("idle");
        let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(0);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);
        let inertia_state = RefCell::new(None::<NativePetInertiaState>);
        let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
        let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
        let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });

        native_pet_apply_control_animation_with_request_mode(
            animation,
            NativePetControlAnimationRequestMode::RuntimeProfile,
            NativePetControlCommandRuntimeState {
                pet_animations: &pet_animations,
                lifecycle_action_targets: &lifecycle_action_targets,
                playback: &mut playback,
                requested_animation: &requested_animation,
                pointer_hovered: &pointer_hovered,
                idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
                idle_presence_schedule_seed: &idle_presence_schedule_seed,
                task_presence_elapsed_ms: &task_presence_elapsed_ms,
                inertia_state: &inertia_state,
                edge_runout_state: &edge_runout_state,
                scripted_walk_state: &scripted_walk_state,
                window_position: &window_position,
                window_size: NativePetLogicalSize::new(192, 208),
                is_motion_locked: false,
            },
        )
        .expect("finite animation can be applied");

        assert_eq!(
            pet_animations.manifest_key_for_playback(playback),
            animation_name
        );
        assert_eq!(
            pet_animations.manifest_key_for_requested_animation(requested_animation.get()),
            "idle"
        );
    }
}

#[test]
fn loop_for_duration_step_repeats_finite_clip_then_restores_idle() {
    let pet_animations = load_default_pet_animation_set().expect("default pet animation set loads");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let animation = NativePetAnimationKey::parse("celebrate").expect("valid animation key");
    let mut playback = pet_animations.playback_for_test_key("idle");
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(500);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(300);
    let inertia_state = RefCell::new(None::<NativePetInertiaState>);
    let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
    let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
    let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });

    native_pet_apply_control_animation_with_request_mode(
        animation,
        NativePetControlAnimationRequestMode::LoopForStepDuration,
        NativePetControlCommandRuntimeState {
            pet_animations: &pet_animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            playback: &mut playback,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            scripted_walk_state: &scripted_walk_state,
            window_position: &window_position,
            window_size: NativePetLogicalSize::new(192, 208),
            is_motion_locked: false,
        },
    )
    .expect("loop step animation can be applied");

    assert_eq!(
        pet_animations.manifest_key_for_playback(playback),
        "celebrate"
    );
    assert_eq!(
        pet_animations.manifest_key_for_requested_animation(requested_animation.get()),
        "celebrate"
    );
    assert_eq!(idle_lifecycle_elapsed_ms.get(), 0);
    assert_eq!(task_presence_elapsed_ms.get(), 0);

    native_pet_restore_idle_after_active_play_action(
        &lifecycle_action_targets,
        &mut playback,
        &requested_animation,
    );

    assert_eq!(pet_animations.manifest_key_for_playback(playback), "idle");
    assert_eq!(
        pet_animations.manifest_key_for_requested_animation(requested_animation.get()),
        "idle"
    );
}

#[test]
fn completed_play_action_behavior_holds_bridge_frame_or_restores_idle() {
    let pet_animations = load_default_pet_animation_set().expect("default pet animation set loads");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let tap_target = pet_animations.animation_target_for_test_key("tap");
    let mut playback = pet_animations.playback_for_test_key("tap");
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));

    native_pet_apply_completed_play_action_behavior(
        SidecarPlayActionCompletionBehavior::HoldLastFrame,
        &pet_animations,
        &lifecycle_action_targets,
        &mut playback,
        &requested_animation,
    );

    assert_eq!(playback.animation_target(), tap_target);
    assert_eq!(
        playback.frame_phase,
        pet_animations.test_animation("tap").frame_count() - 1
    );

    native_pet_apply_completed_play_action_behavior(
        SidecarPlayActionCompletionBehavior::RestoreIdle,
        &pet_animations,
        &lifecycle_action_targets,
        &mut playback,
        &requested_animation,
    );

    assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());
}

#[test]
fn step_animation_restarts_after_a_held_bridge_frame() {
    let pet_animations = load_default_pet_animation_set().expect("default pet animation set loads");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let mut playback = pet_animations.playback_for_test_key("tap");
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);
    let inertia_state = RefCell::new(None::<NativePetInertiaState>);
    let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
    let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
    let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });

    native_pet_apply_completed_play_action_behavior(
        SidecarPlayActionCompletionBehavior::HoldLastFrame,
        &pet_animations,
        &lifecycle_action_targets,
        &mut playback,
        &requested_animation,
    );
    native_pet_apply_control_animation_with_request_mode(
        NativePetAnimationKey::parse("celebrate").expect("valid animation key"),
        NativePetControlAnimationRequestMode::LoopForStepDuration,
        NativePetControlCommandRuntimeState {
            pet_animations: &pet_animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            playback: &mut playback,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            scripted_walk_state: &scripted_walk_state,
            window_position: &window_position,
            window_size: NativePetLogicalSize::new(192, 208),
            is_motion_locked: false,
        },
    )
    .expect("next step animation can be applied");

    assert_eq!(
        pet_animations.manifest_key_for_playback(playback),
        "celebrate"
    );
    assert_eq!(playback.frame_phase, 0);

    native_pet_apply_completed_play_action_behavior(
        SidecarPlayActionCompletionBehavior::HoldLastFrame,
        &pet_animations,
        &lifecycle_action_targets,
        &mut playback,
        &requested_animation,
    );
    native_pet_apply_control_animation_with_request_mode(
        NativePetAnimationKey::parse("curious").expect("valid animation key"),
        NativePetControlAnimationRequestMode::OnceStep,
        NativePetControlCommandRuntimeState {
            pet_animations: &pet_animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            playback: &mut playback,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            scripted_walk_state: &scripted_walk_state,
            window_position: &window_position,
            window_size: NativePetLogicalSize::new(192, 208),
            is_motion_locked: false,
        },
    )
    .expect("next one-shot step animation can be applied");

    assert_eq!(
        pet_animations.manifest_key_for_playback(playback),
        "curious"
    );
    assert_eq!(playback.frame_phase, 0);
}

#[test]
fn query_state_reports_current_manifest_animation_handle_key() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future clip",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_clip",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future clip");
    let pet_animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
    let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
    let mut playback = pet_animations.playback_for_test_key("idle");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);
    let inertia_state = RefCell::new(None::<NativePetInertiaState>);
    let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
    let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
    let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });

    native_pet_apply_control_animation_with_request_mode(
        animation,
        NativePetControlAnimationRequestMode::RuntimeProfile,
        NativePetControlCommandRuntimeState {
            pet_animations: &pet_animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            playback: &mut playback,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            scripted_walk_state: &scripted_walk_state,
            window_position: &window_position,
            window_size: NativePetLogicalSize::new(192, 208),
            is_motion_locked: false,
        },
    )
    .expect("future manifest animation can be applied");

    assert_eq!(
        pet_animations.manifest_key_for_playback(playback),
        "future_clip"
    );
}

#[test]
fn set_animation_wakes_before_manifest_only_task_animation_when_sleeping() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future working action",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": true,
            "name": "future_working_control",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future working action");
    let mut profiles = HashMap::new();
    profiles.insert(
        "future_working_control".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::Working,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );
    profiles.insert(
        "sleep".to_owned(),
        NativePetAnimationRuntimeProfile {
            render_profile: NativePetAnimationRenderProfile::Sleep,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        },
    );
    let pet_animations =
        NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
            .expect("manifest with future working action loads");
    let animation =
        NativePetAnimationKey::parse("future_working_control").expect("valid manifest key");
    let mut playback = pet_animations.playback_for_test_key("sleep");
    let lifecycle_action_targets = lifecycle_action_targets(&pet_animations);
    let requested_animation = Cell::new(requested_idle_state(&lifecycle_action_targets));
    let pointer_hovered = Cell::new(false);
    let idle_lifecycle_elapsed_ms = Cell::new(0);
    let idle_presence_schedule_seed = Cell::new(0);
    let task_presence_elapsed_ms = Cell::new(0);
    let inertia_state = RefCell::new(None::<NativePetInertiaState>);
    let edge_runout_state = Cell::new(None::<NativePetEdgeRunoutState>);
    let scripted_walk_state = RefCell::new(None::<NativePetScriptedWalkState>);
    let window_position = Cell::new(NativePetPosition { x: 0, y: 0 });

    native_pet_apply_control_animation_with_request_mode(
        animation,
        NativePetControlAnimationRequestMode::RuntimeProfile,
        NativePetControlCommandRuntimeState {
            pet_animations: &pet_animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            playback: &mut playback,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            scripted_walk_state: &scripted_walk_state,
            window_position: &window_position,
            window_size: NativePetLogicalSize::new(192, 208),
            is_motion_locked: false,
        },
    )
    .expect("future manifest working animation can be applied");

    assert_eq!(playback.animation_target(), lifecycle_action_targets.wake());
    assert_eq!(
        pet_animations.manifest_key_for_requested_animation(requested_animation.get()),
        "future_working_control"
    );
}

#[test]
fn walk_after_action_accepts_custom_manifest_animation() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture future clip",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": "future_clip",
            "row": 0
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with future clip");
    let pet_animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
    let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
    let after = pet_animations
        .animation_target_for_key(&animation)
        .expect("future clip has playback target");
    let scripted_walk_state = NativePetScriptedWalkState::path(
        vec![NativePetPosition { x: 0, y: 0 }],
        Some(after),
        NativePetScriptedWalkComposition::Default,
    )
    .expect("scripted walk accepts future clip after action");

    assert_eq!(scripted_walk_state.after_animation, Some(after));
}

#[test]
fn execute_step_compile_error_maps_to_protocol_error_with_step_id() {
    let request = ExecuteStepRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        message_id: "message_019f4900-0000-7000-8000-000000000601".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000601".to_owned(),
        step: ExecuteStepPayload::PlayAction {
            animation: "Missing Animation!".to_owned(),
            playback: ExecuteStepPlayback::Once { duration_ms: 1_720 },
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            completion_behavior:
                crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
            timeout_ms: 5_000,
        },
    };
    let error = compile_execute_step_control_message(&request).expect_err("compile fails");

    assert_eq!(
        native_pet_execute_step_compile_error_response(&request, &error),
        SidecarStepResponse::ProtocolError(protocol_error_response_with_code(
            Some("step_019f4900-0000-7000-8000-000000000601"),
            SidecarStepErrorCode::InvalidExecuteStep,
            "buddy state validation failed: invalid native pet executeStep animation key: Missing Animation!",
        ))
    );
}

#[test]
fn execute_step_runtime_error_maps_window_anchor_to_target_unavailable_code() {
    let request = ExecuteStepRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        message_id: "message_019f4900-0000-7000-8000-000000000602".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000602".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({
                "kind": "windowAnchor",
                "selector": { "kind": "activeWindow" },
                "edge": "left",
                "reveal": "head",
                "durationMs": 3000
            }),
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 18_000,
        },
    };
    let error = BuddyError::Runtime("native pet active window rect is unavailable".to_owned());

    assert_eq!(
        native_pet_execute_step_runtime_error_response(&request, &error),
        SidecarStepResponse::StepFailed(step_failed_response_with_code(
            "step_019f4900-0000-7000-8000-000000000602",
            SidecarStepErrorCode::TargetUnavailable,
            "runtime failed: native pet active window rect is unavailable",
            None,
        ))
    );
}
