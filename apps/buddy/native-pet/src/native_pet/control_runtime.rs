use std::{
    cell::{Cell, RefCell},
    path::Path,
    sync::mpsc,
};

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::{
        NativePetAnimationKey, NativePetAnimationPlayback, NativePetAnimationSet,
        NativePetAnimationTarget, NativePetRequestedAnimationState,
    },
    config::{load_native_pet_config, NativePetConfig},
    control_state::{native_pet_control_state_response, NativePetControlStateSnapshot},
    coordinates::{NativePetLogicalSize, NativePetPosition},
    edge_runout::NativePetEdgeRunoutState,
    lifecycle::{
        native_pet_animation_for_lifecycle, native_pet_next_idle_presence_schedule_seed,
        native_pet_requested_animation_for_control_animation,
        native_pet_should_keep_scripted_action_playing, NativePetCurrentAnimationState,
        NativePetLifecycleActionTargets, NativePetLifecycleAnimationInput,
        NativePetLocalInteractionAnimationState,
    },
    physics::NativePetInertiaState,
    position_state::clear_native_pet_position_state,
    process::{
        compile_execute_step_control_message, drain_native_pet_control_requests,
        emit_native_pet_sidecar_event, native_pet_control_capabilities_response,
        native_pet_control_ok_response, NativePetControlMessage, NativePetControlPoll,
        NativePetControlRequest, NativePetControlRequestKind, NativePetSidecarEvent,
        NativePetWalkTarget,
    },
    scripted_walk::{
        native_pet_start_scripted_walk, native_pet_start_scripted_walk_path,
        NativePetScriptedWalkRuntimeState, NativePetScriptedWalkState,
    },
    step_protocol::{
        protocol_error_response_with_code, step_failed_response_with_code, ExecuteStepPayload,
        ExecuteStepPlayback, ExecuteStepRequest, SidecarPlayActionCompletionBehavior,
        SidecarStepErrorCode, SidecarStepResponse,
    },
    step_runtime::{
        native_pet_active_step_is_play_action, native_pet_interrupt_active_step,
        native_pet_start_active_step_for_execute_step, NativePetActiveStepState,
    },
};

pub(super) struct NativePetControlRuntimeState<'a> {
    pub(super) active_step_state: &'a RefCell<Option<NativePetActiveStepState>>,
    pub(super) control_messages: &'a mpsc::Receiver<NativePetControlRequest>,
    pub(super) pet_animations: &'a NativePetAnimationSet,
    pub(super) lifecycle_action_targets: &'a NativePetLifecycleActionTargets,
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) requested_animation: &'a Cell<NativePetRequestedAnimationState>,
    pub(super) pointer_hovered: &'a Cell<bool>,
    pub(super) idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    pub(super) idle_presence_schedule_seed: &'a Cell<u64>,
    pub(super) task_presence_elapsed_ms: &'a Cell<u64>,
    pub(super) inertia_state: &'a RefCell<Option<NativePetInertiaState>>,
    pub(super) edge_runout_state: &'a Cell<Option<NativePetEdgeRunoutState>>,
    pub(super) scripted_walk_state: &'a RefCell<Option<NativePetScriptedWalkState>>,
    pub(super) window_position: &'a Cell<NativePetPosition>,
    pub(super) window_monitor_index: &'a Cell<Option<i32>>,
    pub(super) window_size: NativePetLogicalSize,
    pub(super) is_dragging: bool,
    pub(super) is_motion_locked: bool,
    pub(super) config_path: &'a Path,
    pub(super) position_state_path: &'a Path,
    pub(super) preferences: &'a Cell<NativePetConfig>,
    pub(super) pending_rest_position_save: &'a Cell<bool>,
    pub(super) should_quit: &'a Cell<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetControlAnimationRequestMode {
    RuntimeProfile,
    OnceStep,
    LoopForStepDuration,
}

