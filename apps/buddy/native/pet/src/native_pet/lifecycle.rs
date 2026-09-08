mod current;
mod presence;
mod targets;
mod transitions;

pub(in crate::native_pet) use current::NativePetCurrentAnimationState;
pub(super) use presence::{
    native_pet_animation_for_lifecycle, native_pet_idle_lifecycle_elapsed_ms,
    native_pet_initial_idle_presence_schedule_seed, native_pet_initial_throw_outcome_seed,
    native_pet_next_idle_presence_schedule_seed, native_pet_next_throw_outcome_seed,
    native_pet_should_apply_lifecycle_animation, native_pet_should_rotate_idle_presence_schedule,
    native_pet_task_presence_animation, native_pet_task_presence_elapsed_ms,
    NativePetIdleLifecycleElapsedInput, NativePetLifecycleAnimationInput,
    NativePetTaskPresenceAnimationInput,
};
pub(in crate::native_pet) use targets::{
    NativePetFallenGetUpActionTargets, NativePetLifecycleActionTargets,
    NativePetMovementActionTargets,
};
pub(super) use transitions::{
    native_pet_animation_after_drag_release, native_pet_animation_for_hover_state,
    native_pet_animation_for_velocity, native_pet_facing_for_velocity,
    native_pet_fallen_get_up_animation, native_pet_initial_animation,
    native_pet_requested_animation_after_pointer_interaction,
    native_pet_requested_animation_for_control_animation,
    native_pet_should_block_pointer_interaction, native_pet_should_keep_scripted_action_playing,
    NativePetLocalInteractionAnimationState,
};

#[cfg(test)]
use transitions::native_pet_should_keep_fallen_waiting;

#[cfg(test)]
#[path = "__tests__/lifecycle.rs"]
mod tests;
