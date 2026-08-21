#[cfg(test)]
use super::NativePetAnimationHandle;
use super::{
    NativePetAnimationCompletionFallbackProfile, NativePetAnimationLocalInteractionProfile,
    NativePetAnimationSet, NativePetAnimationTarget, NativePetLifecycleAnimationDecision,
    NativePetPlaybackFallbackDecision,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetAnimationPlayback {
    pub(in crate::native_pet) elapsed_ms: u64,
    pub(in crate::native_pet) frame_phase: usize,
    target: NativePetAnimationTarget,
    holding_last_frame: bool,
}

impl NativePetAnimationPlayback {
    #[cfg(test)]
    pub(in crate::native_pet) fn from_manifest_handle(handle: NativePetAnimationHandle) -> Self {
        Self {
            elapsed_ms: 0,
            frame_phase: 0,
            target: NativePetAnimationTarget::ManifestHandle(handle),
            holding_last_frame: false,
        }
    }

    pub(in crate::native_pet) fn from_target(target: NativePetAnimationTarget) -> Self {
        Self {
            elapsed_ms: 0,
            frame_phase: 0,
            target,
            holding_last_frame: false,
        }
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn manifest_handle(&self) -> Option<NativePetAnimationHandle> {
        match self.target {
            NativePetAnimationTarget::ManifestHandle(handle) => Some(handle),
        }
    }

    pub(in crate::native_pet) fn animation_target(self) -> NativePetAnimationTarget {
        self.target
    }

    pub(in crate::native_pet) fn set_lifecycle_animation(
        &mut self,
        decision: NativePetLifecycleAnimationDecision,
    ) {
        self.set_animation_target(decision.animation_target());
    }

    pub(in crate::native_pet) fn set_animation_target(&mut self, target: NativePetAnimationTarget) {
        if self.target == target {
            return;
        }

        *self = Self::from_target(target);
    }

    pub(in crate::native_pet) fn restart_animation_target(
        &mut self,
        target: NativePetAnimationTarget,
    ) {
        *self = Self::from_target(target);
    }

    pub(in crate::native_pet) fn hold_last_frame(&mut self, animations: &NativePetAnimationSet) {
        self.elapsed_ms = 0;
        self.frame_phase = animations.animation_for_playback(*self).frame_count() - 1;
        self.holding_last_frame = true;
    }

    pub(in crate::native_pet) fn advance(
        &mut self,
        animations: &NativePetAnimationSet,
        elapsed_ms: u64,
        fallback: NativePetPlaybackFallbackDecision,
    ) {
        if self.holding_last_frame {
            return;
        }

        self.elapsed_ms += elapsed_ms;

        loop {
            let animation = animations.animation_for_playback(*self);
            let frame_duration_ms = animation.frame_duration_ms(self.frame_phase);
            if self.elapsed_ms < frame_duration_ms {
                break;
            }

            self.elapsed_ms -= frame_duration_ms;
            if self.frame_phase + 1 < animation.frame_count() {
                self.frame_phase += 1;
                continue;
            }

            if animation.loop_animation {
                self.frame_phase = 0;
            } else {
                self.set_animation_target(fallback.animation_target());
                break;
            }
        }
    }
}

pub(in crate::native_pet) fn native_pet_requested_animation_fallback(
    animations: &NativePetAnimationSet,
    requested: NativePetLifecycleAnimationDecision,
    idle_target: NativePetAnimationTarget,
) -> NativePetPlaybackFallbackDecision {
    let requested_target = requested.animation_target();
    if animations
        .animation_for_target(requested_target)
        .loop_animation
    {
        requested_target.into()
    } else {
        idle_target.into()
    }
}

pub(in crate::native_pet) fn native_pet_completed_animation_fallback(
    animations: &NativePetAnimationSet,
    completed: NativePetAnimationPlayback,
    default_fallback: NativePetPlaybackFallbackDecision,
    idle_target: NativePetAnimationTarget,
) -> NativePetPlaybackFallbackDecision {
    match animations.completion_fallback_profile_for_playback(completed) {
        NativePetAnimationCompletionFallbackProfile::Default => default_fallback,
        NativePetAnimationCompletionFallbackProfile::Idle => idle_target.into(),
        NativePetAnimationCompletionFallbackProfile::Sleep => animations
            .animation_target_for_manifest_key("sleep")
            .map(NativePetPlaybackFallbackDecision::from)
            .unwrap_or(default_fallback),
        NativePetAnimationCompletionFallbackProfile::FallenIdleLeft => animations
            .animation_target_for_local_interaction_profile(
                NativePetAnimationLocalInteractionProfile::FallenIdleLeft,
            )
            .map(NativePetPlaybackFallbackDecision::from)
            .unwrap_or_else(|| idle_target.into()),
        NativePetAnimationCompletionFallbackProfile::FallenIdleRight => animations
            .animation_target_for_local_interaction_profile(
                NativePetAnimationLocalInteractionProfile::FallenIdleRight,
            )
            .map(NativePetPlaybackFallbackDecision::from)
            .unwrap_or_else(|| idle_target.into()),
    }
}
