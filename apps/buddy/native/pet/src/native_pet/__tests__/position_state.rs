use super::*;
use crate::native_pet::coordinates::NativePetPosition;

#[test]
fn parses_versioned_rest_position_state() {
    let position = parse_native_pet_position_state(r#"{"version":1,"position":{"x":320,"y":240}}"#)
        .expect("parse position state");

    assert_eq!(position, NativePetPosition { x: 320, y: 240 });
}

#[test]
fn rejects_unknown_position_state_versions() {
    let result = parse_native_pet_position_state(r#"{"version":2,"position":{"x":320,"y":240}}"#);

    assert!(result.is_err());
}

#[test]
fn persists_only_after_user_drag_motion_has_stabilized() {
    assert!(should_persist_native_pet_rest_position(
        true, false, false, false, false,
    ));
    assert!(!should_persist_native_pet_rest_position(
        false, false, false, false, false,
    ));

    for motion in [
        [true, false, false, false],
        [false, true, false, false],
        [false, false, true, false],
        [false, false, false, true],
    ] {
        assert!(!should_persist_native_pet_rest_position(
            true, motion[0], motion[1], motion[2], motion[3],
        ));
    }
}
