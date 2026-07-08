use super::{NativePetAnimationName, NativePetAnimationSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetAnimationPlayback {
    pub(in crate::native_pet) elapsed_ms: u64,
    pub(in crate::native_pet) frame_phase: usize,
    pub(in crate::native_pet) name: NativePetAnimationName,
}

impl NativePetAnimationPlayback {
    pub(in crate::native_pet) fn new(name: NativePetAnimationName) -> Self {
        Self {
            elapsed_ms: 0,
            frame_phase: 0,
            name,
        }
    }

    pub(in crate::native_pet) fn set_animation(&mut self, name: NativePetAnimationName) {
        if self.name == name {
            return;
        }

        *self = Self::new(name);
    }

    pub(in crate::native_pet) fn restart_animation(&mut self, name: NativePetAnimationName) {
        *self = Self::new(name);
    }

    pub(in crate::native_pet) fn advance(
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
            if self.frame_phase + 1 < animation.frame_count() {
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

pub(in crate::native_pet) fn native_pet_requested_animation_fallback(
    animations: &NativePetAnimationSet,
    requested: NativePetAnimationName,
) -> NativePetAnimationName {
    if animations.animation(requested).loop_animation {
        requested
    } else {
        NativePetAnimationName::Idle
    }
}

pub(in crate::native_pet) fn native_pet_completed_animation_fallback(
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
