use super::super::animation::{
    NativePetAnimationPlayback, NativePetAnimationRenderProfile, NativePetAnimationSet,
};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetRenderPose {
    pub(super) offset_y: f64,
    pub(super) rotation_radians: f64,
    pub(super) scale_x: f64,
    pub(super) scale_y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetRenderProfileKind {
    Idle,
    GrabStart,
    Drag,
    RunLeft,
    RunRight,
    Hover,
    Wake,
    Sleep,
    Approval,
    Thinking,
    Working,
    Celebrate,
    Dance,
    Cast,
    Sad,
    Reassure,
    Explain,
    Curious,
    Tap,
    TripFall,
    Fallen,
    FallenGetUp,
    StumbleRecover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetRenderProfile {
    kind: NativePetRenderProfileKind,
    frame_phase: usize,
}

impl NativePetRenderProfile {
    pub(super) fn from_playback(
        animations: &NativePetAnimationSet,
        playback: NativePetAnimationPlayback,
    ) -> Self {
        Self::from_animation_profile(
            animations.render_profile_for_playback(playback),
            playback.frame_phase,
        )
    }

    pub(super) fn kind(self) -> NativePetRenderProfileKind {
        self.kind
    }

    pub(super) fn frame_phase(self) -> usize {
        self.frame_phase
    }

    fn from_animation_profile(
        profile: NativePetAnimationRenderProfile,
        frame_phase: usize,
    ) -> Self {
        let kind = NativePetRenderProfileKind::from(profile);

        Self { kind, frame_phase }
    }
}

impl From<NativePetAnimationRenderProfile> for NativePetRenderProfileKind {
    fn from(value: NativePetAnimationRenderProfile) -> Self {
        match value {
            NativePetAnimationRenderProfile::Idle => Self::Idle,
            NativePetAnimationRenderProfile::GrabStart => Self::GrabStart,
            NativePetAnimationRenderProfile::Drag => Self::Drag,
            NativePetAnimationRenderProfile::RunLeft => Self::RunLeft,
            NativePetAnimationRenderProfile::RunRight => Self::RunRight,
            NativePetAnimationRenderProfile::Hover => Self::Hover,
            NativePetAnimationRenderProfile::Wake => Self::Wake,
            NativePetAnimationRenderProfile::Sleep => Self::Sleep,
            NativePetAnimationRenderProfile::Approval => Self::Approval,
            NativePetAnimationRenderProfile::Thinking => Self::Thinking,
            NativePetAnimationRenderProfile::Working => Self::Working,
            NativePetAnimationRenderProfile::Celebrate => Self::Celebrate,
            NativePetAnimationRenderProfile::Dance => Self::Dance,
            NativePetAnimationRenderProfile::Cast => Self::Cast,
            NativePetAnimationRenderProfile::Sad => Self::Sad,
            NativePetAnimationRenderProfile::Reassure => Self::Reassure,
            NativePetAnimationRenderProfile::Explain => Self::Explain,
            NativePetAnimationRenderProfile::Curious => Self::Curious,
            NativePetAnimationRenderProfile::Tap => Self::Tap,
            NativePetAnimationRenderProfile::TripFall => Self::TripFall,
            NativePetAnimationRenderProfile::Fallen => Self::Fallen,
            NativePetAnimationRenderProfile::FallenGetUp => Self::FallenGetUp,
            NativePetAnimationRenderProfile::StumbleRecover => Self::StumbleRecover,
        }
    }
}

pub(super) fn native_pet_render_pose(
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
) -> NativePetRenderPose {
    native_pet_render_pose_for_profile(NativePetRenderProfile::from_playback(animations, playback))
}

pub(super) fn native_pet_render_pose_for_profile(
    profile: NativePetRenderProfile,
) -> NativePetRenderPose {
    let frame_phase = profile.frame_phase();

    match profile.kind() {
        NativePetRenderProfileKind::Idle => native_pet_idle_breathing_pose(frame_phase),
        NativePetRenderProfileKind::GrabStart => native_pet_grab_start_pose(frame_phase),
        NativePetRenderProfileKind::Drag => native_pet_drag_pose(frame_phase),
        NativePetRenderProfileKind::RunLeft => native_pet_running_pose(frame_phase, -1.0),
        NativePetRenderProfileKind::RunRight => native_pet_running_pose(frame_phase, 1.0),
        NativePetRenderProfileKind::Hover => native_pet_hover_pose(frame_phase),
        NativePetRenderProfileKind::Wake => native_pet_wake_pose(frame_phase),
        NativePetRenderProfileKind::Sleep => native_pet_sleep_pose(frame_phase),
        NativePetRenderProfileKind::Approval => native_pet_approval_pose(frame_phase),
        NativePetRenderProfileKind::Thinking => native_pet_thinking_pose(frame_phase),
        NativePetRenderProfileKind::Working => native_pet_working_pose(frame_phase),
        NativePetRenderProfileKind::Celebrate => native_pet_celebrate_pose(frame_phase),
        NativePetRenderProfileKind::Dance => NativePetRenderPose::default(),
        NativePetRenderProfileKind::Cast => native_pet_cast_pose(frame_phase),
        NativePetRenderProfileKind::Sad => native_pet_sad_pose(frame_phase),
        NativePetRenderProfileKind::Reassure => native_pet_reassure_pose(frame_phase),
        NativePetRenderProfileKind::Explain => native_pet_explain_pose(frame_phase),
        NativePetRenderProfileKind::Curious => native_pet_curious_pose(frame_phase),
        NativePetRenderProfileKind::Tap => native_pet_tap_pose(frame_phase),
        NativePetRenderProfileKind::TripFall
        | NativePetRenderProfileKind::Fallen
        | NativePetRenderProfileKind::FallenGetUp
        | NativePetRenderProfileKind::StumbleRecover => NativePetRenderPose::default(),
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

fn native_pet_cast_pose(frame_phase: usize) -> NativePetRenderPose {
    match frame_phase {
        1 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: -0.018,
            scale_x: 0.99,
            scale_y: 1.022,
        },
        2 => NativePetRenderPose {
            offset_y: -4.0,
            rotation_radians: -0.012,
            scale_x: 0.982,
            scale_y: 1.04,
        },
        3 => NativePetRenderPose {
            offset_y: -3.0,
            rotation_radians: 0.018,
            scale_x: 0.99,
            scale_y: 1.03,
        },
        4 => NativePetRenderPose {
            offset_y: -1.0,
            rotation_radians: 0.026,
            scale_x: 1.006,
            scale_y: 1.01,
        },
        5 => NativePetRenderPose {
            offset_y: -2.0,
            rotation_radians: 0.012,
            scale_x: 0.994,
            scale_y: 1.025,
        },
        6 => NativePetRenderPose {
            offset_y: 0.4,
            rotation_radians: 0.012,
            scale_x: 1.004,
            scale_y: 1.002,
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
