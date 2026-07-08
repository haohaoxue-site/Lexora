use super::super::{
    animation::{NativePetAnimationName, NativePetAnimationPlayback},
    geometry::{native_pet_target_size, native_pet_window_size, PET_FRAME_BOTTOM_MARGIN},
};
use super::pose::{native_pet_render_pose, NativePetRenderPose};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetContactShadow {
    pub(super) center_x: f64,
    pub(super) center_y: f64,
    pub(super) height: f64,
    pub(super) opacity: f64,
    pub(super) width: f64,
}

pub(super) fn native_pet_contact_shadow(
    playback: NativePetAnimationPlayback,
) -> NativePetContactShadow {
    let (target_width, _) = native_pet_target_size();
    let (window_width, window_height) = native_pet_window_size();
    let pose = native_pet_render_pose(playback);
    let (width_factor, opacity) = match playback.name {
        NativePetAnimationName::Idle => native_pet_idle_shadow_weight(playback.frame_phase),
        NativePetAnimationName::GrabStart => native_pet_pickup_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Drag => native_pet_drag_shadow_weight(playback.frame_phase),
        NativePetAnimationName::RunLeft | NativePetAnimationName::RunRight => {
            native_pet_running_shadow_weight(playback.frame_phase)
        }
        NativePetAnimationName::Approval => native_pet_approval_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Thinking => native_pet_thinking_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Working => native_pet_working_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Sad => native_pet_sad_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Reassure => native_pet_reassure_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Explain => native_pet_explain_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Curious => native_pet_curious_shadow_weight(playback.frame_phase),
        NativePetAnimationName::TripFallLeft | NativePetAnimationName::TripFallRight => {
            native_pet_trip_fall_shadow_weight(playback.frame_phase)
        }
        NativePetAnimationName::FallenIdleLeft | NativePetAnimationName::FallenIdleRight => {
            native_pet_fallen_shadow_weight()
        }
        NativePetAnimationName::FallenGetUpLeft | NativePetAnimationName::FallenGetUpRight => {
            native_pet_fallen_get_up_shadow_weight(playback.frame_phase)
        }
        NativePetAnimationName::StumbleRecoverLeft
        | NativePetAnimationName::StumbleRecoverRight => {
            native_pet_stumble_recover_shadow_weight(playback.frame_phase)
        }
        NativePetAnimationName::Celebrate => match playback.frame_phase % 8 {
            1 | 2 => (0.56, 0.19),
            4 | 5 => (0.42, 0.1),
            _ => (0.5, 0.16),
        },
        NativePetAnimationName::Hover => native_pet_hover_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Tap => native_pet_tap_shadow_weight(playback.frame_phase),
        NativePetAnimationName::Wake => match playback.frame_phase % 4 {
            0 | 1 => (0.54, 0.15),
            2 => (0.45, 0.12),
            _ => (0.5, 0.16),
        },
        NativePetAnimationName::Sleep => (0.52, 0.14),
    };
    let width = (target_width as f64 * width_factor).round().max(1.0);

    NativePetContactShadow {
        center_x: window_width as f64 / 2.0 + native_pet_shadow_center_x_offset(pose, target_width),
        center_y: window_height as f64 - PET_FRAME_BOTTOM_MARGIN as f64 + 8.0,
        height: (width * 0.16 * native_pet_shadow_height_factor(pose))
            .round()
            .max(6.0),
        opacity,
        width,
    }
}

fn native_pet_shadow_center_x_offset(pose: NativePetRenderPose, target_width: i32) -> f64 {
    (pose.rotation_radians * target_width as f64 * 1.4).clamp(-8.0, 8.0)
}

fn native_pet_shadow_height_factor(pose: NativePetRenderPose) -> f64 {
    (1.0 + pose.offset_y * 0.025).clamp(0.82, 1.16)
}

