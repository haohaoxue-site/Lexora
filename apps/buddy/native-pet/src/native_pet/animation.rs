use std::collections::HashMap;

use crate::error::{BuddyError, BuddyResult};
pub(super) use crate::native_pet::animation_key::NativePetAnimationKey;

mod manifest;
mod playback;

use manifest::NativePetManifestAnimation;
pub(super) use manifest::{NativePetManifest, NativePetSpritesheetGeometry};
pub(super) use playback::{
    native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
    NativePetAnimationPlayback,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetRequestedAnimationState {
    target: NativePetAnimationTarget,
}

impl NativePetRequestedAnimationState {
    pub(super) fn animation_target(self) -> NativePetAnimationTarget {
        self.target
    }

    pub(super) fn is_idle(self, idle_target: NativePetAnimationTarget) -> bool {
        self.animation_target() == idle_target
    }
}

impl From<NativePetAnimationTarget> for NativePetRequestedAnimationState {
    fn from(target: NativePetAnimationTarget) -> Self {
        Self { target }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetLifecycleAnimationDecision {
    target: NativePetAnimationTarget,
}

impl NativePetLifecycleAnimationDecision {
    pub(super) fn animation_target(self) -> NativePetAnimationTarget {
        self.target
    }
}

impl From<NativePetAnimationTarget> for NativePetLifecycleAnimationDecision {
    fn from(target: NativePetAnimationTarget) -> Self {
        Self { target }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetPlaybackFallbackDecision {
    target: NativePetAnimationTarget,
}

impl NativePetPlaybackFallbackDecision {
    pub(super) fn animation_target(self) -> NativePetAnimationTarget {
        self.target
    }
}

impl From<NativePetAnimationTarget> for NativePetPlaybackFallbackDecision {
    fn from(target: NativePetAnimationTarget) -> Self {
        Self { target }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetAnimationRenderProfile {
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
pub(super) enum NativePetAnimationLocalInteractionProfile {
    None,
    FallenIdleLeft,
    FallenIdleRight,
    FiniteScriptedAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetAnimationCompletionFallbackProfile {
    Default,
    Idle,
    Sleep,
    FallenIdleLeft,
    FallenIdleRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetAnimationRuntimeProfile {
    pub(super) render_profile: NativePetAnimationRenderProfile,
    pub(super) local_interaction_profile: NativePetAnimationLocalInteractionProfile,
    pub(super) completion_fallback_profile: NativePetAnimationCompletionFallbackProfile,
}

impl Default for NativePetAnimationRuntimeProfile {
    fn default() -> Self {
        Self {
            render_profile: NativePetAnimationRenderProfile::Idle,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) struct NativePetAnimationHandle(usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetAnimationTarget {
    ManifestHandle(NativePetAnimationHandle),
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
    pub(super) fn frame_indices(&self) -> Vec<usize> {
        self.frames.iter().map(|frame| frame.index).collect()
    }

    pub(super) fn total_duration_ms(&self) -> u64 {
        self.frames.iter().map(|frame| frame.duration_ms).sum()
    }

    pub(super) fn frame_count(&self) -> usize {
        self.frames.len()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativePetAnimationFrame {
    duration_ms: u64,
    index: usize,
}

#[derive(Debug)]
pub(super) struct NativePetAnimationSet {
    animation_handles: HashMap<String, NativePetAnimationHandle>,
    animation_names: Vec<String>,
    animation_profiles: HashMap<String, NativePetAnimationRuntimeProfile>,
    animations: HashMap<String, NativePetAnimation>,
    geometry: NativePetSpritesheetGeometry,
}

impl NativePetAnimationSet {
    pub(super) fn from_manifest(manifest: NativePetManifest) -> BuddyResult<Self> {
        Self::from_manifest_with_runtime_profiles(manifest, HashMap::new())
    }

    pub(super) fn from_manifest_with_runtime_profiles(
        manifest: NativePetManifest,
        animation_profiles: HashMap<String, NativePetAnimationRuntimeProfile>,
    ) -> BuddyResult<Self> {
        let geometry = NativePetSpritesheetGeometry::from_manifest(&manifest)?;
        let sheet_frame_count = geometry.frame_count()?;

        let mut animation_names = Vec::with_capacity(manifest.animations.len());
        let mut animation_handles = HashMap::new();
        let mut animations = HashMap::new();
        for animation in &manifest.animations {
            let key = animation.name.as_str();
            if NativePetAnimationKey::parse(key).is_none() {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest has invalid animation key: {key}"
                )));
            }
            let animation = parse_native_pet_manifest_animation(key, animation, sheet_frame_count)?;
            if animations.insert(key.to_owned(), animation).is_some() {
                return Err(BuddyError::Runtime(format!(
                    "native pet manifest has duplicate animation: {key}"
                )));
            }
            animation_handles.insert(
                key.to_owned(),
                NativePetAnimationHandle(animation_names.len()),
            );
            animation_names.push(key.to_owned());
        }

        for animation_ref in animation_profiles.keys() {
            if !animations.contains_key(animation_ref) {
                return Err(BuddyError::Runtime(format!(
                    "native pet animation profile references missing animation: {animation_ref}"
                )));
            }
        }
        validate_native_pet_animation_completion_fallback_profiles(&animation_profiles)?;

        Ok(Self {
            animation_handles,
            animation_names,
            animation_profiles,
            animations,
            geometry,
        })
    }

    #[cfg(test)]
    pub(super) fn test_animation(&self, manifest_key: &str) -> &NativePetAnimation {
        self.animation_for_manifest_key(manifest_key)
            .expect("native pet animation manifest was validated at startup")
    }

    pub(super) fn frame_index(&self, playback: NativePetAnimationPlayback) -> usize {
        self.animation_for_playback(playback)
            .frame_index(playback.frame_phase)
    }

    pub(super) fn animation_names(&self) -> impl Iterator<Item = &str> {
        self.animation_names.iter().map(String::as_str)
    }

    pub(super) fn animation_for_manifest_key(
        &self,
        manifest_key: &str,
    ) -> Option<&NativePetAnimation> {
        self.animations.get(manifest_key)
    }

    pub(super) fn animation_handle_for_key(
        &self,
        animation: &NativePetAnimationKey,
    ) -> BuddyResult<NativePetAnimationHandle> {
        self.animation_handles
            .get(animation.manifest_key())
            .copied()
            .ok_or_else(|| {
                BuddyError::Runtime(format!(
                    "unknown native pet animation: {}",
                    animation.manifest_key()
                ))
            })
    }

    pub(super) fn animation_for_handle(
        &self,
        handle: NativePetAnimationHandle,
    ) -> Option<&NativePetAnimation> {
        self.manifest_key_for_handle(handle)
            .and_then(|key| self.animation_for_manifest_key(key))
    }

    pub(super) fn animation_for_target(
        &self,
        target: NativePetAnimationTarget,
    ) -> &NativePetAnimation {
        match target {
            NativePetAnimationTarget::ManifestHandle(handle) => self
                .animation_for_handle(handle)
                .expect("native pet animation handle was issued by the animation set"),
        }
    }

    pub(super) fn animation_for_playback(
        &self,
        playback: NativePetAnimationPlayback,
    ) -> &NativePetAnimation {
        self.animation_for_target(playback.animation_target())
    }

    pub(super) fn manifest_key_for_handle(&self, handle: NativePetAnimationHandle) -> Option<&str> {
        self.animation_names.get(handle.0).map(String::as_str)
    }

    pub(super) fn manifest_key_for_playback(&self, playback: NativePetAnimationPlayback) -> &str {
        self.manifest_key_for_target(playback.animation_target())
    }

    pub(super) fn manifest_key_for_target(&self, target: NativePetAnimationTarget) -> &str {
        match target {
            NativePetAnimationTarget::ManifestHandle(handle) => self
                .manifest_key_for_handle(handle)
                .expect("native pet animation handle was issued by the animation set"),
        }
    }

    pub(super) fn manifest_key_for_requested_animation(
        &self,
        requested: NativePetRequestedAnimationState,
    ) -> &str {
        self.manifest_key_for_target(requested.animation_target())
    }

    pub(super) fn render_profile_for_playback(
        &self,
        playback: NativePetAnimationPlayback,
    ) -> NativePetAnimationRenderProfile {
        self.runtime_profile_for_playback(playback).render_profile
    }

    pub(super) fn render_profile_for_target(
        &self,
        target: NativePetAnimationTarget,
    ) -> NativePetAnimationRenderProfile {
        self.runtime_profile_for_manifest_key(self.manifest_key_for_target(target))
            .render_profile
    }

    pub(super) fn local_interaction_profile_for_playback(
        &self,
        playback: NativePetAnimationPlayback,
    ) -> NativePetAnimationLocalInteractionProfile {
        self.runtime_profile_for_playback(playback)
            .local_interaction_profile
    }

    pub(super) fn local_interaction_profile_for_target(
        &self,
        target: NativePetAnimationTarget,
    ) -> NativePetAnimationLocalInteractionProfile {
        self.runtime_profile_for_manifest_key(self.manifest_key_for_target(target))
            .local_interaction_profile
    }

    pub(super) fn completion_fallback_profile_for_playback(
        &self,
        playback: NativePetAnimationPlayback,
    ) -> NativePetAnimationCompletionFallbackProfile {
        self.runtime_profile_for_playback(playback)
            .completion_fallback_profile
    }

    pub(super) fn animation_target_for_local_interaction_profile(
        &self,
        profile: NativePetAnimationLocalInteractionProfile,
    ) -> Option<NativePetAnimationTarget> {
        self.animation_names.iter().find_map(|animation_ref| {
            let runtime_profile = self
                .animation_profiles
                .get(animation_ref)
                .copied()
                .unwrap_or_default();
            if runtime_profile.local_interaction_profile != profile {
                return None;
            }

            let handle = self
                .animation_handles
                .get(animation_ref)
                .copied()
                .expect("native pet animation handle exists for manifest animation");
            Some(NativePetAnimationTarget::ManifestHandle(handle))
        })
    }

    fn runtime_profile_for_playback(
        &self,
        playback: NativePetAnimationPlayback,
    ) -> NativePetAnimationRuntimeProfile {
        self.runtime_profile_for_manifest_key(self.manifest_key_for_playback(playback))
    }

    fn runtime_profile_for_manifest_key(
        &self,
        manifest_key: &str,
    ) -> NativePetAnimationRuntimeProfile {
        self.animation_profiles
            .get(manifest_key)
            .copied()
            .unwrap_or_default()
    }

    pub(super) fn animation_target_for_key(
        &self,
        animation: &NativePetAnimationKey,
    ) -> BuddyResult<NativePetAnimationTarget> {
        let handle = self.animation_handle_for_key(animation)?;
        Ok(NativePetAnimationTarget::ManifestHandle(handle))
    }

    pub(super) fn animation_target_for_manifest_key(
        &self,
        manifest_key: &str,
    ) -> Option<NativePetAnimationTarget> {
        let animation = NativePetAnimationKey::parse(manifest_key)?;
        self.animation_target_for_key(&animation).ok()
    }

    #[cfg(test)]
    pub(super) fn animation_target_for_test_key(
        &self,
        manifest_key: &str,
    ) -> NativePetAnimationTarget {
        let animation = NativePetAnimationKey::parse(manifest_key)
            .expect("test animation key is a valid manifest key");
        self.animation_target_for_key(&animation)
            .expect("native pet test animation key resolves to manifest target")
    }

    #[cfg(test)]
    pub(super) fn playback_for_test_key(&self, manifest_key: &str) -> NativePetAnimationPlayback {
        NativePetAnimationPlayback::from_target(self.animation_target_for_test_key(manifest_key))
    }

    pub(super) fn optional_animation_target_for_key(
        &self,
        animation: Option<&NativePetAnimationKey>,
    ) -> BuddyResult<Option<NativePetAnimationTarget>> {
        animation
            .map(|animation| self.animation_target_for_key(animation))
            .transpose()
    }

    pub(super) fn geometry(&self) -> NativePetSpritesheetGeometry {
        self.geometry
    }

    pub(super) fn len(&self) -> usize {
        self.animations.len()
    }
}

fn validate_native_pet_animation_completion_fallback_profiles(
    animation_profiles: &HashMap<String, NativePetAnimationRuntimeProfile>,
) -> BuddyResult<()> {
    for (animation_ref, profile) in animation_profiles {
        let required_profile = match profile.completion_fallback_profile {
            NativePetAnimationCompletionFallbackProfile::Default
            | NativePetAnimationCompletionFallbackProfile::Idle => continue,
            NativePetAnimationCompletionFallbackProfile::Sleep => {
                if animation_profiles.contains_key("sleep") {
                    continue;
                }

                return Err(BuddyError::Runtime(format!(
                    "native pet animation profile completion fallback has no sleep profile: {animation_ref}"
                )));
            }
            NativePetAnimationCompletionFallbackProfile::FallenIdleLeft => {
                NativePetAnimationLocalInteractionProfile::FallenIdleLeft
            }
            NativePetAnimationCompletionFallbackProfile::FallenIdleRight => {
                NativePetAnimationLocalInteractionProfile::FallenIdleRight
            }
        };

        if animation_profiles
            .values()
            .any(|profile| profile.local_interaction_profile == required_profile)
        {
            continue;
        }

        return Err(BuddyError::Runtime(format!(
            "native pet animation profile completion fallback has no matching local interaction profile: {animation_ref}"
        )));
    }

    Ok(())
}

fn parse_native_pet_manifest_animation(
    key: &str,
    animation: &NativePetManifestAnimation,
    sheet_frame_count: usize,
) -> BuddyResult<NativePetAnimation> {
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

#[cfg(test)]
mod tests {
    use super::{
        manifest::{
            NativePetManifest, NativePetManifestAnimation, NativePetManifestAnimationFrame,
            NativePetTimedManifestAnimationFrame,
        },
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
        NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
        NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile, NativePetAnimationSet,
        NativePetAnimationTarget, NativePetLifecycleAnimationDecision,
        NativePetPlaybackFallbackDecision,
    };
    use crate::native_pet::assets::load_default_pet_animation_set;
    use std::collections::HashMap;

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn test_target(
        animations: &NativePetAnimationSet,
        manifest_key: &str,
    ) -> NativePetAnimationTarget {
        animations.animation_target_for_test_key(manifest_key)
    }

    fn test_playback(
        animations: &NativePetAnimationSet,
        manifest_key: &str,
    ) -> NativePetAnimationPlayback {
        animations.playback_for_test_key(manifest_key)
    }

    fn lifecycle_decision(
        animations: &NativePetAnimationSet,
        manifest_key: &str,
    ) -> NativePetLifecycleAnimationDecision {
        NativePetLifecycleAnimationDecision::from(test_target(animations, manifest_key))
    }

    fn fallback_decision(
        animations: &NativePetAnimationSet,
        manifest_key: &str,
    ) -> NativePetPlaybackFallbackDecision {
        NativePetPlaybackFallbackDecision::from(test_target(animations, manifest_key))
    }

    fn timed_manifest_frame(index: usize, duration_ms: u64) -> NativePetManifestAnimationFrame {
        NativePetManifestAnimationFrame::Timed(NativePetTimedManifestAnimationFrame::new(
            index,
            Some(duration_ms),
        ))
    }

    #[test]
    fn sleep_enter_plays_once_then_falls_back_to_static_sleep_hold() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = test_playback(&animations, "sleep_enter");
        let sleep_enter = animations.test_animation("sleep_enter");
        let fallback = native_pet_completed_animation_fallback(
            &animations,
            playback,
            fallback_decision(&animations, "idle"),
            test_target(&animations, "idle"),
        );

        assert_eq!(sleep_enter.frame_indices(), vec![40, 41, 42, 43]);
        assert!(!sleep_enter.loop_animation);
        assert_eq!(animations.test_animation("sleep").frame_indices(), vec![43]);
        assert!(animations.test_animation("sleep").loop_animation);

        playback.advance(&animations, sleep_enter.total_duration_ms(), fallback);

        assert_eq!(playback, test_playback(&animations, "sleep"));
    }

    #[test]
    fn bundled_animation_set_uses_registry_runtime_profiles_for_manifest_handles() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let key = NativePetAnimationKey::parse("fallen_idle_left").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("fallen idle animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

        assert_eq!(
            animations.render_profile_for_playback(playback),
            NativePetAnimationRenderProfile::Fallen
        );
        assert_eq!(
            animations.local_interaction_profile_for_playback(playback),
            NativePetAnimationLocalInteractionProfile::FallenIdleLeft
        );
    }

    #[test]
    fn playback_can_target_custom_manifest_animation_handle() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture future clip".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(0, 120)],
            loop_animation: false,
            name: "future_clip".to_owned(),
            row: 0,
        });
        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
        let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
        let handle = animations
            .animation_handle_for_key(&animation)
            .expect("future clip has manifest handle");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

        assert_eq!(animations.frame_index(playback), 0);
        assert_eq!(playback.manifest_handle(), Some(handle));
    }

    #[test]
    fn manifest_loader_accepts_animation_keys_beyond_bundled_actions() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let expected_animation_count = manifest.animations.len() + 1;
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture future clip".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(0, 120)],
            loop_animation: false,
            name: "future_clip".to_owned(),
            row: 0,
        });

        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");

        assert_eq!(animations.len(), expected_animation_count);
        assert!(animations
            .animation_for_manifest_key("future_clip")
            .is_some());
        let animation = NativePetAnimationKey::parse("future_clip").expect("valid manifest key");
        assert!(matches!(
            animations
                .animation_target_for_key(&animation)
                .expect("future clip has target"),
            NativePetAnimationTarget::ManifestHandle(_)
        ));
    }

    #[test]
    fn manifest_loader_does_not_require_legacy_bundled_keys() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest
            .animations
            .iter_mut()
            .find(|animation| animation.name == "wake")
            .expect("bundled manifest has wake animation")
            .name = "future_wake".to_owned();
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_wake".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Wake,
                local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );

        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest can replace a legacy slot key with registry-profiled clip");
        let animation = NativePetAnimationKey::parse("future_wake").expect("valid key");

        assert!(matches!(
            animations
                .animation_target_for_key(&animation)
                .expect("future wake has target"),
            NativePetAnimationTarget::ManifestHandle(_)
        ));
    }

    #[test]
    fn manifest_loader_rejects_animation_keys_that_control_protocol_cannot_address() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture invalid clip".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(0, 120)],
            loop_animation: false,
            name: "Future Clip!".to_owned(),
            row: 0,
        });

        let error = NativePetAnimationSet::from_manifest(manifest)
            .expect_err("manifest animation key should match control protocol");

        assert_eq!(
            error.to_string(),
            "runtime failed: native pet manifest has invalid animation key: Future Clip!"
        );
    }

    #[test]
    fn maps_native_pet_animation_playback_to_manifest_frames() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        let mut playback = test_playback(&animations, "run_right");
        assert_eq!(animations.frame_index(playback), 16);

        playback.frame_phase = 7;
        assert_eq!(animations.frame_index(playback), 23);

        playback.frame_phase = 8;
        assert_eq!(animations.frame_index(playback), 16);

        let mut playback = test_playback(&animations, "drag");
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
        let mut playback = test_playback(&animations, "tap");
        let tap = animations.test_animation("tap");
        let fallback: NativePetPlaybackFallbackDecision = test_target(&animations, "idle").into();

        playback.advance(&animations, tap.total_duration_ms(), fallback);

        assert_eq!(playback, test_playback(&animations, "idle"));
    }

    #[test]
    fn held_playback_stays_on_last_frame_until_the_next_action_restarts_it() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let tap = animations.test_animation("tap");
        let tap_target = test_target(&animations, "tap");
        let idle_fallback = fallback_decision(&animations, "idle");
        let mut playback = NativePetAnimationPlayback::from_target(tap_target);

        playback.hold_last_frame(&animations);
        playback.advance(&animations, tap.total_duration_ms() * 2, idle_fallback);

        assert_eq!(playback.animation_target(), tap_target);
        assert_eq!(playback.frame_phase, tap.frame_count() - 1);

        playback.restart_animation_target(tap_target);

        assert_eq!(playback.frame_phase, 0);
        assert_eq!(playback.elapsed_ms, 0);
    }

    #[test]
    fn returns_to_requested_looping_animation_after_one_shot_interaction() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = test_playback(&animations, "tap");
        let tap = animations.test_animation("tap");

        playback.advance(
            &animations,
            tap.total_duration_ms(),
            fallback_decision(&animations, "working"),
        );

        assert_eq!(playback, test_playback(&animations, "working"));
        assert_eq!(
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "working"),
                test_target(&animations, "idle"),
            )
            .animation_target(),
            test_target(&animations, "working")
        );
        assert_eq!(
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "celebrate"),
                test_target(&animations, "idle"),
            )
            .animation_target(),
            test_target(&animations, "idle")
        );
    }

    #[test]
    fn playback_fallback_can_return_to_manifest_only_animation_target() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture future loop".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(0, 120)],
            loop_animation: true,
            name: "future_loop".to_owned(),
            row: 0,
        });
        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra loop loads");
        let key = NativePetAnimationKey::parse("future_loop").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("future loop has manifest handle");
        let fallback: NativePetPlaybackFallbackDecision =
            NativePetAnimationTarget::ManifestHandle(handle).into();
        let mut playback = test_playback(&animations, "tap");
        let tap = animations.test_animation("tap");

        playback.advance(&animations, tap.total_duration_ms(), fallback);

        assert_eq!(playback.manifest_handle(), Some(handle));
    }

    #[test]
    fn trip_fall_waits_for_click_before_getting_up() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let mut playback = test_playback(&animations, "trip_fall_left");
        let trip_left = animations.test_animation("trip_fall_left");
        let fallback = native_pet_completed_animation_fallback(
            &animations,
            playback,
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "idle"),
                test_target(&animations, "idle"),
            ),
            test_target(&animations, "idle"),
        );

        playback.advance(&animations, trip_left.total_duration_ms(), fallback);

        let fallen_key =
            NativePetAnimationKey::parse("fallen_idle_left").expect("valid animation key");
        let fallen_handle = animations
            .animation_handle_for_key(&fallen_key)
            .expect("fallen idle has manifest handle");
        assert_eq!(playback.manifest_handle(), Some(fallen_handle));

        let fallen_left = animations.test_animation("fallen_idle_left");
        playback.advance(
            &animations,
            fallen_left.total_duration_ms() * 3,
            fallback_decision(&animations, "idle"),
        );

        assert_eq!(playback.manifest_handle(), Some(fallen_handle));

        playback.restart_animation_target(test_target(&animations, "fallen_get_up_left"));
        let get_up_left = animations.test_animation("fallen_get_up_left");
        let fallback = native_pet_completed_animation_fallback(
            &animations,
            playback,
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "idle"),
                test_target(&animations, "idle"),
            ),
            test_target(&animations, "idle"),
        );
        playback.advance(&animations, get_up_left.total_duration_ms(), fallback);

        assert_eq!(playback, test_playback(&animations, "idle"));
    }

    #[test]
    fn manifest_profile_trip_fall_waits_on_matching_fallen_idle_target() {
        let mut manifest = serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture future trip fall".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(0, 120)],
            loop_animation: false,
            name: "future_trip_fall_left".to_owned(),
            row: 0,
        });
        manifest.animations.push(NativePetManifestAnimation {
            description: "Fixture future fallen idle".to_owned(),
            fps: None,
            frames: vec![timed_manifest_frame(1, 120)],
            loop_animation: true,
            name: "future_fallen_idle_left".to_owned(),
            row: 0,
        });
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_trip_fall_left".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::TripFall,
                local_interaction_profile:
                    NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
                completion_fallback_profile:
                    NativePetAnimationCompletionFallbackProfile::FallenIdleLeft,
            },
        );
        profiles.insert(
            "future_fallen_idle_left".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Fallen,
                local_interaction_profile:
                    NativePetAnimationLocalInteractionProfile::FallenIdleLeft,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future fall set loads");
        let trip_key = NativePetAnimationKey::parse("future_trip_fall_left").expect("valid key");
        let fallen_key =
            NativePetAnimationKey::parse("future_fallen_idle_left").expect("valid key");
        let trip_handle = animations
            .animation_handle_for_key(&trip_key)
            .expect("future trip exists");
        let fallen_handle = animations
            .animation_handle_for_key(&fallen_key)
            .expect("future fallen idle exists");
        let mut playback = NativePetAnimationPlayback::from_manifest_handle(trip_handle);
        let trip_duration = animations
            .animation_for_handle(trip_handle)
            .expect("future trip animation exists")
            .total_duration_ms();
        let fallback = native_pet_completed_animation_fallback(
            &animations,
            playback,
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_decision(&animations, "idle"),
                test_target(&animations, "idle"),
            ),
            test_target(&animations, "idle"),
        );

        playback.advance(&animations, trip_duration, fallback);

        assert_eq!(playback.manifest_handle(), Some(fallen_handle));
    }

    #[test]
    fn stumble_variants_return_to_idle_after_one_shot() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        for animation_key in ["stumble_recover_left", "stumble_recover_right"] {
            let mut playback = test_playback(&animations, animation_key);
            let animation = animations.test_animation(animation_key);
            let fallback = native_pet_completed_animation_fallback(
                &animations,
                playback,
                native_pet_requested_animation_fallback(
                    &animations,
                    lifecycle_decision(&animations, "idle"),
                    test_target(&animations, "idle"),
                ),
                test_target(&animations, "idle"),
            );

            playback.advance(&animations, animation.total_duration_ms(), fallback);

            assert_eq!(playback, test_playback(&animations, "idle"));
        }
    }

    #[test]
    fn can_restart_same_animation_for_explicit_control_replay() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let celebrate_target = test_target(&animations, "celebrate");
        let mut playback = test_playback(&animations, "celebrate");
        playback.elapsed_ms = 240;
        playback.frame_phase = 4;

        playback.restart_animation_target(celebrate_target);

        assert_eq!(playback, test_playback(&animations, "celebrate"));
    }
}