pub(super) fn native_pet_drain_control_runtime_requests(
    runtime_state: NativePetControlRuntimeState<'_>,
) -> NativePetControlPoll {
    let NativePetControlRuntimeState {
        active_step_state,
        control_messages,
        pet_animations,
        lifecycle_action_targets,
        playback,
        requested_animation,
        pointer_hovered,
        idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed,
        task_presence_elapsed_ms,
        inertia_state,
        edge_runout_state,
        scripted_walk_state,
        window_position,
        window_monitor_index,
        window_size,
        is_dragging,
        is_motion_locked,
        config_path,
        position_state_path,
        preferences,
        pending_rest_position_save,
        should_quit,
    } = runtime_state;

    drain_native_pet_control_requests(control_messages, |request| {
        let response = match request.kind() {
            NativePetControlRequestKind::ParentDisconnected => native_pet_control_ok_response(),
            NativePetControlRequestKind::ReloadConfig => {
                match load_native_pet_config(config_path).and_then(|next| {
                    if !next.remember_position {
                        clear_native_pet_position_state(position_state_path)?;
                    }
                    preferences.set(next);
                    should_quit.set(!next.enabled);
                    Ok(())
                }) {
                    Ok(()) => native_pet_control_ok_response(),
                    Err(error) => serde_json::json!({ "ok": false, "error": error.to_string() }),
                }
            }
            NativePetControlRequestKind::QueryState
            | NativePetControlRequestKind::QueryStateSnapshot(_) => {
                let scripted_walk_state = scripted_walk_state.borrow().clone();
                let is_scripted_walk_active = scripted_walk_state.is_some();
                let is_motion_active = is_dragging
                    || inertia_state.borrow().is_some()
                    || edge_runout_state.get().is_some()
                    || is_scripted_walk_active;
                let current_interaction_state =
                    NativePetLocalInteractionAnimationState::from_playback(
                        pet_animations,
                        *playback,
                    );
                native_pet_control_state_response(NativePetControlStateSnapshot {
                    current_position: window_position.get(),
                    current_monitor_index: window_monitor_index.get(),
                    window_size,
                    current_animation: pet_animations
                        .manifest_key_for_playback(*playback)
                        .to_owned(),
                    requested_animation: pet_animations
                        .manifest_key_for_requested_animation(requested_animation.get())
                        .to_owned(),
                    scripted_walk_state,
                    is_dragging,
                    is_inertia_active: inertia_state.borrow().is_some(),
                    is_edge_runout_active: edge_runout_state.get().is_some(),
                    is_local_interaction_active: is_motion_active
                        || current_interaction_state.is_active(),
                })
            }
            NativePetControlRequestKind::QueryCapabilities => {
                native_pet_control_capabilities_response(pet_animations)
            }
            NativePetControlRequestKind::Command(message) => {
                if native_pet_control_message_moves_window(&message) {
                    pending_rest_position_save.set(false);
                }
                match native_pet_apply_control_message(
                    message,
                    NativePetControlCommandRuntimeState {
                        pet_animations,
                        lifecycle_action_targets,
                        playback,
                        requested_animation,
                        pointer_hovered,
                        idle_lifecycle_elapsed_ms,
                        idle_presence_schedule_seed,
                        task_presence_elapsed_ms,
                        inertia_state,
                        edge_runout_state,
                        scripted_walk_state,
                        window_position,
                        window_size,
                        is_motion_locked,
                    },
                ) {
                    Ok(()) => native_pet_control_ok_response(),
                    Err(error) => serde_json::json!({ "ok": false, "error": error.to_string() }),
                }
            }
            NativePetControlRequestKind::ExecuteStep(step_request) => {
                if matches!(
                    &step_request.step,
                    ExecuteStepPayload::MoveTo { .. } | ExecuteStepPayload::MoveByPath { .. }
                ) {
                    pending_rest_position_save.set(false);
                }
                let animation_request_mode =
                    native_pet_control_animation_request_mode_for_execute_step(&step_request);
                match compile_execute_step_control_message(&step_request) {
                    Ok(message) => {
                        match native_pet_apply_control_message_with_request_mode(
                            message,
                            animation_request_mode,
                            NativePetControlCommandRuntimeState {
                                pet_animations,
                                lifecycle_action_targets,
                                playback,
                                requested_animation,
                                pointer_hovered,
                                idle_lifecycle_elapsed_ms,
                                idle_presence_schedule_seed,
                                task_presence_elapsed_ms,
                                inertia_state,
                                edge_runout_state,
                                scripted_walk_state,
                                window_position,
                                window_size,
                                is_motion_locked,
                            },
                        ) {
                            Ok(()) => {
                                active_step_state.replace(Some(
                                    native_pet_start_active_step_for_execute_step(&step_request),
                                ));
                                native_pet_control_ok_response()
                            }
                            Err(error) => {
                                native_pet_restore_idle_after_failed_execute_step(
                                    &step_request,
                                    lifecycle_action_targets,
                                    playback,
                                    requested_animation,
                                );
                                let _ = emit_native_pet_sidecar_event(
                                    NativePetSidecarEvent::StepResponse(
                                        native_pet_execute_step_runtime_error_response(
                                            &step_request,
                                            &error,
                                        ),
                                    ),
                                );
                                serde_json::json!({ "ok": false, "error": error.to_string() })
                            }
                        }
                    }
                    Err(error) => {
                        native_pet_restore_idle_after_failed_execute_step(
                            &step_request,
                            lifecycle_action_targets,
                            playback,
                            requested_animation,
                        );
                        let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(
                            native_pet_execute_step_compile_error_response(&step_request, &error),
                        ));
                        serde_json::json!({ "ok": false, "error": error.to_string() })
                    }
                }
            }
            NativePetControlRequestKind::InterruptStep(step_request) => {
                scripted_walk_state.replace(None);
                let (step_response, restore_idle) = {
                    let mut active_step_state = active_step_state.borrow_mut();
                    let was_play_action = native_pet_active_step_is_play_action(&active_step_state);
                    let response = native_pet_interrupt_active_step(
                        &mut active_step_state,
                        step_request.step_id.as_str(),
                        step_request.reason_code,
                    );
                    let restore_idle =
                        response.is_some() && active_step_state.is_none() && was_play_action;
                    (response, restore_idle)
                };
                if restore_idle {
                    native_pet_restore_idle_after_active_play_action(
                        lifecycle_action_targets,
                        playback,
                        requested_animation,
                    );
                }
                if let Some(response) = step_response {
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(
                        response,
                    ));
                }
                native_pet_control_ok_response()
            }
        };
        request.respond(response);
    })
}

