use super::super::animation::{
    NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
    NativePetAnimationRenderProfile, NativePetAnimationSet, NativePetAnimationTarget,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetCurrentAnimationState {
    playback: NativePetAnimationPlayback,
    render_profile: NativePetAnimationRenderProfile,
    local_interaction_profile: NativePetAnimationLocalInteractionProfile,
}

impl NativePetCurrentAnimationState {
    pub(in crate::native_pet) fn from_playback(
        animations: &NativePetAnimationSet,
        playback: NativePetAnimationPlayback,
    ) -> Self {
        Self {
            playback,
            render_profile: animations.render_profile_for_playback(playback),
            local_interaction_profile: animations.local_interaction_profile_for_playback(playback),
        }
    }

    pub(in crate::native_pet) fn animation_target(self) -> NativePetAnimationTarget {
        self.playback.animation_target()
    }

    pub(in crate::native_pet) fn local_interaction_profile(
        self,
    ) -> NativePetAnimationLocalInteractionProfile {
        self.local_interaction_profile
    }

    pub(in crate::native_pet) fn is_sleep(self) -> bool {
        matches!(self.render_profile, NativePetAnimationRenderProfile::Sleep)
    }

    pub(in crate::native_pet) fn is_sad(self) -> bool {
        matches!(self.render_profile, NativePetAnimationRenderProfile::Sad)
    }

    pub(in crate::native_pet) fn is_working(self) -> bool {
        matches!(
            self.render_profile,
            NativePetAnimationRenderProfile::Working
        )
    }

    pub(in crate::native_pet) fn can_be_replaced_by_lifecycle(self) -> bool {
        matches!(
            self.render_profile,
            NativePetAnimationRenderProfile::Idle
                | NativePetAnimationRenderProfile::Sleep
                | NativePetAnimationRenderProfile::Hover
        )
    }

    pub(in crate::native_pet) fn should_be_preserved_during_hover_transition(self) -> bool {
        matches!(
            self.render_profile,
            NativePetAnimationRenderProfile::Wake
                | NativePetAnimationRenderProfile::Tap
                | NativePetAnimationRenderProfile::GrabStart
                | NativePetAnimationRenderProfile::Approval
                | NativePetAnimationRenderProfile::Thinking
                | NativePetAnimationRenderProfile::Working
                | NativePetAnimationRenderProfile::Celebrate
                | NativePetAnimationRenderProfile::Dance
                | NativePetAnimationRenderProfile::Cast
                | NativePetAnimationRenderProfile::Sad
                | NativePetAnimationRenderProfile::Reassure
                | NativePetAnimationRenderProfile::Explain
                | NativePetAnimationRenderProfile::Curious
                | NativePetAnimationRenderProfile::TripFall
                | NativePetAnimationRenderProfile::Fallen
                | NativePetAnimationRenderProfile::FallenGetUp
                | NativePetAnimationRenderProfile::StumbleRecover
        )
    }
}
