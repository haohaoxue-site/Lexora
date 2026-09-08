use super::animation::{
    NativePetAnimationPlayback, NativePetAnimationRenderProfile, NativePetAnimationSet,
    NativePetSpritesheetGeometry,
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

pub(super) fn native_pet_frame_rect(
    geometry: NativePetSpritesheetGeometry,
    frame_index: usize,
) -> NativePetFrameRect {
    let column = (frame_index % geometry.sheet_columns()) as i32;
    let row = (frame_index / geometry.sheet_columns()) as i32;

    NativePetFrameRect {
        x: column * geometry.frame_width(),
        y: row * geometry.frame_height(),
        width: geometry.frame_width(),
        height: geometry.frame_height(),
    }
}

pub(super) fn native_pet_target_size(geometry: NativePetSpritesheetGeometry) -> (i32, i32) {
    (
        (geometry.frame_width() as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
        (geometry.frame_height() as f64 * DEFAULT_PET_DISPLAY_SCALE).round() as i32,
    )
}

pub(super) fn native_pet_window_size(geometry: NativePetSpritesheetGeometry) -> (i32, i32) {
    let size = native_pet_window_logical_size(geometry);
    (size.width, size.height)
}

pub(super) fn native_pet_window_logical_size(
    geometry: NativePetSpritesheetGeometry,
) -> NativePetLogicalSize {
    let (target_width, target_height) = native_pet_target_size(geometry);

    NativePetLogicalSize::new(
        target_width + PET_WINDOW_SIDE_PADDING * 2,
        target_height + PET_WINDOW_TOP_PADDING + PET_FRAME_BOTTOM_MARGIN,
    )
}

pub(super) fn native_pet_bob_offset(
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
) -> i32 {
    if matches!(
        animations.render_profile_for_playback(playback),
        NativePetAnimationRenderProfile::GrabStart
            | NativePetAnimationRenderProfile::Drag
            | NativePetAnimationRenderProfile::RunLeft
            | NativePetAnimationRenderProfile::RunRight
            | NativePetAnimationRenderProfile::Dance
            | NativePetAnimationRenderProfile::Sleep
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
#[path = "__tests__/geometry.rs"]
mod tests;