struct NativePetControlCommandRuntimeState<'a> {
    pet_animations: &'a NativePetAnimationSet,
    lifecycle_action_targets: &'a NativePetLifecycleActionTargets,
    playback: &'a mut NativePetAnimationPlayback,
    requested_animation: &'a Cell<NativePetRequestedAnimationState>,
    pointer_hovered: &'a Cell<bool>,
    idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    idle_presence_schedule_seed: &'a Cell<u64>,
    task_presence_elapsed_ms: &'a Cell<u64>,
    inertia_state: &'a RefCell<Option<NativePetInertiaState>>,
    edge_runout_state: &'a Cell<Option<NativePetEdgeRunoutState>>,
    scripted_walk_state: &'a RefCell<Option<NativePetScriptedWalkState>>,
    window_position: &'a Cell<NativePetPosition>,
    window_size: NativePetLogicalSize,
    is_motion_locked: bool,
}

fn native_pet_apply_control_message(
    message: NativePetControlMessage,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) -> BuddyResult<()> {
    native_pet_apply_control_message_with_request_mode(
        message,
        NativePetControlAnimationRequestMode::RuntimeProfile,
        runtime_state,
    )
}

fn native_pet_control_message_moves_window(message: &NativePetControlMessage) -> bool {
    !matches!(message, NativePetControlMessage::SetAnimation(_))
}

fn native_pet_apply_control_message_with_request_mode(
    message: NativePetControlMessage,
    animation_request_mode: NativePetControlAnimationRequestMode,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) -> BuddyResult<()> {
    match message {
        NativePetControlMessage::SetAnimation(animation) => {
            native_pet_apply_control_animation_with_request_mode(
                animation,
                animation_request_mode,
                runtime_state,
            )
        }
        NativePetControlMessage::WalkToEdge { edge, after } => {
            let after = runtime_state
                .pet_animations
                .optional_animation_target_for_key(after.as_ref())?;
            native_pet_start_control_walk(NativePetWalkTarget::Edge(edge), after, runtime_state)
        }
        NativePetControlMessage::WalkToPosition { x, y, after } => {
            let after = runtime_state
                .pet_animations
                .optional_animation_target_for_key(after.as_ref())?;
            native_pet_start_control_walk(
                NativePetWalkTarget::Position { x, y },
                after,
                runtime_state,
            )
        }
        NativePetControlMessage::WalkToX { x, after } => {
            let after = runtime_state
                .pet_animations
                .optional_animation_target_for_key(after.as_ref())?;
            native_pet_start_control_walk(NativePetWalkTarget::X { x }, after, runtime_state)
        }
        NativePetControlMessage::WalkToTarget { target, after } => {
            let after = runtime_state
                .pet_animations
                .optional_animation_target_for_key(after.as_ref())?;
            native_pet_start_control_walk(target, after, runtime_state)
        }
        NativePetControlMessage::WalkByPath { path, after } => {
            let after = runtime_state
                .pet_animations
                .optional_animation_target_for_key(after.as_ref())?;
            native_pet_start_control_walk_path(path, after, runtime_state)
        }
    }
}

