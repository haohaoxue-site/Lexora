use super::*;
use crate::native_pet::coordinates::NativePetPosition;

#[test]
fn frame_update_coalesces_multiple_samples_until_frame_clock() {
    let mut motion = NativePetDragMotionState::new(NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(500.0, 500.0),
        0,
    ));

    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(512.0, 506.0), 8);
    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(528.0, 514.0), 12);
    let update = native_pet_take_drag_frame_update(&mut motion, 16).expect("frame-clock update");

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

    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(512.0, 506.0), 8);

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

    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(512.0, 506.0), 6);
    let first = native_pet_take_drag_frame_update(&mut motion, 6).expect("first frame update");
    assert_eq!(first.position, NativePetPosition { x: 212, y: 306 });

    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(528.0, 514.0), 12);
    assert!(native_pet_take_drag_frame_update(&mut motion, 12).is_none());

    native_pet_record_drag_motion_sample(&mut motion, NativePetLogicalPoint::new(540.0, 520.0), 22);
    let second = native_pet_take_drag_frame_update(&mut motion, 22).expect("second frame update");
    assert_eq!(second.position, NativePetPosition { x: 240, y: 320 });
}
