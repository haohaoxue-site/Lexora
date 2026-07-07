use super::animation::{
    NativePetAnimationName, NativePetAnimationPlayback, PET_FRAME_HEIGHT, PET_FRAME_WIDTH,
    PET_SPRITESHEET_COLUMNS,
};
use super::coordinates::NativePetLogicalSize;

const PET_WINDOW_SIDE_PADDING: i32 = 48;
const PET_WINDOW_TOP_PADDING: i32 = 48;
const DEFAULT_PET_DISPLAY_SCALE: f64 = 0.88;
pub(super) const PET_FRAME_BOTTOM_MARGIN: i32 = 28;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetFacing {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetFrameRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: i32,
    pub(super) height: i32,
}

pub(super) fn native_pet_frame_rect(frame_index: usize) -> NativePetFrameRect {
    let column = (frame_index % PET_SPRITESHEET_COLUMNS) as i32;
    let row = (frame_index / PET_SPRITESHEET_COLUMNS) as i32;

    NativePetFrameRect {
        x: column * PET_FRAME_WIDTH,
        y: row * PET_FRAME_HEIGHT,
        width: PET_FRAME_WIDTH,
        height: PET_FRAME_HEIGHT,
    }
}

pub(super) fn native_pet_target_size() -> (i32, i32) {
    (
        (PET_FRAME_WIDTH as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
        (PET_FRAME_HEIGHT as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
    )
}

pub(super) fn native_pet_window_size() -> (i32, i32) {
    let size = native_pet_window_logical_size();
    (size.width, size.height)
}

pub(super) fn native_pet_window_logical_size() -> NativePetLogicalSize {
    let (target_width, target_height) = native_pet_target_size();

    NativePetLogicalSize::new(
        target_width + PET_WINDOW_SIDE_PADDING * 2,
        target_height + PET_WINDOW_TOP_PADDING + PET_FRAME_BOTTOM_MARGIN,
    )
}

pub(super) fn native_pet_bob_offset(playback: NativePetAnimationPlayback) -> i32 {
    if matches!(
        playback.name,
        NativePetAnimationName::GrabStart
            | NativePetAnimationName::Drag
            | NativePetAnimationName::RunLeft
            | NativePetAnimationName::RunRight
            | NativePetAnimationName::Sleep
    ) {
        return 0;
    }

    match playback.frame_phase % 8 {
        1 | 2 => -4,
        3 | 4 => 3,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::{native_pet_bob_offset, native_pet_frame_rect};
    use crate::native_pet::animation::{
        NativePetAnimationName, NativePetAnimationPlayback, PET_FRAME_HEIGHT, PET_FRAME_WIDTH,
        PET_SPRITESHEET_COLUMNS,
    };

    #[test]
    fn maps_native_pet_frame_index_to_spritesheet_rect() {
        let first = native_pet_frame_rect(0);
        assert_eq!(first.x, 0);
        assert_eq!(first.y, 0);
        assert_eq!(first.width, PET_FRAME_WIDTH);
        assert_eq!(first.height, PET_FRAME_HEIGHT);

        let next_row = native_pet_frame_rect(PET_SPRITESHEET_COLUMNS);
        assert_eq!(next_row.x, 0);
        assert_eq!(next_row.y, PET_FRAME_HEIGHT);
    }

    #[test]
    fn keeps_sleep_on_a_stable_resting_baseline_without_idle_bob() {
        let mut idle = NativePetAnimationPlayback::new(NativePetAnimationName::Idle);
        idle.frame_phase = 2;
        let mut sleep = NativePetAnimationPlayback::new(NativePetAnimationName::Sleep);
        sleep.frame_phase = 2;

        assert_ne!(native_pet_bob_offset(idle), 0);
        assert_eq!(native_pet_bob_offset(sleep), 0);
    }
}
