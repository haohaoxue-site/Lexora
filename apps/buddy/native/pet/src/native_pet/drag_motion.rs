use super::{
    coordinates::{NativePetLogicalOffset, NativePetLogicalPoint},
    drag_state::{
        NativePetDragFrameUpdate, NativePetDragPhase, NativePetDragRelease,
        NativePetDragStateMachine,
    },
    physics_params::NativePetPhysicsParams,
};

const NATIVE_PET_DRAG_COMMIT_INTERVAL_MS: u64 = 16;

#[derive(Debug, Clone)]
pub(super) struct NativePetDragMotionState {
    last_commit_frame_time_ms: Option<u64>,
    machine: NativePetDragStateMachine,
}

impl NativePetDragMotionState {
    pub(super) fn new(machine: NativePetDragStateMachine) -> Self {
        Self {
            last_commit_frame_time_ms: None,
            machine,
        }
    }

    pub(super) fn grab_offset(&self) -> NativePetLogicalOffset {
        self.machine.grab_offset()
    }

    pub(super) fn latest_cursor_position(&self) -> NativePetLogicalPoint {
        self.machine.latest_cursor_position()
    }

    pub(super) fn phase(&self) -> NativePetDragPhase {
        self.machine.phase()
    }

    pub(super) fn release(self, physics_params: &NativePetPhysicsParams) -> NativePetDragRelease {
        self.machine.release(physics_params)
    }
}

pub(super) fn native_pet_record_drag_motion_sample(
    state: &mut NativePetDragMotionState,
    cursor_position: NativePetLogicalPoint,
    event_time_ms: u64,
) {
    state
        .machine
        .record_pointer_sample(cursor_position, event_time_ms);
}

pub(super) fn native_pet_flush_drag_motion_sample(
    state: &mut NativePetDragMotionState,
    cursor_position: NativePetLogicalPoint,
    event_time_ms: u64,
) -> Option<NativePetDragFrameUpdate> {
    state
        .machine
        .flush_pointer_sample(cursor_position, event_time_ms)
}

pub(super) fn native_pet_take_drag_frame_update(
    state: &mut NativePetDragMotionState,
    frame_time_ms: u64,
) -> Option<NativePetDragFrameUpdate> {
    if !native_pet_should_commit_drag_frame(state.last_commit_frame_time_ms, frame_time_ms) {
        return None;
    }

    let update = state.machine.take_frame_update()?;
    state.last_commit_frame_time_ms = Some(frame_time_ms);
    Some(update)
}

fn native_pet_should_commit_drag_frame(
    last_commit_frame_time_ms: Option<u64>,
    frame_time_ms: u64,
) -> bool {
    last_commit_frame_time_ms
        .map(|last_commit_frame_time_ms| {
            frame_time_ms.saturating_sub(last_commit_frame_time_ms)
                >= NATIVE_PET_DRAG_COMMIT_INTERVAL_MS
        })
        .unwrap_or(true)
}

#[cfg(test)]
#[path = "__tests__/drag_motion.rs"]
mod tests;
