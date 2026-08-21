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
mod tests {
    use super::*;
    use crate::native_pet::coordinates::NativePetPosition;

    #[test]
    fn frame_update_coalesces_multiple_samples_until_frame_clock() {
        let mut motion = NativePetDragMotionState::new(NativePetDragStateMachine::begin(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(500.0, 500.0),
            0,
        ));

        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(512.0, 506.0),
            8,
        );
        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(528.0, 514.0),
            12,
        );
        let update =
            native_pet_take_drag_frame_update(&mut motion, 16).expect("frame-clock update");

        assert_eq!(update.phase, NativePetDragPhase::Dragging);
        assert_eq!(update.position, NativePetPosition { x: 228, y: 314 });
        assert!(native_pet_take_drag_frame_update(&mut motion, 32).is_none());
    }

    #[test]
    fn frame_update_waits_for_frame_clock_before_committing_position() {
        let mut motion = NativePetDragMotionState::new(NativePetDragStateMachine::begin(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(500.0, 500.0),
            0,
        ));

        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(512.0, 506.0),
            8,
        );

        let frame_update =
            native_pet_take_drag_frame_update(&mut motion, 16).expect("frame-clock update");
        assert_eq!(frame_update.phase, NativePetDragPhase::Dragging);
        assert_eq!(frame_update.position, NativePetPosition { x: 212, y: 306 });
    }

    #[test]
    fn frame_updates_are_rate_limited_while_preserving_latest_pointer_position() {
        let mut motion = NativePetDragMotionState::new(NativePetDragStateMachine::begin(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(500.0, 500.0),
            0,
        ));

        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(512.0, 506.0),
            6,
        );
        let first = native_pet_take_drag_frame_update(&mut motion, 6).expect("first frame update");
        assert_eq!(first.position, NativePetPosition { x: 212, y: 306 });

        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(528.0, 514.0),
            12,
        );
        assert!(native_pet_take_drag_frame_update(&mut motion, 12).is_none());

        native_pet_record_drag_motion_sample(
            &mut motion,
            NativePetLogicalPoint::new(540.0, 520.0),
            22,
        );
        let second =
            native_pet_take_drag_frame_update(&mut motion, 22).expect("second frame update");
        assert_eq!(second.position, NativePetPosition { x: 240, y: 320 });
    }
}
