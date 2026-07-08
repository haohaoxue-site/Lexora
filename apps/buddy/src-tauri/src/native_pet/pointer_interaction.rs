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
    fn ignores_stale_open_chat_candidate() {
        let previous = NativePetOpenChatClick {
            time_ms: 1_000,
            position: NativePetLogicalPoint::new(80.0, 120.0),
        };

        assert!(!native_pet_open_chat_click_matches(
            Some(previous),
            1_800,
            NativePetLogicalPoint::new(82.0, 121.0),
        ));
    }

    #[test]
    fn ignores_distant_open_chat_candidate() {
        let previous = NativePetOpenChatClick {
            time_ms: 1_000,
            position: NativePetLogicalPoint::new(80.0, 120.0),
        };

        assert!(!native_pet_open_chat_click_matches(
            Some(previous),
            1_220,
            NativePetLogicalPoint::new(140.0, 120.0),
        ));
    }

    #[test]
    fn ignores_missing_open_chat_candidate() {
        assert!(!native_pet_open_chat_click_matches(
            None,
            1_220,
            NativePetLogicalPoint::new(80.0, 120.0),
        ));
    }

    #[test]
    fn allows_primary_pointer_press_on_visible_pet_for_open_chat_candidate() {
        assert!(native_pet_pointer_press_can_open_chat(true, 1));
    }

    #[test]
    fn ignores_transparent_pointer_press_for_open_chat_candidate() {
        assert!(!native_pet_pointer_press_can_open_chat(false, 1));
    }

    #[test]
    fn ignores_secondary_pointer_press_for_open_chat_candidate() {
        assert!(!native_pet_pointer_press_can_open_chat(true, 3));
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
    fn starts_pointer_interaction_only_on_visible_pet_pixels() {
        assert!(native_pet_should_start_pointer_interaction(true));
        assert!(!native_pet_should_start_pointer_interaction(false));
    }

    #[test]
    fn clears_pointer_cursor_when_pet_is_not_hit() {
        assert_eq!(native_pet_pointer_cursor_name(false, false), None);
    }

    #[test]
    fn maps_pointer_hit_state_to_grab_cursor_feedback() {
        assert_eq!(native_pet_pointer_cursor_name(true, false), Some("grab"));
    }

    #[test]
    fn maps_drag_state_to_grabbing_cursor_feedback() {
        assert_eq!(native_pet_pointer_cursor_name(true, true), Some("grabbing"));
    }
}