fn native_pet_apply_control_animation_with_request_mode(
    animation: NativePetAnimationKey,
    request_mode: NativePetControlAnimationRequestMode,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) -> BuddyResult<()> {
    let animation_target = runtime_state
        .pet_animations
        .animation_target_for_key(&animation)?;
    runtime_state.scripted_walk_state.replace(None);
    let requested = match request_mode {
        NativePetControlAnimationRequestMode::RuntimeProfile
        | NativePetControlAnimationRequestMode::OnceStep => {
            native_pet_requested_animation_for_control_animation(
                runtime_state.pet_animations,
                animation_target,
                runtime_state.lifecycle_action_targets.idle(),
            )
        }
        NativePetControlAnimationRequestMode::LoopForStepDuration => {
            NativePetRequestedAnimationState::from(animation_target)
        }
    };
    if runtime_state.requested_animation.replace(requested) != requested {
        runtime_state.task_presence_elapsed_ms.set(0);
    }
    if !requested.is_idle(runtime_state.lifecycle_action_targets.idle()) {
        if runtime_state.idle_lifecycle_elapsed_ms.get() > 0 {
            runtime_state.idle_presence_schedule_seed.set(
                native_pet_next_idle_presence_schedule_seed(
                    runtime_state.idle_presence_schedule_seed.get(),
                ),
            );
        }
        runtime_state.idle_lifecycle_elapsed_ms.set(0);
    }
    let interaction_state = NativePetLocalInteractionAnimationState::from_playback(
        runtime_state.pet_animations,
        *runtime_state.playback,
    );
    if runtime_state.is_motion_locked
        || matches!(
            request_mode,
            NativePetControlAnimationRequestMode::RuntimeProfile
        ) && native_pet_should_keep_scripted_action_playing(interaction_state)
    {
        return Ok(());
    }

    let target_animation = if animation_target == requested.animation_target() {
        native_pet_animation_for_lifecycle(
            runtime_state.lifecycle_action_targets,
            NativePetLifecycleAnimationInput {
                pointer_hovered: runtime_state.pointer_hovered.get(),
                is_dragging: false,
                is_inertia_active: false,
                requested,
                current: NativePetCurrentAnimationState::from_playback(
                    runtime_state.pet_animations,
                    *runtime_state.playback,
                ),
                idle_elapsed_ms: runtime_state.idle_lifecycle_elapsed_ms.get(),
                idle_presence_schedule_seed: runtime_state.idle_presence_schedule_seed.get(),
            },
        )
        .animation_target()
    } else {
        animation_target
    };
    runtime_state
        .playback
        .restart_animation_target(target_animation);
    Ok(())
}

fn native_pet_control_animation_request_mode_for_execute_step(
    request: &ExecuteStepRequest,
) -> NativePetControlAnimationRequestMode {
    match &request.step {
        ExecuteStepPayload::PlayAction {
            playback: ExecuteStepPlayback::LoopForDuration { .. },
            ..
        } => NativePetControlAnimationRequestMode::LoopForStepDuration,
        ExecuteStepPayload::PlayAction { .. } => NativePetControlAnimationRequestMode::OnceStep,
        _ => NativePetControlAnimationRequestMode::RuntimeProfile,
    }
}

pub(super) fn native_pet_restore_idle_after_active_play_action(
    lifecycle_action_targets: &NativePetLifecycleActionTargets,
    playback: &mut NativePetAnimationPlayback,
    requested_animation: &Cell<NativePetRequestedAnimationState>,
) {
    let idle = lifecycle_action_targets.idle();
    requested_animation.set(NativePetRequestedAnimationState::from(idle));
    playback.restart_animation_target(idle);
}

fn native_pet_restore_idle_after_failed_execute_step(
    request: &ExecuteStepRequest,
    lifecycle_action_targets: &NativePetLifecycleActionTargets,
    playback: &mut NativePetAnimationPlayback,
    requested_animation: &Cell<NativePetRequestedAnimationState>,
) {
    if matches!(request.step, ExecuteStepPayload::PlayAction { .. }) {
        native_pet_restore_idle_after_active_play_action(
            lifecycle_action_targets,
            playback,
            requested_animation,
        );
    }
}

