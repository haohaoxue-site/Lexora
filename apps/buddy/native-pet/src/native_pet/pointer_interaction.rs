use super::coordinates::{native_pet_cursor_position, NativePetLogicalPoint, NativePetPosition};

const NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_MS: u64 = 450;
const NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE: f64 = 24.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetOpenChatClick {
    pub(super) time_ms: u64,
    pub(super) position: NativePetLogicalPoint,
}

pub(super) fn native_pet_pointer_press_can_open_chat(
    pointer_hits_visible_pet: bool,
    button: u32,
) -> bool {
    pointer_hits_visible_pet && button == 1
}

pub(super) fn native_pet_open_chat_click_matches(
    previous: Option<NativePetOpenChatClick>,
    current_time_ms: u64,
    current_position: NativePetLogicalPoint,
) -> bool {
    let Some(previous) = previous else {
        return false;
    };

    let elapsed_ms = current_time_ms.saturating_sub(previous.time_ms);
    elapsed_ms > 0
        && elapsed_ms <= NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_MS
        && previous.position.distance_to(current_position)
            <= NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE
}

pub(super) fn native_pet_open_chat_release_cancels_candidate(
    previous: NativePetOpenChatClick,
    release_position: NativePetLogicalPoint,
) -> bool {
    previous.position.distance_to(release_position) > NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE
}

pub(super) fn native_pet_should_start_pointer_interaction(pointer_hits_visible_pet: bool) -> bool {
    pointer_hits_visible_pet
}

pub(super) fn native_pet_pointer_cursor_name(
    pointer_hits_visible_pet: bool,
    is_dragging: bool,
) -> Option<&'static str> {
    if is_dragging {
        return Some("grabbing");
    }

    if pointer_hits_visible_pet {
        return Some("grab");
    }

    None
}

pub(super) fn native_pet_window_local_pointer_tracking_position(
    window_position: NativePetPosition,
    local_x: f64,
    local_y: f64,
) -> Option<NativePetLogicalPoint> {
    native_pet_cursor_position(
        f64::from(window_position.x) + local_x,
        f64::from(window_position.y) + local_y,
    )
}

#[cfg(test)]
mod tests {
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

    #[test]
    fn maps_pointer_hit_and_drag_state_to_cursor_feedback() {
        let cases = [
            (false, false, None),
            (true, false, Some("grab")),
            (true, true, Some("grabbing")),
        ];

        for (pointer_hits_visible_pet, is_dragging, expected) in cases {
            assert_eq!(
                native_pet_pointer_cursor_name(pointer_hits_visible_pet, is_dragging),
                expected
            );
        }
    }
}
