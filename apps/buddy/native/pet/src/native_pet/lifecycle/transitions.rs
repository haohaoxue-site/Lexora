use super::super::{
    animation::{
        NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
        NativePetAnimationSet, NativePetAnimationTarget, NativePetLifecycleAnimationDecision,
        NativePetRequestedAnimationState,
    },
    coordinates::NativePetLogicalVelocity,
    geometry::NativePetFacing,
};
use super::{
    current::NativePetCurrentAnimationState,
    targets::{
        NativePetFallenGetUpActionTargets, NativePetLifecycleActionTargets,
        NativePetMovementActionTargets,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(in crate::native_pet) enum NativePetLocalInteractionAnimationState {
    FallenIdleLeft,
    FallenIdleRight,
    FiniteScriptedAction,
    Other,
}

impl NativePetLocalInteractionAnimationState {
    pub(in crate::native_pet) fn from_playback(
        animations: &NativePetAnimationSet,
        playback: NativePetAnimationPlayback,
    ) -> Self {
        Self::from(animations.local_interaction_profile_for_playback(playback))
    }

    pub(in crate::native_pet) fn is_active(self) -> bool {
        !matches!(self, Self::Other)
    }
}

impl From<NativePetAnimationLocalInteractionProfile> for NativePetLocalInteractionAnimationState {
    fn from(value: NativePetAnimationLocalInteractionProfile) -> Self {
        match value {
            NativePetAnimationLocalInteractionProfile::FallenIdleLeft => Self::FallenIdleLeft,
            NativePetAnimationLocalInteractionProfile::FallenIdleRight => Self::FallenIdleRight,
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction => {
                Self::FiniteScriptedAction
            }
            NativePetAnimationLocalInteractionProfile::None => Self::Other,
        }
    }
}

fn native_pet_animation_for_facing(
    targets: &NativePetMovementActionTargets,
    facing: NativePetFacing,
) -> NativePetAnimationTarget {
    match facing {
        NativePetFacing::Left => targets.run_left(),
        NativePetFacing::Right => targets.run_right(),
    }
}

pub(in crate::native_pet) fn native_pet_facing_for_velocity(
    velocity: NativePetLogicalVelocity,
    facing: NativePetFacing,
) -> NativePetFacing {
    if velocity.x.abs() > 1.0 {
        if velocity.x > 0.0 {
            return NativePetFacing::Right;
        }
        return NativePetFacing::Left;
    }

    facing
}

pub(in crate::native_pet) fn native_pet_animation_for_velocity(
    targets: &NativePetMovementActionTargets,
    velocity: NativePetLogicalVelocity,
    facing: NativePetFacing,
) -> NativePetAnimationTarget {
    native_pet_animation_for_facing(targets, native_pet_facing_for_velocity(velocity, facing))
}

pub(in crate::native_pet) fn native_pet_initial_animation(
    targets: &NativePetLifecycleActionTargets,
) -> NativePetAnimationTarget {
    targets.wake()
}

pub(in crate::native_pet) fn native_pet_animation_after_drag_release(
    targets: &NativePetMovementActionTargets,
    was_dragging: bool,
    inertia_velocity: Option<NativePetLogicalVelocity>,
    facing: NativePetFacing,
) -> NativePetAnimationTarget {
    if !was_dragging {
        return targets.tap();
    }

    if let Some(velocity) = inertia_velocity {
        return native_pet_animation_for_velocity(targets, velocity, facing);
    }

    targets.idle()
}

pub(in crate::native_pet) fn native_pet_requested_animation_for_control_animation(
    animations: &NativePetAnimationSet,
    control_animation: NativePetAnimationTarget,
    idle_target: NativePetAnimationTarget,
) -> NativePetRequestedAnimationState {
    let current = NativePetLocalInteractionAnimationState::from(
        animations.local_interaction_profile_for_target(control_animation),
    );
    if native_pet_is_finite_scripted_action(current) {
        return NativePetRequestedAnimationState::from(idle_target);
    }

    NativePetRequestedAnimationState::from(control_animation)
}

pub(in crate::native_pet) fn native_pet_requested_animation_after_pointer_interaction(
    requested: NativePetRequestedAnimationState,
    sleep_target: NativePetAnimationTarget,
    idle_target: NativePetAnimationTarget,
) -> NativePetRequestedAnimationState {
    if requested.animation_target() == sleep_target {
        return NativePetRequestedAnimationState::from(idle_target);
    }

    requested
}

pub(in crate::native_pet) fn native_pet_fallen_get_up_animation(
    targets: &NativePetFallenGetUpActionTargets,
    current: NativePetLocalInteractionAnimationState,
) -> Option<NativePetAnimationTarget> {
    match current {
        NativePetLocalInteractionAnimationState::FallenIdleLeft => Some(targets.left()),
        NativePetLocalInteractionAnimationState::FallenIdleRight => Some(targets.right()),
        _ => None,
    }
}

pub(super) fn native_pet_should_keep_fallen_waiting(
    current: NativePetLocalInteractionAnimationState,
) -> bool {
    matches!(
        current,
        NativePetLocalInteractionAnimationState::FallenIdleLeft
            | NativePetLocalInteractionAnimationState::FallenIdleRight
    )
}

pub(in crate::native_pet) fn native_pet_should_keep_scripted_action_playing(
    current: NativePetLocalInteractionAnimationState,
) -> bool {
    native_pet_is_finite_scripted_action(current) || native_pet_should_keep_fallen_waiting(current)
}

fn native_pet_is_finite_scripted_action(current: NativePetLocalInteractionAnimationState) -> bool {
    matches!(
        current,
        NativePetLocalInteractionAnimationState::FiniteScriptedAction
    )
}

pub(in crate::native_pet) fn native_pet_should_block_pointer_interaction(
    current: NativePetLocalInteractionAnimationState,
) -> bool {
    native_pet_should_keep_scripted_action_playing(current)
        && !native_pet_should_keep_fallen_waiting(current)
}

pub(in crate::native_pet) fn native_pet_animation_for_hover_state(
    targets: &NativePetLifecycleActionTargets,
    animations: &NativePetAnimationSet,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetRequestedAnimationState,
    current: NativePetAnimationPlayback,
) -> NativePetLifecycleAnimationDecision {
    if is_dragging || is_inertia_active {
        return requested.animation_target().into();
    }

    let current = NativePetCurrentAnimationState::from_playback(animations, current);
    if native_pet_should_preserve_animation_during_hover_transition(current) {
        return current.animation_target().into();
    }

    if current.is_sleep() {
        if pointer_hovered {
            return targets.wake().into();
        }

        return targets.sleep().into();
    }

    if pointer_hovered {
        return targets.hover().into();
    }

    requested.animation_target().into()
}

fn native_pet_should_preserve_animation_during_hover_transition(
    current: NativePetCurrentAnimationState,
) -> bool {
    if native_pet_should_keep_scripted_action_playing(
        NativePetLocalInteractionAnimationState::from(current.local_interaction_profile()),
    ) {
        return true;
    }

    current.should_be_preserved_during_hover_transition()
}
