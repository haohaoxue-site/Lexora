use std::cell::Cell;

use super::{
    animation::{
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationPlayback, NativePetAnimationSet, NativePetRequestedAnimationState,
    },
    lifecycle::{
        native_pet_animation_for_lifecycle, native_pet_idle_lifecycle_elapsed_ms,
        native_pet_next_idle_presence_schedule_seed, native_pet_should_apply_lifecycle_animation,
        native_pet_should_rotate_idle_presence_schedule, native_pet_task_presence_animation,
        native_pet_task_presence_elapsed_ms, NativePetCurrentAnimationState,
        NativePetIdleLifecycleElapsedInput, NativePetLifecycleActionTargets,
        NativePetLifecycleAnimationInput, NativePetTaskPresenceAnimationInput,
    },
};

pub(super) struct NativePetLifecycleTickState<'a> {
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) pet_animations: &'a NativePetAnimationSet,
    pub(super) lifecycle_action_targets: &'a NativePetLifecycleActionTargets,
    pub(super) requested_animation: &'a Cell<NativePetRequestedAnimationState>,
    pub(super) pointer_hovered: &'a Cell<bool>,
    pub(super) idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    pub(super) idle_presence_schedule_seed: &'a Cell<u64>,
    pub(super) task_presence_elapsed_ms: &'a Cell<u64>,
    pub(super) elapsed_ms: u64,
    pub(super) is_dragging: bool,
    pub(super) is_inertia_active: bool,
    pub(super) is_edge_runout_active: bool,
    pub(super) is_scripted_walk_active: bool,
}

pub(super) fn native_pet_advance_lifecycle_tick(state: NativePetLifecycleTickState<'_>) {
    let NativePetLifecycleTickState {
        playback,
        pet_animations,
        lifecycle_action_targets,
        requested_animation,
        pointer_hovered,
        idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed,
        task_presence_elapsed_ms,
        elapsed_ms,
        is_dragging,
        is_inertia_active,
        is_edge_runout_active,
        is_scripted_walk_active,
    } = state;

    let requested_animation_state = requested_animation.get();
    let is_position_managed = is_dragging || is_edge_runout_active || is_scripted_walk_active;
    let current_animation_state =
        NativePetCurrentAnimationState::from_playback(pet_animations, *playback);
    let current_idle_lifecycle_elapsed_ms = idle_lifecycle_elapsed_ms.get();
    let next_idle_lifecycle_elapsed_ms =
        native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
            current_elapsed_ms: current_idle_lifecycle_elapsed_ms,
            elapsed_ms,
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: current_animation_state,
            idle_target: lifecycle_action_targets.idle(),
        });
    if native_pet_should_rotate_idle_presence_schedule(
        current_idle_lifecycle_elapsed_ms,
        next_idle_lifecycle_elapsed_ms,
    ) {
        idle_presence_schedule_seed.set(native_pet_next_idle_presence_schedule_seed(
            idle_presence_schedule_seed.get(),
        ));
    }
    idle_lifecycle_elapsed_ms.set(next_idle_lifecycle_elapsed_ms);

    let next_task_presence_elapsed_ms = native_pet_task_presence_elapsed_ms(
        pet_animations,
        task_presence_elapsed_ms.get(),
        elapsed_ms,
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation_state,
    );
    task_presence_elapsed_ms.set(next_task_presence_elapsed_ms);

    let lifecycle_animation = native_pet_animation_for_lifecycle(
        lifecycle_action_targets,
        NativePetLifecycleAnimationInput {
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: current_animation_state,
            idle_elapsed_ms: next_idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: idle_presence_schedule_seed.get(),
        },
    );
    if native_pet_should_apply_lifecycle_animation(pet_animations, *playback, lifecycle_animation) {
        playback.set_lifecycle_animation(lifecycle_animation);
    }
    if let Some(task_presence_animation) = native_pet_task_presence_animation(
        lifecycle_action_targets,
        pet_animations,
        NativePetTaskPresenceAnimationInput {
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: NativePetCurrentAnimationState::from_playback(pet_animations, *playback),
            task_presence_elapsed_ms: next_task_presence_elapsed_ms,
        },
    ) {
        playback.set_lifecycle_animation(task_presence_animation);
    }

    let idle_target = lifecycle_action_targets.idle();
    let default_fallback =
        native_pet_requested_animation_fallback(pet_animations, lifecycle_animation, idle_target);
    let fallback = native_pet_completed_animation_fallback(
        pet_animations,
        *playback,
        default_fallback,
        idle_target,
    );
    playback.advance(pet_animations, elapsed_ms, fallback);
}

#[cfg(test)]
#[path = "__tests__/window_tick.rs"]
mod tests;
