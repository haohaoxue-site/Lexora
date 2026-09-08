use super::*;

#[test]
fn opens_chat_for_nearby_second_primary_click() {
    let previous = NativePetOpenChatClick {
        time_ms: 1_000,
        position: NativePetLogicalPoint::new(80.0, 120.0),
    };

    assert!(native_pet_open_chat_click_matches(
        Some(previous),
        1_260,
        NativePetLogicalPoint::new(88.0, 130.0),
    ));
}

#[test]
fn ignores_invalid_open_chat_candidates() {
    let previous = NativePetOpenChatClick {
        time_ms: 1_000,
        position: NativePetLogicalPoint::new(80.0, 120.0),
    };
    let cases = [
        (
            "stale click",
            Some(previous),
            1_800,
            NativePetLogicalPoint::new(82.0, 121.0),
        ),
        (
            "distant click",
            Some(previous),
            1_220,
            NativePetLogicalPoint::new(140.0, 120.0),
        ),
        (
            "missing previous click",
            None,
            1_220,
            NativePetLogicalPoint::new(80.0, 120.0),
        ),
    ];

    for (label, previous, current_time_ms, current_position) in cases {
        assert!(
            !native_pet_open_chat_click_matches(previous, current_time_ms, current_position),
            "candidate should be ignored: {label}"
        );
    }
}

#[test]
fn maps_pointer_press_state_to_open_chat_eligibility() {
    let cases = [(true, 1, true), (false, 1, false), (true, 3, false)];

    for (pointer_hits_visible_pet, button, expected) in cases {
        assert_eq!(
            native_pet_pointer_press_can_open_chat(pointer_hits_visible_pet, button),
            expected
        );
    }
}

#[test]
fn keeps_open_chat_candidate_when_drag_release_stays_nearby() {
    let previous = NativePetOpenChatClick {
        time_ms: 1_000,
        position: NativePetLogicalPoint::new(80.0, 120.0),
    };

    assert!(!native_pet_open_chat_release_cancels_candidate(
        previous,
        NativePetLogicalPoint::new(88.0, 130.0),
    ));
}

#[test]
fn cancels_open_chat_candidate_when_drag_release_moves_too_far() {
    let previous = NativePetOpenChatClick {
        time_ms: 1_000,
        position: NativePetLogicalPoint::new(80.0, 120.0),
    };

    assert!(native_pet_open_chat_release_cancels_candidate(
        previous,
        NativePetLogicalPoint::new(140.0, 120.0),
    ));
}

#[test]
fn maps_window_local_pointer_position_into_drag_tracking_space() {
    let position = native_pet_window_local_pointer_tracking_position(
        NativePetPosition { x: 924, y: 686 },
        84.0,
        66.0,
    );

    assert_eq!(position, Some(NativePetLogicalPoint::new(1008.0, 752.0)));
}

#[test]
fn rejects_non_finite_window_local_pointer_position() {
    let position = native_pet_window_local_pointer_tracking_position(
        NativePetPosition { x: 924, y: 686 },
        f64::NAN,
        66.0,
    );

    assert_eq!(position, None);
}
