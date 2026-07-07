use gdk::prelude::GdkContextExt;
use gtk::prelude::*;

use super::{
    animation::{NativePetAnimationName, NativePetAnimationPlayback, NativePetAnimationSet},
    geometry::{
        native_pet_bob_offset, native_pet_frame_rect, native_pet_target_size,
        native_pet_window_size, NativePetFacing, PET_FRAME_BOTTOM_MARGIN,
    },
};

#[derive(Debug, Clone, Copy, PartialEq)]
struct NativePetContactShadow {
    center_x: f64,
    center_y: f64,
    height: f64,
    opacity: f64,
    width: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NativePetRenderPose {
    offset_y: f64,
    rotation_radians: f64,
    scale_x: f64,
    scale_y: f64,
}

pub(super) fn clear_transparent(context: &cairo::Context) {
    let _ = context.save();
    context.set_operator(cairo::Operator::Source);
    context.set_source_rgba(0.0, 0.0, 0.0, 0.0);
    let _ = context.paint();
    let _ = context.restore();
}

pub(super) fn install_transparent_window_css(screen: &gdk::Screen) {
    let provider = gtk::CssProvider::new();
    if provider
        .load_from_data(b"window { background-color: transparent; box-shadow: none; }")
        .is_err()
    {
        return;
    }

    gtk::StyleContext::add_provider_for_screen(
        screen,
        &provider,
        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

pub(super) fn draw_pet_frame(
    context: &cairo::Context,
    spritesheet: &gdk_pixbuf::Pixbuf,
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
    facing: NativePetFacing,
) {
    let frame_index = animations.frame_index(playback);
    let frame_rect = native_pet_frame_rect(frame_index);
    if spritesheet.width() < frame_rect.x + frame_rect.width
        || spritesheet.height() < frame_rect.y + frame_rect.height
    {
        return;
    }

    let frame = spritesheet.new_subpixbuf(
        frame_rect.x,
        frame_rect.y,
        frame_rect.width,
        frame_rect.height,
    );
    let (target_width, target_height) = native_pet_target_size();
    let Some(mut frame) =
        frame.scale_simple(target_width, target_height, gdk_pixbuf::InterpType::Hyper)
    else {
        return;
    };
    if native_pet_should_mirror_frame(playback, facing) {
        if let Some(flipped) = frame.flip(true) {
            frame = flipped;
        }
    }

    let (window_width, window_height) = native_pet_window_size();
    let x = (window_width - target_width) / 2;
    let y =
        window_height - target_height - PET_FRAME_BOTTOM_MARGIN + native_pet_bob_offset(playback);
    draw_pet_contact_shadow(context, native_pet_contact_shadow(playback));
    draw_pet_pixbuf_with_pose(
        context,
        &frame,
        x as f64,
        y as f64,
        target_width as f64,
        target_height as f64,
        native_pet_render_pose(playback),
    );
}

pub(super) fn native_pet_pointer_hits_visible_pet(
    spritesheet: &gdk_pixbuf::Pixbuf,
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
    window_x: f64,
    window_y: f64,
) -> bool {
    let frame_index = animations.frame_index(playback);
    let frame_rect = native_pet_frame_rect(frame_index);
    if spritesheet.width() < frame_rect.x + frame_rect.width
        || spritesheet.height() < frame_rect.y + frame_rect.height
    {
        return false;
    }

    let (target_width, target_height) = native_pet_target_size();
    let (window_width, window_height) = native_pet_window_size();
    let frame_x = (window_width - target_width) as f64 / 2.0;
    let frame_y = (window_height - target_height - PET_FRAME_BOTTOM_MARGIN) as f64
        + native_pet_bob_offset(playback) as f64;
    let pose = native_pet_render_pose(playback);
    let anchor_x = frame_x + target_width as f64 / 2.0;
    let anchor_y = frame_y + target_height as f64 + pose.offset_y;
    let dx = window_x - anchor_x;
    let dy = window_y - anchor_y;
    let rotation_cos = pose.rotation_radians.cos();
    let rotation_sin = pose.rotation_radians.sin();
    let unrotated_x = dx * rotation_cos + dy * rotation_sin;
    let unrotated_y = -dx * rotation_sin + dy * rotation_cos;
    let image_x = unrotated_x / pose.scale_x + target_width as f64 / 2.0;
    let image_y = unrotated_y / pose.scale_y + target_height as f64;
    if image_x < 0.0
        || image_y < 0.0
        || image_x >= target_width as f64
        || image_y >= target_height as f64
    {
        return false;
    }

    let source_x =
        frame_rect.x + ((image_x / target_width as f64) * frame_rect.width as f64).floor() as i32;
    let source_y =
        frame_rect.y + ((image_y / target_height as f64) * frame_rect.height as f64).floor() as i32;
    native_pet_pointer_hits_visible_frame(spritesheet, source_x as f64, source_y as f64)
}

fn draw_pet_pixbuf_with_pose(
    context: &cairo::Context,
    frame: &gdk_pixbuf::Pixbuf,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    pose: NativePetRenderPose,
) {
    let _ = context.save();
    context.translate(x + width / 2.0, y + height + pose.offset_y);
    context.rotate(pose.rotation_radians);
    context.scale(pose.scale_x, pose.scale_y);
    context.set_source_pixbuf(frame, -width / 2.0, -height);
    let _ = context.paint();
    let _ = context.restore();
}

fn draw_pet_contact_shadow(context: &cairo::Context, shadow: NativePetContactShadow) {
    let _ = context.save();
    context.set_source_rgba(0.0, 0.0, 0.0, shadow.opacity);
    context.translate(shadow.center_x, shadow.center_y);
    context.scale(shadow.width / 2.0, shadow.height / 2.0);
    context.arc(0.0, 0.0, 1.0, 0.0, std::f64::consts::TAU);
    let _ = context.fill();
    let _ = context.restore();
}

fn native_pet_contact_shadow(playback: NativePetAnimationPlayback) -> NativePetContactShadow {
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
        1 | 2 | 3 => (0.47, 0.14),
        5 | 6 | 7 => (0.5, 0.155),
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

fn native_pet_render_pose(playback: NativePetAnimationPlayback) -> NativePetRenderPose {
    match playback.name {
        NativePetAnimationName::Idle => native_pet_idle_breathing_pose(playback.frame_phase),
        NativePetAnimationName::GrabStart => native_pet_grab_start_pose(playback.frame_phase),
        NativePetAnimationName::Drag => native_pet_drag_pose(playback.frame_phase),
        NativePetAnimationName::RunLeft => native_pet_running_pose(playback.frame_phase, -1.0),
        NativePetAnimationName::RunRight => native_pet_running_pose(playback.frame_phase, 1.0),
        NativePetAnimationName::Hover => native_pet_hover_pose(playback.frame_phase),
        NativePetAnimationName::Wake => native_pet_wake_pose(playback.frame_phase),
        NativePetAnimationName::Sleep => native_pet_sleep_pose(playback.frame_phase),
        NativePetAnimationName::Approval => native_pet_approval_pose(playback.frame_phase),
        NativePetAnimationName::Thinking => native_pet_thinking_pose(playback.frame_phase),
        NativePetAnimationName::Working => native_pet_working_pose(playback.frame_phase),
        NativePetAnimationName::Celebrate => native_pet_celebrate_pose(playback.frame_phase),
        NativePetAnimationName::Sad => native_pet_sad_pose(playback.frame_phase),
        NativePetAnimationName::Reassure => native_pet_reassure_pose(playback.frame_phase),
        NativePetAnimationName::Explain => native_pet_explain_pose(playback.frame_phase),
        NativePetAnimationName::Curious => native_pet_curious_pose(playback.frame_phase),
        NativePetAnimationName::Tap => native_pet_tap_pose(playback.frame_phase),
        NativePetAnimationName::TripFallLeft
        | NativePetAnimationName::FallenIdleLeft
        | NativePetAnimationName::FallenGetUpLeft
        | NativePetAnimationName::TripFallRight
        | NativePetAnimationName::FallenIdleRight
        | NativePetAnimationName::FallenGetUpRight
        | NativePetAnimationName::StumbleRecoverLeft
        | NativePetAnimationName::StumbleRecoverRight => NativePetRenderPose::default(),
    }
}

fn native_pet_tap_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 5 {
        0 => NativePetRenderPose {
            offset_y: 2.4,
            rotation_radians: 0.0,
            scale_x: 1.045,
            scale_y: 0.952,
        },
        1 => NativePetRenderPose {
            offset_y: 0.5,
            rotation_radians: -0.008,
            scale_x: 1.018,
            scale_y: 0.992,
        },
        2 => NativePetRenderPose {
            offset_y: -3.4,
            rotation_radians: -0.014,
            scale_x: 0.984,
            scale_y: 1.04,
        },
        3 => NativePetRenderPose {
            offset_y: -1.5,
            rotation_radians: 0.012,
            scale_x: 0.992,
            scale_y: 1.026,
        },
        _ => NativePetRenderPose {
            offset_y: 0.9,
            rotation_radians: 0.0,
            scale_x: 1.014,
            scale_y: 0.988,
        },
    }
}

fn native_pet_grab_start_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 4 {
        0 => NativePetRenderPose {
            offset_y: 2.4,
            rotation_radians: 0.0,
            scale_x: 1.045,
            scale_y: 0.948,
        },
        1 => NativePetRenderPose {
            offset_y: 4.0,
            rotation_radians: 0.0,
            scale_x: 1.064,
            scale_y: 0.925,
        },
        2 => NativePetRenderPose {
            offset_y: -2.2,
            rotation_radians: 0.0,
            scale_x: 1.02,
            scale_y: 0.99,
        },
        _ => native_pet_drag_lift_pose(),
    }
}

fn native_pet_drag_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 6 {
        0 => NativePetRenderPose {
            offset_y: -5.2,
            rotation_radians: -0.014,
            scale_x: 1.018,
            scale_y: 0.982,
        },
        1 => NativePetRenderPose {
            offset_y: -5.4,
            rotation_radians: -0.006,
            scale_x: 1.01,
            scale_y: 0.992,
        },
        2 => NativePetRenderPose {
            offset_y: -6.0,
            rotation_radians: -0.028,
            scale_x: 0.998,
            scale_y: 1.012,
        },
        3 => NativePetRenderPose {
            offset_y: -5.0,
            rotation_radians: 0.022,
            scale_x: 1.004,
            scale_y: 1.004,
        },
        5 => NativePetRenderPose {
            offset_y: -4.5,
            rotation_radians: 0.014,
            scale_x: 1.012,
            scale_y: 0.99,
        },
        _ => NativePetRenderPose {
            offset_y: -5.0,
            rotation_radians: 0.006,
            scale_x: 1.018,
            scale_y: 0.982,
        },
    }
}

fn native_pet_sleep_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 4 {
        1 | 2 => NativePetRenderPose {
            offset_y: 3.0,
            rotation_radians: 0.0,
            scale_x: 1.018,
            scale_y: 0.968,
        },
        _ => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: 0.0,
            scale_x: 1.012,
            scale_y: 0.982,
        },
    }
}

