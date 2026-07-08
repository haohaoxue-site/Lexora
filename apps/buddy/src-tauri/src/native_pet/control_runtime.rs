use std::{
    cell::{Cell, RefCell},
    sync::mpsc,
};

use super::{
    animation::{NativePetAnimationName, NativePetAnimationPlayback},
    control_state::{native_pet_control_state_response, NativePetControlStateSnapshot},
    coordinates::{NativePetLogicalSize, NativePetPosition},
    edge_runout::NativePetEdgeRunoutState,
    lifecycle::{
        native_pet_animation_for_lifecycle, native_pet_next_idle_presence_schedule_seed,
        native_pet_requested_animation_for_control_animation,
        native_pet_should_keep_scripted_action_playing,
    },
    physics::NativePetInertiaState,
    process::{
        drain_native_pet_control_requests, native_pet_control_capabilities_response,
        native_pet_control_ok_response, NativePetControlMessage, NativePetControlPoll,
        NativePetControlRequest, NativePetControlRequestKind, NativePetWalkTarget,
    },
    scripted_walk::{
        native_pet_start_scripted_walk, NativePetScriptedWalkRuntimeState,
        NativePetScriptedWalkState,
    },
};

pub(super) struct NativePetControlRuntimeState<'a> {
    pub(super) control_messages: &'a mpsc::Receiver<NativePetControlRequest>,
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) requested_animation: &'a Cell<NativePetAnimationName>,
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
}

pub(super) fn native_pet_drain_control_runtime_requests(
    runtime_state: NativePetControlRuntimeState<'_>,
) -> NativePetControlPoll {
    let NativePetControlRuntimeState {
        control_messages,
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
    } = runtime_state;

    drain_native_pet_control_requests(control_messages, |request| {
        let response = match request.kind() {
            NativePetControlRequestKind::QueryState => {
                native_pet_control_state_response(NativePetControlStateSnapshot {
                    current_position: window_position.get(),
                    current_monitor_index: window_monitor_index.get(),
                    window_size,
                    current_animation: playback.name,
                    requested_animation: requested_animation.get(),
                    scripted_walk_state: *scripted_walk_state.borrow(),
                    is_dragging,
                    is_inertia_active: inertia_state.borrow().is_some(),
                    is_edge_runout_active: edge_runout_state.get().is_some(),
                })
            }
            NativePetControlRequestKind::QueryCapabilities => {
                native_pet_control_capabilities_response()
            }
            NativePetControlRequestKind::Command(message) => {
                native_pet_apply_control_message(
                    message,
                    NativePetControlCommandRuntimeState {
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
                );
                native_pet_control_ok_response()
            }
        };
        request.respond(response);
    })
}

struct NativePetControlCommandRuntimeState<'a> {
    playback: &'a mut NativePetAnimationPlayback,
    requested_animation: &'a Cell<NativePetAnimationName>,
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
) {
    match message {
        NativePetControlMessage::SetAnimation(animation) => {
            native_pet_apply_control_animation(animation, runtime_state);
        }
        NativePetControlMessage::WalkToEdge { edge, after } => {
            native_pet_start_control_walk(NativePetWalkTarget::Edge(edge), after, runtime_state);
        }
        NativePetControlMessage::WalkToPosition { x, y, after } => {
            native_pet_start_control_walk(
                NativePetWalkTarget::Position { x, y },
                after,
                runtime_state,
            );
        }
        NativePetControlMessage::WalkToX { x, after } => {
            native_pet_start_control_walk(NativePetWalkTarget::X { x }, after, runtime_state);
        }
        NativePetControlMessage::WalkToTarget { target, after } => {
            native_pet_start_control_walk(target, after, runtime_state);
        }
    }
}

fn native_pet_apply_control_animation(
    animation: NativePetAnimationName,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) {
    runtime_state.scripted_walk_state.replace(None);
    let requested = native_pet_requested_animation_for_control_animation(animation);
    if runtime_state.requested_animation.replace(requested) != requested {
        runtime_state.task_presence_elapsed_ms.set(0);
    }
    if !matches!(requested, NativePetAnimationName::Idle) {
        if runtime_state.idle_lifecycle_elapsed_ms.get() > 0 {
            runtime_state.idle_presence_schedule_seed.set(
                native_pet_next_idle_presence_schedule_seed(
                    runtime_state.idle_presence_schedule_seed.get(),
                ),
            );
        }
        runtime_state.idle_lifecycle_elapsed_ms.set(0);
    }
    if runtime_state.is_motion_locked
        || native_pet_should_keep_scripted_action_playing(runtime_state.playback.name)
    {
        return;
    }

    let target_animation = if animation == requested {
        native_pet_animation_for_lifecycle(
            runtime_state.pointer_hovered.get(),
            false,
            false,
            requested,
            runtime_state.playback.name,
            runtime_state.idle_lifecycle_elapsed_ms.get(),
            runtime_state.idle_presence_schedule_seed.get(),
        )
    } else {
        animation
    };
    runtime_state.playback.restart_animation(target_animation);
}

fn native_pet_start_control_walk(
    target: NativePetWalkTarget,
    after: Option<NativePetAnimationName>,
    runtime_state: NativePetControlCommandRuntimeState<'_>,
) {
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
            scripted_walk_state: runtime_state.scripted_walk_state,
        },
    );
}
