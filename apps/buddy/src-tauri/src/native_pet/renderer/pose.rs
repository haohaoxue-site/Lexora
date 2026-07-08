use super::super::animation::{NativePetAnimationName, NativePetAnimationPlayback};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetRenderPose {
    pub(super) offset_y: f64,
    pub(super) rotation_radians: f64,
    pub(super) scale_x: f64,
    pub(super) scale_y: f64,
}

pub(super) fn native_pet_render_pose(playback: NativePetAnimationPlayback) -> NativePetRenderPose {
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
        1..=3 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: -0.012,
            scale_x: 0.998,
            scale_y: 1.006,
        },
        5..=7 => NativePetRenderPose {
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
