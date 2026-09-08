use super::{NativePetDragPhase, NativePetDragStateMachine, PET_DRAG_START_DISTANCE};
use crate::native_pet::{
    coordinates::{NativePetLogicalOffset, NativePetLogicalPoint, NativePetPosition},
    physics_params::NativePetPhysicsParams,
};

#[test]
fn stores_explicit_grab_offset_on_pointer_down() {
    let drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(212.5, 294.0),
        10,
    );

    assert_eq!(drag.phase(), NativePetDragPhase::Pressed);
    assert_eq!(drag.grab_offset().x, 12.5);
    assert_eq!(drag.grab_offset().y, -6.0);
}

#[test]
fn maps_dragged_window_position_from_cursor_minus_offset() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(1000.0, 1000.0),
        0,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(1012.4, 995.2), 16);
    let update = drag.take_frame_update().expect("frame update");

    assert_eq!(update.position, NativePetPosition { x: 212, y: 295 });
}

#[test]
fn preserves_same_grab_offset_across_multiple_moves() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 320, y: 240 },
        NativePetLogicalPoint::new(1000.0, 800.0),
        0,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(1030.0, 812.0), 8);
    let first = drag.take_frame_update().expect("first update");
    drag.record_pointer_sample(NativePetLogicalPoint::new(1075.0, 845.0), 16);
    let second = drag.take_frame_update().expect("second update");

    assert_eq!(first.position, NativePetPosition { x: 350, y: 252 });
    assert_eq!(second.position, NativePetPosition { x: 395, y: 285 });
}

#[test]
fn can_start_with_window_local_grab_offset_when_cached_window_origin_is_stale() {
    let mut drag = NativePetDragStateMachine::begin_with_grab_offset(
        NativePetLogicalPoint::new(1000.0, 800.0),
        NativePetLogicalOffset { x: 84.0, y: 66.0 },
        0,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(1030.0, 818.0), 16);
    let update = drag.take_frame_update().expect("frame update");

    assert_eq!(update.position, NativePetPosition { x: 946, y: 752 });
}

#[test]
fn transitions_from_pressed_to_dragging_after_start_distance() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(500.0, 500.0),
        0,
    );

    drag.record_pointer_sample(
        NativePetLogicalPoint::new(500.0 + PET_DRAG_START_DISTANCE - 0.1, 500.0),
        8,
    );
    let near = drag.take_frame_update().expect("near-threshold update");
    assert_eq!(near.phase, NativePetDragPhase::Pressed);

    drag.record_pointer_sample(
        NativePetLogicalPoint::new(500.0 + PET_DRAG_START_DISTANCE + 0.1, 500.0),
        16,
    );
    let far = drag.take_frame_update().expect("far-threshold update");
    assert_eq!(far.phase, NativePetDragPhase::Dragging);
}

#[test]
fn release_with_duplicate_samples_does_not_panic() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalPoint::new(1000.0, 1000.0),
        5,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(1000.0, 1000.0), 5);
    drag.record_pointer_sample(NativePetLogicalPoint::new(1000.0, 1000.0), 5);
    assert!(drag.take_frame_update().is_none());

    let release = drag.release(&NativePetPhysicsParams::default());
    assert_eq!(release.phase_before_release, NativePetDragPhase::Pressed);
    assert_eq!(release.release_velocity.speed(), 0.0);
}

#[test]
fn ignores_stale_release_sample_instead_of_jumping_back() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(500.0, 500.0),
        10,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(560.0, 500.0), 30);
    let latest_update = drag.take_frame_update().expect("latest frame update");
    assert_eq!(latest_update.position, NativePetPosition { x: 260, y: 300 });

    let stale_release_update =
        drag.flush_pointer_sample(NativePetLogicalPoint::new(530.0, 500.0), 20);

    assert!(stale_release_update.is_none());
    assert_eq!(
        drag.latest_cursor_position(),
        NativePetLogicalPoint::new(560.0, 500.0)
    );
}

#[test]
fn ignores_non_finite_pointer_sample_instead_of_committing_window_move() {
    let mut drag = NativePetDragStateMachine::begin(
        NativePetPosition { x: 200, y: 300 },
        NativePetLogicalPoint::new(500.0, 500.0),
        0,
    );

    drag.record_pointer_sample(NativePetLogicalPoint::new(f64::NAN, 500.0), 16);

    assert!(drag.take_frame_update().is_none());
    assert_eq!(
        drag.latest_cursor_position(),
        NativePetLogicalPoint::new(500.0, 500.0)
    );
}