fn native_pet_wake_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 4 {
        0 => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: -0.008,
            scale_x: 1.018,
            scale_y: 0.976,
        },
        1 => NativePetRenderPose {
            offset_y: -2.8,
            rotation_radians: 0.014,
            scale_x: 0.988,
            scale_y: 1.036,
        },
        2 => NativePetRenderPose {
            offset_y: -1.4,
            rotation_radians: 0.006,
            scale_x: 0.994,
            scale_y: 1.022,
        },
        _ => NativePetRenderPose {
            offset_y: 0.0,
            rotation_radians: 0.001,
            scale_x: 1.0,
            scale_y: 1.006,
        },
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

fn native_pet_running_pose(frame_phase: usize, direction: f64) -> NativePetRenderPose {
    match frame_phase % 8 {
        0 => NativePetRenderPose {
            offset_y: 1.2,
            rotation_radians: direction * 0.034,
            scale_x: 1.024,
            scale_y: 0.976,
        },
        1 => NativePetRenderPose {
            offset_y: -1.2,
            rotation_radians: direction * 0.044,
            scale_x: 0.996,
            scale_y: 1.016,
        },
        2 => NativePetRenderPose {
            offset_y: -3.4,
            rotation_radians: direction * 0.05,
            scale_x: 0.986,
            scale_y: 1.032,
        },
        3 => NativePetRenderPose {
            offset_y: -0.2,
            rotation_radians: direction * 0.036,
            scale_x: 1.006,
            scale_y: 0.998,
        },
        4 => NativePetRenderPose {
            offset_y: 0.6,
            rotation_radians: direction * 0.022,
            scale_x: 1.014,
            scale_y: 0.988,
        },
        5 => NativePetRenderPose {
            offset_y: -0.6,
            rotation_radians: direction * 0.03,
            scale_x: 1.002,
            scale_y: 1.006,
        },
        6 => NativePetRenderPose {
            offset_y: -2.4,
            rotation_radians: direction * 0.038,
            scale_x: 0.994,
            scale_y: 1.018,
        },
        _ => NativePetRenderPose {
            offset_y: 0.0,
            rotation_radians: direction * 0.034,
            scale_x: 1.006,
            scale_y: 0.996,
        },
    }
}