fn native_pet_idle_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 6 {
        1 => (0.492, 0.153),
        2 => (0.484, 0.146),
        3 => (0.494, 0.155),
        4 => (0.508, 0.168),
        5 => (0.502, 0.161),
        _ => (0.5, 0.16),
    }
}

fn native_pet_pickup_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 4 {
        0 => (0.56, 0.215),
        1 => (0.62, 0.24),
        2 => (0.46, 0.14),
        _ => (0.4, 0.105),
    }
}

fn native_pet_drag_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 6 {
        2 | 3 => (0.36, 0.085),
        _ => (0.38, 0.1),
    }
}

fn native_pet_tap_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 5 {
        0 => (0.59, 0.225),
        1 => (0.54, 0.18),
        2 => (0.42, 0.1),
        3 => (0.46, 0.125),
        _ => (0.52, 0.17),
    }
}

fn native_pet_hover_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 5 {
        0 => (0.49, 0.145),
        1 => (0.47, 0.13),
        2 => (0.44, 0.105),
        3 => (0.455, 0.12),
        _ => (0.49, 0.15),
    }
}

fn native_pet_approval_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 6 {
        2 | 3 => (0.46, 0.125),
        5 => (0.49, 0.145),
        _ => (0.5, 0.155),
    }
}

fn native_pet_thinking_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 8 {
        1..=3 => (0.47, 0.14),
        5..=7 => (0.5, 0.155),
        _ => (0.49, 0.15),
    }
}

fn native_pet_working_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 8 {
        1 | 2 => (0.44, 0.11),
        4 | 5 => (0.56, 0.2),
        _ => (0.5, 0.155),
    }
}

fn native_pet_sad_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 4 {
        1 | 2 => (0.54, 0.18),
        3 => (0.52, 0.165),
        _ => (0.5, 0.155),
    }
}

fn native_pet_reassure_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 5 {
        0 => (0.53, 0.17),
        1 => (0.55, 0.185),
        2 => (0.46, 0.125),
        3 => (0.49, 0.145),
        _ => (0.5, 0.155),
    }
}

fn native_pet_explain_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 6 {
        1 | 2 => (0.48, 0.14),
        3 | 4 => (0.47, 0.13),
        5 => (0.49, 0.15),
        _ => (0.5, 0.155),
    }
}

fn native_pet_curious_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 8 {
        1 | 2 => (0.47, 0.135),
        3 | 4 => (0.45, 0.115),
        5 | 6 => (0.47, 0.135),
        7 => (0.49, 0.15),
        _ => (0.5, 0.155),
    }
}

fn native_pet_trip_fall_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 8 {
        0..=2 => native_pet_running_shadow_weight(frame_phase),
        3 | 4 => (0.6, 0.19),
        5 => (0.54, 0.15),
        _ => native_pet_fallen_shadow_weight(),
    }
}

fn native_pet_fallen_shadow_weight() -> (f64, f64) {
    (0.72, 0.12)
}

fn native_pet_fallen_get_up_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 7 {
        0 | 1 => native_pet_fallen_shadow_weight(),
        2 => (0.64, 0.145),
        3 => (0.56, 0.17),
        4 => (0.5, 0.155),
        5 => (0.47, 0.13),
        _ => (0.5, 0.16),
    }
}

fn native_pet_stumble_recover_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 10 {
        0..=3 => native_pet_running_shadow_weight(frame_phase),
        4 | 5 => (0.58, 0.18),
        6 | 7 => (0.53, 0.155),
        8 => (0.48, 0.14),
        _ => (0.5, 0.16),
    }
}

fn native_pet_running_shadow_weight(frame_phase: usize) -> (f64, f64) {
    match frame_phase % 8 {
        0 => (0.62, 0.2),
        1 => (0.55, 0.165),
        2 => (0.45, 0.115),
        3 => (0.52, 0.15),
        4 => (0.57, 0.18),
        5 => (0.51, 0.145),
        6 => (0.48, 0.13),
        _ => (0.53, 0.155),
    }
}