pub(super) fn native_pet_apply_completed_play_action_behavior(
    completion_behavior: SidecarPlayActionCompletionBehavior,
    pet_animations: &NativePetAnimationSet,
    lifecycle_action_targets: &NativePetLifecycleActionTargets,
    playback: &mut NativePetAnimationPlayback,
    requested_animation: &Cell<NativePetRequestedAnimationState>,
) {
    match completion_behavior {
        SidecarPlayActionCompletionBehavior::RestoreIdle => {
            native_pet_restore_idle_after_active_play_action(
                lifecycle_action_targets,
                playback,
                requested_animation,
            );
        }
        SidecarPlayActionCompletionBehavior::HoldLastFrame => {
            playback.hold_last_frame(pet_animations);
        }
        SidecarPlayActionCompletionBehavior::FollowAnimationFallback => {}
    }
}

fn native_pet_start_control_walk(
    target: NativePetWalkTarget,
    after: Option<NativePetAnimationTarget>,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) -> crate::error::BuddyResult<()> {
    native_pet_start_scripted_walk(
        runtime_state.window_position.get(),
        runtime_state.window_size,
        target,
        after,
        NativePetScriptedWalkRuntimeState {
            inertia_state: runtime_state.inertia_state,
            edge_runout_state: runtime_state.edge_runout_state,
            idle_lifecycle_elapsed_ms: runtime_state.idle_lifecycle_elapsed_ms,
            task_presence_elapsed_ms: runtime_state.task_presence_elapsed_ms,
            requested_animation: runtime_state.requested_animation,
            requested_reset_animation: runtime_state.lifecycle_action_targets.idle(),
            scripted_walk_state: runtime_state.scripted_walk_state,
        },
    )
}

fn native_pet_start_control_walk_path(
    path: Vec<NativePetWalkTarget>,
    after: Option<NativePetAnimationTarget>,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) -> crate::error::BuddyResult<()> {
    native_pet_start_scripted_walk_path(
        runtime_state.window_position.get(),
        runtime_state.window_size,
        path,
        after,
        NativePetScriptedWalkRuntimeState {
            inertia_state: runtime_state.inertia_state,
            edge_runout_state: runtime_state.edge_runout_state,
            idle_lifecycle_elapsed_ms: runtime_state.idle_lifecycle_elapsed_ms,
            task_presence_elapsed_ms: runtime_state.task_presence_elapsed_ms,
            requested_animation: runtime_state.requested_animation,
            requested_reset_animation: runtime_state.lifecycle_action_targets.idle(),
            scripted_walk_state: runtime_state.scripted_walk_state,
        },
    )
}

fn native_pet_execute_step_compile_error_response(
    step_request: &ExecuteStepRequest,
    error: &BuddyError,
) -> SidecarStepResponse {
    let code = match error {
        BuddyError::UnsupportedCapability { .. } => SidecarStepErrorCode::UnsupportedStepCapability,
        _ => SidecarStepErrorCode::InvalidExecuteStep,
    };

    SidecarStepResponse::ProtocolError(protocol_error_response_with_code(
        Some(step_request.step_id.as_str()),
        code,
        error.to_string(),
    ))
}

fn native_pet_execute_step_runtime_error_response(
    step_request: &ExecuteStepRequest,
    error: &BuddyError,
) -> SidecarStepResponse {
    SidecarStepResponse::StepFailed(step_failed_response_with_code(
        step_request.step_id.as_str(),
        SidecarStepErrorCode::TargetUnavailable,
        error.to_string(),
        None,
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        compile_execute_step_control_message, native_pet_apply_completed_play_action_behavior,
        native_pet_apply_control_animation_with_request_mode,
        native_pet_control_message_moves_window, native_pet_execute_step_compile_error_response,
        native_pet_execute_step_runtime_error_response,
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
                protocol_error_response_with_code, step_failed_response_with_code,
                ExecuteStepPayload, ExecuteStepPlayback, ExecuteStepRequest,
                SidecarInterruptPolicy, SidecarPlayActionCompletionBehavior, SidecarStepErrorCode,
                SidecarStepResponse, SIDECAR_PROTOCOL_VERSION,
            },
        },
    };
    use std::{
        cell::{Cell, RefCell},
        collections::HashMap,
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

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
        let pet_animations =
            load_default_pet_animation_set().expect("default pet animation set loads");
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
        let pet_animations =
            load_default_pet_animation_set().expect("default pet animation set loads");
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
        let pet_animations =
            load_default_pet_animation_set().expect("default pet animation set loads");
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
        let pet_animations =
            load_default_pet_animation_set().expect("default pet animation set loads");
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
                completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
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
}