fn native_pet_hover_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 5 {
        0 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.004,
            scale_x: 0.996,
            scale_y: 1.01,
        },
        1 => NativePetRenderPose {
            offset_y: -1.8,
            rotation_radians: -0.012,
            scale_x: 0.994,
            scale_y: 1.018,
        },
        2 => NativePetRenderPose {
            offset_y: -2.6,
            rotation_radians: 0.02,
            scale_x: 0.992,
            scale_y: 1.026,
        },
        3 => NativePetRenderPose {
            offset_y: -2.2,
            rotation_radians: 0.012,
            scale_x: 0.996,
            scale_y: 1.018,
        },
        _ => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.004,
            scale_x: 1.0,
            scale_y: 1.004,
        },
    }
}

fn native_pet_reassure_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 5 {
        0 | 1 => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: -0.012,
            scale_x: 1.01,
            scale_y: 0.982,
        },
        2 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.008,
            scale_x: 0.996,
            scale_y: 1.014,
        },
        3 => NativePetRenderPose {
            offset_y: 0.0,
            rotation_radians: 0.004,
            scale_x: 1.002,
            scale_y: 1.004,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_explain_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 6 {
        1 | 2 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: -0.016,
            scale_x: 0.998,
            scale_y: 1.008,
        },
        3 | 4 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.018,
            scale_x: 1.002,
            scale_y: 1.01,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_curious_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 8 {
        1 | 2 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: -0.02,
            scale_x: 0.998,
            scale_y: 1.006,
        },
        3 | 4 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: 0.025,
            scale_x: 0.996,
            scale_y: 1.012,
        },
        5 | 6 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.012,
            scale_x: 1.002,
            scale_y: 1.006,
        },
        7 => NativePetRenderPose {
            offset_y: 0.0,
            rotation_radians: -0.006,
            scale_x: 1.0,
            scale_y: 1.002,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_celebrate_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 8 {
        1 | 2 => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: 0.0,
            scale_x: 1.03,
            scale_y: 0.97,
        },
        4 => NativePetRenderPose {
            offset_y: -5.0,
            rotation_radians: 0.0,
            scale_x: 0.98,
            scale_y: 1.05,
        },
        5 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: 0.0,
            scale_x: 0.99,
            scale_y: 1.025,
        },
        7 => NativePetRenderPose {
            offset_y: 1.0,
            rotation_radians: 0.0,
            scale_x: 1.01,
            scale_y: 0.995,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_approval_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 6 {
        2 | 3 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: 0.0,
            scale_x: 0.996,
            scale_y: 1.014,
        },
        5 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.0,
            scale_x: 1.004,
            scale_y: 1.004,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_thinking_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 8 {
        1 | 2 | 3 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: -0.012,
            scale_x: 0.998,
            scale_y: 1.006,
        },
        5 | 6 | 7 => NativePetRenderPose {
            offset_y: 0.0,
            rotation_radians: 0.012,
            scale_x: 1.002,
            scale_y: 1.003,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_working_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 8 {
        1 | 2 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: 0.0,
            scale_x: 0.996,
            scale_y: 1.018,
        },
        4 | 5 => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: 0.0,
            scale_x: 1.018,
            scale_y: 0.974,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_sad_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 4 {
        1 | 2 => NativePetRenderPose {
            offset_y: 3.0,
            rotation_radians: -0.018,
            scale_x: 1.012,
            scale_y: 0.974,
        },
        3 => NativePetRenderPose {
            offset_y: 2.0,
            rotation_radians: 0.012,
            scale_x: 1.006,
            scale_y: 0.986,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_idle_breathing_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase % 6 {
        1 => NativePetRenderPose {
            offset_y: -0.4,
            rotation_radians: -0.003,
            scale_x: 0.997,
            scale_y: 1.006,
        },
        2 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.004,
            scale_x: 0.994,
            scale_y: 1.014,
        },
        3 => NativePetRenderPose {
            offset_y: -0.3,
            rotation_radians: 0.002,
            scale_x: 0.997,
            scale_y: 1.006,
        },
        4 => NativePetRenderPose {
            offset_y: 1.0,
            rotation_radians: 0.0,
            scale_x: 1.006,
            scale_y: 0.992,
        },
        5 => NativePetRenderPose {
            offset_y: 0.4,
            rotation_radians: -0.002,
            scale_x: 1.002,
            scale_y: 0.996,
        },
        _ => NativePetRenderPose::default(),
    }
}

fn native_pet_drag_lift_pose() -> NativePetRenderPose {
    NativePetRenderPose {
        offset_y: -4.0,
        rotation_radians: 0.0,
        scale_x: 1.02,
        scale_y: 0.98,
    }
}

impl Default for NativePetRenderPose {
    fn default() -> Self {
        Self {
            offset_y: 0.0,
            rotation_radians: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
        }
    }
}

fn native_pet_should_mirror_frame(
    _playback: NativePetAnimationPlayback,
    _facing: NativePetFacing,
) -> bool {
    false
}

fn native_pet_pointer_hits_visible_frame(
    frame: &gdk_pixbuf::Pixbuf,
    frame_x: f64,
    frame_y: f64,
) -> bool {
    if frame_x < 0.0
        || frame_y < 0.0
        || frame_x >= frame.width() as f64
        || frame_y >= frame.height() as f64
    {
        return false;
    }

    if !frame.has_alpha() {
        return true;
    }

    let x = frame_x.floor() as usize;
    let y = frame_y.floor() as usize;
    let channel_count = frame.n_channels() as usize;
    if channel_count < 4 {
        return false;
    }

    let rowstride = frame.rowstride() as usize;
    let pixels = frame.read_pixel_bytes();
    let pixels = pixels.as_ref();
    let alpha_index = y
        .saturating_mul(rowstride)
        .saturating_add(x.saturating_mul(channel_count))
        .saturating_add(3);

    pixels.get(alpha_index).is_some_and(|alpha| *alpha > 16)
}

#[cfg(test)]
mod tests {
    use super::{
        native_pet_contact_shadow, native_pet_pointer_hits_visible_frame, native_pet_render_pose,
        native_pet_should_mirror_frame,
    };
    use crate::native_pet::{
        animation::{NativePetAnimationName, NativePetAnimationPlayback},
        geometry::NativePetFacing,
    };

    #[test]
    fn uses_explicit_directional_frames_without_runtime_mirroring() {
        let drag = NativePetAnimationPlayback::new(NativePetAnimationName::Drag);
        let run_left = NativePetAnimationPlayback::new(NativePetAnimationName::RunLeft);
        let run_right = NativePetAnimationPlayback::new(NativePetAnimationName::RunRight);

        assert!(!native_pet_should_mirror_frame(
            drag,
            NativePetFacing::Right
        ));
        assert!(!native_pet_should_mirror_frame(
            run_left,
            NativePetFacing::Right
        ));
        assert!(!native_pet_should_mirror_frame(
            run_right,
            NativePetFacing::Left
        ));
    }

    #[test]
    fn adjusts_contact_shadow_weight_for_drag_state() {
        let idle = native_pet_contact_shadow(NativePetAnimationPlayback::new(
            NativePetAnimationName::Idle,
        ));
        let drag = native_pet_contact_shadow(NativePetAnimationPlayback::new(
            NativePetAnimationName::Drag,
        ));

        assert!(idle.opacity > 0.0);
        assert!(drag.opacity < idle.opacity);
        assert!(drag.width < idle.width);
    }
    #[test]
    fn uses_pose_transform_for_drag_lift_and_directional_motion() {
        let idle = native_pet_render_pose(NativePetAnimationPlayback::new(
            NativePetAnimationName::Idle,
        ));
        let drag = native_pet_render_pose(NativePetAnimationPlayback::new(
            NativePetAnimationName::Drag,
        ));
        let run_left = native_pet_render_pose(NativePetAnimationPlayback::new(
            NativePetAnimationName::RunLeft,
        ));
        let run_right = native_pet_render_pose(NativePetAnimationPlayback::new(
            NativePetAnimationName::RunRight,
        ));

        assert_eq!(idle.scale_x, 1.0);
        assert_eq!(idle.scale_y, 1.0);
        assert!(drag.offset_y < idle.offset_y);
        assert!(run_left.rotation_radians < 0.0);
        assert!(run_right.rotation_radians > 0.0);
    }
    #[test]
    fn hit_tests_visible_frame_alpha_instead_of_window_rectangle() {
        let pixels =
            glib::Bytes::from_owned(vec![0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
        let frame =
            gdk_pixbuf::Pixbuf::from_bytes(&pixels, gdk_pixbuf::Colorspace::Rgb, true, 8, 2, 2, 8);

        assert!(native_pet_pointer_hits_visible_frame(&frame, 1.25, 0.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, 0.25, 0.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, 1.25, 1.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, -0.25, 0.25));
    }
}
