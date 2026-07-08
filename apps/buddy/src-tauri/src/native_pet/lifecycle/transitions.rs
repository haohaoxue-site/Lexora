use super::super::{
    animation::NativePetAnimationName, coordinates::NativePetLogicalVelocity,
    geometry::NativePetFacing,
};

fn native_pet_animation_for_facing(facing: NativePetFacing) -> NativePetAnimationName {
    match facing {
        NativePetFacing::Left => NativePetAnimationName::RunLeft,
        NativePetFacing::Right => NativePetAnimationName::RunRight,
    }
}

pub(in crate::native_pet) fn native_pet_animation_for_velocity(
    velocity: NativePetLogicalVelocity,
    facing: NativePetFacing,
) -> NativePetAnimationName {
    if velocity.x.abs() > 1.0 {
        if velocity.x > 0.0 {
            return NativePetAnimationName::RunRight;
        }
        return NativePetAnimationName::RunLeft;
    }

    native_pet_animation_for_facing(facing)
}

pub(in crate::native_pet) fn native_pet_initial_animation() -> NativePetAnimationName {
    NativePetAnimationName::Wake
}

pub(in crate::native_pet) fn native_pet_animation_after_drag_release(
    was_dragging: bool,
    inertia_velocity: Option<NativePetLogicalVelocity>,
    facing: NativePetFacing,
) -> NativePetAnimationName {
    if !was_dragging {
        return NativePetAnimationName::Tap;
    }

    if let Some(velocity) = inertia_velocity {
        return native_pet_animation_for_velocity(velocity, facing);
    }

    NativePetAnimationName::Idle
}

pub(in crate::native_pet) fn native_pet_animation_after_throw_runout(
    run_animation: NativePetAnimationName,
    variant_seed: u64,
) -> NativePetAnimationName {
    match (run_animation, variant_seed % 3) {
        (_, 0) => NativePetAnimationName::Idle,
        (NativePetAnimationName::RunLeft, 1) => NativePetAnimationName::TripFallLeft,
        (NativePetAnimationName::RunRight, 1) => NativePetAnimationName::TripFallRight,
        (NativePetAnimationName::RunLeft, _) => NativePetAnimationName::StumbleRecoverLeft,
        (NativePetAnimationName::RunRight, _) => NativePetAnimationName::StumbleRecoverRight,
        _ => NativePetAnimationName::Idle,
    }
}

pub(in crate::native_pet) fn native_pet_requested_animation_for_control_animation(
    control_animation: NativePetAnimationName,
) -> NativePetAnimationName {
    if native_pet_is_finite_scripted_action(control_animation) {
        return NativePetAnimationName::Idle;
    }

    control_animation
}

pub(in crate::native_pet) fn native_pet_requested_animation_after_pointer_interaction(
    requested: NativePetAnimationName,
) -> NativePetAnimationName {
    if matches!(requested, NativePetAnimationName::Sleep) {
        return NativePetAnimationName::Idle;
    }

    requested
}

pub(in crate::native_pet) fn native_pet_fallen_get_up_animation(
    current: NativePetAnimationName,
) -> Option<NativePetAnimationName> {
    match current {
        NativePetAnimationName::FallenIdleLeft => Some(NativePetAnimationName::FallenGetUpLeft),
        NativePetAnimationName::FallenIdleRight => Some(NativePetAnimationName::FallenGetUpRight),
        _ => None,
    }
}

pub(super) fn native_pet_should_keep_fallen_waiting(current: NativePetAnimationName) -> bool {
    matches!(
        current,
        NativePetAnimationName::FallenIdleLeft | NativePetAnimationName::FallenIdleRight
    )
}

pub(in crate::native_pet) fn native_pet_should_keep_scripted_action_playing(
    current: NativePetAnimationName,
) -> bool {
    native_pet_is_finite_scripted_action(current) || native_pet_should_keep_fallen_waiting(current)
}

fn native_pet_is_finite_scripted_action(current: NativePetAnimationName) -> bool {
    matches!(
        current,
        NativePetAnimationName::TripFallLeft
            | NativePetAnimationName::FallenGetUpLeft
            | NativePetAnimationName::TripFallRight
            | NativePetAnimationName::FallenGetUpRight
            | NativePetAnimationName::StumbleRecoverLeft
            | NativePetAnimationName::StumbleRecoverRight
    )
}

pub(in crate::native_pet) fn native_pet_should_block_pointer_interaction(
    current: NativePetAnimationName,
) -> bool {
    native_pet_should_keep_scripted_action_playing(current)
        && !native_pet_should_keep_fallen_waiting(current)
}

pub(in crate::native_pet) fn native_pet_animation_for_hover_state(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
) -> NativePetAnimationName {
    if is_dragging || is_inertia_active {
        return requested;
    }

    if native_pet_should_preserve_animation_during_hover_transition(current) {
        return current;
    }

    if matches!(current, NativePetAnimationName::Sleep) {
        if pointer_hovered {
            return NativePetAnimationName::Wake;
        }

        return NativePetAnimationName::Sleep;
    }

    if pointer_hovered {
        return NativePetAnimationName::Hover;
    }

    requested
}

fn native_pet_should_preserve_animation_during_hover_transition(
    current: NativePetAnimationName,
) -> bool {
    matches!(
        current,
        NativePetAnimationName::Wake
            | NativePetAnimationName::Tap
            | NativePetAnimationName::GrabStart
            | NativePetAnimationName::Approval
            | NativePetAnimationName::Thinking
            | NativePetAnimationName::Working
            | NativePetAnimationName::Celebrate
            | NativePetAnimationName::Sad
            | NativePetAnimationName::Reassure
            | NativePetAnimationName::Explain
            | NativePetAnimationName::Curious
            | NativePetAnimationName::TripFallLeft
            | NativePetAnimationName::FallenIdleLeft
            | NativePetAnimationName::FallenGetUpLeft
            | NativePetAnimationName::TripFallRight
            | NativePetAnimationName::FallenIdleRight
            | NativePetAnimationName::FallenGetUpRight
            | NativePetAnimationName::StumbleRecoverLeft
            | NativePetAnimationName::StumbleRecoverRight
    )
}
