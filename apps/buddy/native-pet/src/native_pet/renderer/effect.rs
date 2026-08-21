use super::super::{
    animation::{NativePetAnimationPlayback, NativePetAnimationSet, NativePetSpritesheetGeometry},
    geometry::{native_pet_target_size, native_pet_window_size, PET_FRAME_BOTTOM_MARGIN},
};
use super::pose::{NativePetRenderProfile, NativePetRenderProfileKind};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetCastEffect {
    pub(super) center_x: f64,
    pub(super) center_y: f64,
    pub(super) opacity: f64,
    pub(super) radius: f64,
    pub(super) spark_radius: f64,
    pub(super) spark_x: f64,
    pub(super) spark_y: f64,
    pub(super) stroke_width: f64,
}

pub(super) fn native_pet_cast_effect(
    geometry: NativePetSpritesheetGeometry,
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
) -> Option<NativePetCastEffect> {
    let profile = NativePetRenderProfile::from_playback(animations, playback);
    if profile.kind() != NativePetRenderProfileKind::Cast {
        return None;
    }

    let pulse = match profile.frame_phase() {
        1 => 0.3,
        2 => 0.72,
        3..=5 => 1.0,
        6 => 0.48,
        _ => return None,
    };
    let (target_width, target_height) = native_pet_target_size(geometry);
    let (window_width, window_height) = native_pet_window_size(geometry);
    let center_x = window_width as f64 / 2.0;
    let center_y =
        window_height as f64 - PET_FRAME_BOTTOM_MARGIN as f64 - target_height as f64 * 0.56;
    let radius = target_width as f64 * (0.24 + pulse * 0.045);

    Some(NativePetCastEffect {
        center_x,
        center_y,
        opacity: 0.16 + pulse * 0.18,
        radius,
        spark_radius: (target_width as f64 * (0.012 + pulse * 0.006)).max(2.0),
        spark_x: center_x + radius * 0.62,
        spark_y: center_y - radius * 0.45,
        stroke_width: (target_width as f64 * 0.012).max(1.6),
    })
}
