use std::cell::Cell;

use super::{
    animation::{
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationName, NativePetAnimationPlayback, NativePetAnimationSet,
    },
    lifecycle::{
        native_pet_animation_for_hover_state, native_pet_animation_for_lifecycle,
        native_pet_idle_lifecycle_elapsed_ms, native_pet_next_idle_presence_schedule_seed,
        native_pet_should_apply_lifecycle_animation,
        native_pet_should_rotate_idle_presence_schedule, native_pet_task_presence_animation,
        native_pet_task_presence_elapsed_ms,
    },
};

pub(super) struct NativePetLifecycleTickState<'a> {
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) pet_animations: &'a NativePetAnimationSet,
    pub(super) requested_animation: &'a Cell<NativePetAnimationName>,
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

    let is_position_managed = is_dragging || is_edge_runout_active || is_scripted_walk_active;
    let current_idle_lifecycle_elapsed_ms = idle_lifecycle_elapsed_ms.get();
    let next_idle_lifecycle_elapsed_ms = native_pet_idle_lifecycle_elapsed_ms(
        current_idle_lifecycle_elapsed_ms,
        elapsed_ms,
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation.get(),
    );
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
        task_presence_elapsed_ms.get(),
        elapsed_ms,
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation.get(),
    );
    task_presence_elapsed_ms.set(next_task_presence_elapsed_ms);

    let lifecycle_animation = native_pet_animation_for_lifecycle(
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation.get(),
        playback.name,
        next_idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed.get(),
    );
    if native_pet_should_apply_lifecycle_animation(playback.name, lifecycle_animation) {
        playback.set_animation(lifecycle_animation);
    }
    if let Some(task_presence_animation) = native_pet_task_presence_animation(
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation.get(),
        playback.name,
        next_task_presence_elapsed_ms,
    ) {
        playback.set_animation(task_presence_animation);
    }

    let default_fallback = native_pet_requested_animation_fallback(pet_animations, {
        if playback.name == NativePetAnimationName::Wake {
            native_pet_animation_for_hover_state(
                pointer_hovered.get(),
                is_dragging,
                is_inertia_active,
                requested_animation.get(),
                requested_animation.get(),
            )
        } else {
            lifecycle_animation
        }
    });
    let fallback = native_pet_completed_animation_fallback(playback.name, default_fallback);
    playback.advance(pet_animations, elapsed_ms, fallback);
}
