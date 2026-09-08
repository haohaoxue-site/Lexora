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
#[path = "__tests__/control_runtime.rs"]
mod tests;
