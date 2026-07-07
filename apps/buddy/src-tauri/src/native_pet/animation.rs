use std::collections::HashMap;

use serde::Deserialize;

use crate::error::{BuddyError, BuddyResult};

pub(super) const PET_FRAME_WIDTH: i32 = 192;
pub(super) const PET_FRAME_HEIGHT: i32 = 208;
pub(super) const PET_SPRITESHEET_COLUMNS: usize = 8;

pub(super) const NATIVE_PET_ANIMATION_NAMES: [NativePetAnimationName; 25] = [
    NativePetAnimationName::Idle,
    NativePetAnimationName::RunLeft,
    NativePetAnimationName::RunRight,
    NativePetAnimationName::Sleep,
    NativePetAnimationName::Wake,
    NativePetAnimationName::Hover,
    NativePetAnimationName::Tap,
    NativePetAnimationName::GrabStart,
    NativePetAnimationName::Drag,
    NativePetAnimationName::Approval,
    NativePetAnimationName::Thinking,
    NativePetAnimationName::Working,
    NativePetAnimationName::Celebrate,
    NativePetAnimationName::Sad,
    NativePetAnimationName::Reassure,
    NativePetAnimationName::Explain,
    NativePetAnimationName::Curious,
    NativePetAnimationName::TripFallLeft,
    NativePetAnimationName::FallenIdleLeft,
    NativePetAnimationName::FallenGetUpLeft,
    NativePetAnimationName::TripFallRight,
    NativePetAnimationName::FallenIdleRight,
    NativePetAnimationName::FallenGetUpRight,
    NativePetAnimationName::StumbleRecoverLeft,
    NativePetAnimationName::StumbleRecoverRight,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetAnimationName {
    Idle,
    RunLeft,
    RunRight,
    Sleep,
    Wake,
    Hover,
    Tap,
    GrabStart,
    Drag,
    Approval,
    Thinking,
    Working,
    Celebrate,
    Sad,
    Reassure,
    Explain,
    Curious,
    TripFallLeft,
    FallenIdleLeft,
    FallenGetUpLeft,
    TripFallRight,
    FallenIdleRight,
    FallenGetUpRight,
    StumbleRecoverLeft,
    StumbleRecoverRight,
}

impl NativePetAnimationName {
    pub(super) fn manifest_key(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::RunLeft => "run_left",
            Self::RunRight => "run_right",
            Self::Sleep => "sleep",
            Self::Wake => "wake",
            Self::Hover => "hover",
            Self::Tap => "tap",
            Self::GrabStart => "grab_start",
            Self::Drag => "drag",
            Self::Approval => "approval",
            Self::Thinking => "thinking",
            Self::Working => "working",
            Self::Celebrate => "celebrate",
            Self::Sad => "sad",
            Self::Reassure => "reassure",
            Self::Explain => "explain",
            Self::Curious => "curious",
            Self::TripFallLeft => "trip_fall_left",
            Self::FallenIdleLeft => "fallen_idle_left",
            Self::FallenGetUpLeft => "fallen_get_up_left",
            Self::TripFallRight => "trip_fall_right",
            Self::FallenIdleRight => "fallen_idle_right",
            Self::FallenGetUpRight => "fallen_get_up_right",
            Self::StumbleRecoverLeft => "stumble_recover_left",
            Self::StumbleRecoverRight => "stumble_recover_right",
        }
    }

    pub(super) fn from_manifest_key(value: &str) -> Option<Self> {
        match value {
            "idle" => Some(Self::Idle),
            "run_left" => Some(Self::RunLeft),
            "run_right" => Some(Self::RunRight),
            "sleep" => Some(Self::Sleep),
            "wake" => Some(Self::Wake),
            "hover" => Some(Self::Hover),
            "tap" => Some(Self::Tap),
            "grab_start" => Some(Self::GrabStart),
            "drag" => Some(Self::Drag),
            "approval" => Some(Self::Approval),
            "thinking" => Some(Self::Thinking),
            "working" => Some(Self::Working),
            "celebrate" => Some(Self::Celebrate),
            "sad" => Some(Self::Sad),
            "reassure" => Some(Self::Reassure),
            "explain" => Some(Self::Explain),
            "curious" => Some(Self::Curious),
            "trip_fall_left" => Some(Self::TripFallLeft),
            "fallen_idle_left" => Some(Self::FallenIdleLeft),
            "fallen_get_up_left" => Some(Self::FallenGetUpLeft),
            "trip_fall_right" => Some(Self::TripFallRight),
            "fallen_idle_right" => Some(Self::FallenIdleRight),
            "fallen_get_up_right" => Some(Self::FallenGetUpRight),
            "stumble_recover_left" => Some(Self::StumbleRecoverLeft),
            "stumble_recover_right" => Some(Self::StumbleRecoverRight),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub(super) struct NativePetAnimation {
    frames: Vec<NativePetAnimationFrame>,
    pub(super) loop_animation: bool,
}

impl NativePetAnimation {
    pub(super) fn frame_index(&self, frame_phase: usize) -> usize {
        self.frames[frame_phase % self.frames.len()].index
    }

    pub(super) fn frame_duration_ms(&self, frame_phase: usize) -> u64 {
        self.frames[frame_phase % self.frames.len()].duration_ms
    }

    #[cfg(test)]
    fn frame_indices(&self) -> Vec<usize> {
        self.frames.iter().map(|frame| frame.index).collect()
    }

    #[cfg(test)]
    fn total_duration_ms(&self) -> u64 {
        self.frames.iter().map(|frame| frame.duration_ms).sum()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativePetAnimationFrame {
    duration_ms: u64,
    index: usize,
}

#[derive(Debug)]
pub(super) struct NativePetAnimationSet {
    animations: HashMap<NativePetAnimationName, NativePetAnimation>,
}

impl NativePetAnimationSet {
    pub(super) fn from_manifest(manifest: NativePetManifest) -> BuddyResult<Self> {
        validate_native_pet_manifest_shape(&manifest)?;
        let sheet_frame_count = manifest.sheet.frame_count();

        let mut manifest_animations = HashMap::new();
        for animation in &manifest.animations {
            if manifest_animations
                .insert(animation.name.as_str(), animation)
                .is_some()
            {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest has duplicate animation: {}",
                    animation.name
                )));
            }
        }

        let mut animations = HashMap::new();
        for name in NATIVE_PET_ANIMATION_NAMES {
            let key = name.manifest_key();
            let Some(animation) = manifest_animations.get(key) else {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest is missing animation: {key}"
                )));
            };
            let animation =
                parse_native_pet_manifest_animation(name, animation, sheet_frame_count)?;
            animations.insert(name, animation);
        }

        Ok(Self { animations })
    }

    pub(super) fn animation(&self, name: NativePetAnimationName) -> &NativePetAnimation {
        self.animations
            .get(&name)
            .expect("native pet animation manifest was validated at startup")
    }

    pub(super) fn frame_index(&self, playback: NativePetAnimationPlayback) -> usize {
        self.animation(playback.name)
            .frame_index(playback.frame_phase)
    }

    pub(super) fn len(&self) -> usize {
        self.animations.len()
    }
}

