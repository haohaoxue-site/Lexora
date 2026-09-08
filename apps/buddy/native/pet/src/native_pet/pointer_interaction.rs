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
#[path = "__tests__/pointer_interaction.rs"]
mod tests;
