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
    #[cfg(test)]
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

    #[cfg(test)]
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
#[path = "__tests__/animation.rs"]
mod tests;