fn parse_native_pet_manifest_animation(
    name: NativePetAnimationName,
    animation: &NativePetManifestAnimation,
    sheet_frame_count: usize,
) -> BuddyResult<NativePetAnimation> {
    let key = name.manifest_key();

    if animation.frames.is_empty() {
        return Err(BuddyError::Runtime(format!(
            "native pet manifest animation has no frames: {key}"
        )));
    }
    let default_frame_duration_ms = match animation.fps {
        Some(0) => {
            return Err(BuddyError::Runtime(format!(
                "native pet manifest animation has invalid fps: {key}"
            )));
        }
        Some(fps) => Some((1000 / fps as u64).max(1)),
        None => None,
    };
    let frames = animation
        .frames
        .iter()
        .map(|frame| {
            let index = frame.index();
            if index >= sheet_frame_count {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest animation references out-of-range frame: {key}"
                )));
            }

            let Some(duration_ms) = frame.duration_ms().or(default_frame_duration_ms) else {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest animation frame has no duration: {key}"
                )));
            };
            if duration_ms == 0 {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest animation frame has invalid duration: {key}"
                )));
            }

            Ok(NativePetAnimationFrame { duration_ms, index })
        })
        .collect::<BuddyResult<Vec<_>>>()?;

    Ok(NativePetAnimation {
        frames,
        loop_animation: animation.loop_animation,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetAnimationPlayback {
    pub(super) elapsed_ms: u64,
    pub(super) frame_phase: usize,
    pub(super) name: NativePetAnimationName,
}

impl NativePetAnimationPlayback {
    pub(super) fn new(name: NativePetAnimationName) -> Self {
        Self {
            elapsed_ms: 0,
            frame_phase: 0,
            name,
        }
    }

    pub(super) fn set_animation(&mut self, name: NativePetAnimationName) {
        if self.name == name {
            return;
        }

        *self = Self::new(name);
    }

    pub(super) fn restart_animation(&mut self, name: NativePetAnimationName) {
        *self = Self::new(name);
    }

    pub(super) fn advance(
        &mut self,
        animations: &NativePetAnimationSet,
        elapsed_ms: u64,
        fallback: NativePetAnimationName,
    ) {
        self.elapsed_ms += elapsed_ms;

        loop {
            let animation = animations.animation(self.name);
            let frame_duration_ms = animation.frame_duration_ms(self.frame_phase);
            if self.elapsed_ms < frame_duration_ms {
                break;
            }

            self.elapsed_ms -= frame_duration_ms;
            if self.frame_phase + 1 < animation.frames.len() {
                self.frame_phase += 1;
                continue;
            }

            if animation.loop_animation {
                self.frame_phase = 0;
            } else {
                *self = Self::new(fallback);
                break;
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct NativePetManifest {
    pub(super) animations: Vec<NativePetManifestAnimation>,
    pub(super) frame: NativePetManifestFrame,
    pub(super) sheet: NativePetManifestSheet,
}

#[derive(Debug, Deserialize)]
pub(super) struct NativePetManifestFrame {
    pub(super) height: i32,
    pub(super) width: i32,
}

#[derive(Debug, Deserialize)]
pub(super) struct NativePetManifestSheet {
    pub(super) columns: usize,
    pub(super) rows: usize,
}

impl NativePetManifestSheet {
    pub(super) fn frame_count(&self) -> usize {
        self.columns * self.rows
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct NativePetManifestAnimation {
    fps: Option<u32>,
    frames: Vec<NativePetManifestAnimationFrame>,
    #[serde(rename = "loop")]
    loop_animation: bool,
    name: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
enum NativePetManifestAnimationFrame {
    Index(usize),
    Timed {
        index: usize,
        #[serde(rename = "durationMs")]
        duration_ms: Option<u64>,
    },
}

impl NativePetManifestAnimationFrame {
    fn index(self) -> usize {
        match self {
            Self::Index(index) => index,
            Self::Timed { index, .. } => index,
        }
    }

    fn duration_ms(self) -> Option<u64> {
        match self {
            Self::Index(_) => None,
            Self::Timed { duration_ms, .. } => duration_ms,
        }
    }
}

pub(super) fn native_pet_requested_animation_fallback(
    animations: &NativePetAnimationSet,
    requested: NativePetAnimationName,
) -> NativePetAnimationName {
    if animations.animation(requested).loop_animation {
        requested
    } else {
        NativePetAnimationName::Idle
    }
}

pub(super) fn native_pet_completed_animation_fallback(
    completed: NativePetAnimationName,
    default_fallback: NativePetAnimationName,
) -> NativePetAnimationName {
    match completed {
        NativePetAnimationName::TripFallLeft => NativePetAnimationName::FallenIdleLeft,
        NativePetAnimationName::TripFallRight => NativePetAnimationName::FallenIdleRight,
        NativePetAnimationName::FallenGetUpLeft
        | NativePetAnimationName::FallenGetUpRight
        | NativePetAnimationName::StumbleRecoverLeft
        | NativePetAnimationName::StumbleRecoverRight => NativePetAnimationName::Idle,
        _ => default_fallback,
    }
}

fn validate_native_pet_manifest_shape(manifest: &NativePetManifest) -> BuddyResult<()> {
    if manifest.frame.width != PET_FRAME_WIDTH || manifest.frame.height != PET_FRAME_HEIGHT {
        return Err(BuddyError::Runtime(
            "native pet manifest frame size does not match bundled renderer".to_owned(),
        ));
    }

    if manifest.sheet.columns != PET_SPRITESHEET_COLUMNS {
        return Err(BuddyError::Runtime(
            "native pet manifest sheet columns do not match bundled renderer".to_owned(),
        ));
    }

    if manifest.sheet.rows == 0 {
        return Err(BuddyError::Runtime(
            "native pet manifest sheet rows must be positive".to_owned(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationName, NativePetAnimationPlayback, NativePetManifest,
    };
    use crate::native_pet::assets::load_default_pet_animation_set;

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    #[test]
    fn bundled_manifest_uses_uniform_fps_only_for_continuous_motion() {
        let manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let uniform_fps_animations = manifest
            .animations
            .iter()
            .filter_map(|animation| animation.fps.map(|_| animation.name.as_str()))
            .collect::<Vec<_>>();

        assert_eq!(
            uniform_fps_animations,
            vec!["run_left", "run_right", "drag"]
        );

        for animation in manifest
            .animations
            .iter()
            .filter(|animation| !uniform_fps_animations.contains(&animation.name.as_str()))
        {
            assert!(
                animation
                    .frames
                    .iter()
                    .all(|frame| frame.duration_ms().is_some()),
                "{} should use per-frame timing",
                animation.name
            );
        }
    }

    #[test]
    fn loads_bundled_native_pet_animation_manifest() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        assert_eq!(
            animations
                .animation(NativePetAnimationName::Idle)
                .frame_indices(),
            vec![0, 1, 2, 3, 4, 5]
        );
        assert_eq!(
            animations
                .animation(NativePetAnimationName::Tap)
                .frame_indices(),
            vec![72, 73, 74, 75, 76]
        );
        assert_eq!(
            animations
                .animation(NativePetAnimationName::Working)
                .frame_index(0),
            64
        );
        assert!(
            !animations
                .animation(NativePetAnimationName::Tap)
                .loop_animation
        );
        assert_eq!(
            animations
                .animation(NativePetAnimationName::Sleep)
                .frame_duration_ms(3),
            1200
        );
        assert_eq!(
            animations
                .animation(NativePetAnimationName::Curious)
                .frame_duration_ms(3),
            850
        );
        assert!(
            animations
                .animation(NativePetAnimationName::Drag)
                .total_duration_ms()
                <= 600
        );
    }

    #[test]
    fn bundled_manifest_exposes_grab_and_drag_animation_slots() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        assert_eq!(animations.len(), 25);
        assert!(
            !animations
                .animation(NativePetAnimationName::GrabStart)
                .loop_animation
        );
        assert!(
            animations
                .animation(NativePetAnimationName::Drag)
                .loop_animation
        );
    }
    #[test]
    fn bundled_trip_fall_and_recovery_segments_match_click_contract() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let trip_left = animations.animation(NativePetAnimationName::TripFallLeft);
        let fallen_left = animations.animation(NativePetAnimationName::FallenIdleLeft);
        let get_up_left = animations.animation(NativePetAnimationName::FallenGetUpLeft);
        let trip_right = animations.animation(NativePetAnimationName::TripFallRight);
        let fallen_right = animations.animation(NativePetAnimationName::FallenIdleRight);
        let get_up_right = animations.animation(NativePetAnimationName::FallenGetUpRight);
        let stumble_left = animations.animation(NativePetAnimationName::StumbleRecoverLeft);
        let stumble_right = animations.animation(NativePetAnimationName::StumbleRecoverRight);

        assert_eq!(
            trip_left.frame_indices(),
            vec![80, 81, 82, 83, 84, 85, 86, 87]
        );
        assert_eq!(fallen_left.frame_indices(), vec![88, 89]);
        assert_eq!(
            get_up_left.frame_indices(),
            vec![96, 97, 98, 99, 100, 101, 102]
        );
        assert_eq!(
            trip_right.frame_indices(),
            vec![104, 105, 106, 107, 108, 109, 110, 111]
        );
        assert_eq!(fallen_right.frame_indices(), vec![112, 113]);
        assert_eq!(
            get_up_right.frame_indices(),
            vec![120, 121, 122, 123, 124, 125, 126]
        );
        assert_eq!(
            stumble_left.frame_indices(),
            vec![128, 129, 130, 131, 132, 133, 134, 135, 136, 137]
        );
        assert_eq!(
            stumble_right.frame_indices(),
            vec![144, 145, 146, 147, 148, 149, 150, 151, 152, 153]
        );
        assert!(!trip_left.loop_animation);
        assert!(fallen_left.loop_animation);
        assert!(!get_up_left.loop_animation);
        assert!(!trip_right.loop_animation);
        assert!(fallen_right.loop_animation);
        assert!(!get_up_right.loop_animation);
        assert!(!stumble_left.loop_animation);
        assert!(!stumble_right.loop_animation);
        assert_eq!(fallen_left.frame_duration_ms(0), 900);
        assert_eq!(fallen_right.frame_duration_ms(1), 1100);
        assert!(trip_left.total_duration_ms() >= 1_200);
        assert!(stumble_left.total_duration_ms() >= 1_500);
    }

    #[test]
    fn maps_native_pet_animation_playback_to_manifest_frames() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::RunRight);
        assert_eq!(animations.frame_index(playback), 16);

        playback.frame_phase = 7;
        assert_eq!(animations.frame_index(playback), 23);

        playback.frame_phase = 8;
        assert_eq!(animations.frame_index(playback), 16);

        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::Drag);
        assert_eq!(animations.frame_index(playback), 24);

        playback.frame_phase = 5;
        assert_eq!(animations.frame_index(playback), 29);

        playback.frame_phase = 6;
        assert_eq!(animations.frame_index(playback), 24);
    }

    #[test]
    fn returns_to_idle_after_one_shot_native_pet_animation() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::Tap);
        let tap = animations.animation(NativePetAnimationName::Tap);

        playback.advance(
            &animations,
            tap.total_duration_ms(),
            NativePetAnimationName::Idle,
        );

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::Idle)
        );
    }

    #[test]
    fn returns_to_requested_looping_animation_after_one_shot_interaction() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::Tap);
        let tap = animations.animation(NativePetAnimationName::Tap);

        playback.advance(
            &animations,
            tap.total_duration_ms(),
            NativePetAnimationName::Working,
        );

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::Working)
        );
        assert_eq!(
            native_pet_requested_animation_fallback(&animations, NativePetAnimationName::Working),
            NativePetAnimationName::Working
        );
        assert_eq!(
            native_pet_requested_animation_fallback(&animations, NativePetAnimationName::Celebrate),
            NativePetAnimationName::Idle
        );
    }

    #[test]
    fn trip_fall_waits_for_click_before_getting_up() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::TripFallLeft);
        let trip_left = animations.animation(NativePetAnimationName::TripFallLeft);
        let fallback = native_pet_completed_animation_fallback(
            playback.name,
            native_pet_requested_animation_fallback(&animations, NativePetAnimationName::Idle),
        );

        playback.advance(&animations, trip_left.total_duration_ms(), fallback);

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::FallenIdleLeft)
        );

        let fallen_left = animations.animation(NativePetAnimationName::FallenIdleLeft);
        playback.advance(
            &animations,
            fallen_left.total_duration_ms() * 3,
            NativePetAnimationName::Idle,
        );

        assert_eq!(playback.name, NativePetAnimationName::FallenIdleLeft);

        playback.restart_animation(NativePetAnimationName::FallenGetUpLeft);
        let get_up_left = animations.animation(NativePetAnimationName::FallenGetUpLeft);
        let fallback = native_pet_completed_animation_fallback(
            playback.name,
            native_pet_requested_animation_fallback(&animations, NativePetAnimationName::Idle),
        );
        playback.advance(&animations, get_up_left.total_duration_ms(), fallback);

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::Idle)
        );
    }

    #[test]
    fn stumble_recover_returns_to_idle_after_one_shot() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback =
            NativePetAnimationPlayback::new(NativePetAnimationName::StumbleRecoverRight);
        let stumble_right = animations.animation(NativePetAnimationName::StumbleRecoverRight);
        let fallback = native_pet_completed_animation_fallback(
            playback.name,
            native_pet_requested_animation_fallback(&animations, NativePetAnimationName::Idle),
        );

        playback.advance(&animations, stumble_right.total_duration_ms(), fallback);

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::Idle)
        );
    }

    #[test]
    fn bundled_manifest_exposes_only_active_animation_controls() {
        let manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let animation_names = manifest
            .animations
            .iter()
            .map(|animation| animation.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            animation_names,
            vec![
                "idle",
                "run_left",
                "run_right",
                "drag",
                "grab_start",
                "celebrate",
                "sleep",
                "wake",
                "thinking",
                "approval",
                "sad",
                "reassure",
                "working",
                "explain",
                "tap",
                "hover",
                "curious",
                "trip_fall_left",
                "fallen_idle_left",
                "fallen_get_up_left",
                "trip_fall_right",
                "fallen_idle_right",
                "fallen_get_up_right",
                "stumble_recover_left",
                "stumble_recover_right",
            ]
        );
        for active_name in animation_names {
            assert!(NativePetAnimationName::from_manifest_key(active_name).is_some());
        }
    }

    #[test]
    fn can_restart_same_animation_for_explicit_control_replay() {
        let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::Celebrate);
        playback.elapsed_ms = 240;
        playback.frame_phase = 4;

        playback.restart_animation(NativePetAnimationName::Celebrate);

        assert_eq!(
            playback,
            NativePetAnimationPlayback::new(NativePetAnimationName::Celebrate)
        );
    }
}
