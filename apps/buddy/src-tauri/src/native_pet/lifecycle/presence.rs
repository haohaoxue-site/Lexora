use std::time::{SystemTime, UNIX_EPOCH};

use super::super::animation::NativePetAnimationName;

const NATIVE_PET_IDLE_PRESENCE_AFTER_IDLE_MS: [u64; 2] = [18_000, 31_000];
const NATIVE_PET_IDLE_PRESENCE_DRIFT_MS: [i64; 5] = [0, 1_000, -1_000, 500, -500];
const NATIVE_PET_IDLE_PRESENCE_TRIGGER_WINDOW_MS: u64 = 64 * 2;
const NATIVE_PET_SLEEP_AFTER_IDLE_MS: u64 = 45_000;
const NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS: u64 = 22_000;
const NATIVE_PET_TASK_PRESENCE_INTERVAL_MS: u64 = 24_000;
const NATIVE_PET_TASK_PRESENCE_TRIGGER_WINDOW_MS: u64 = 64 * 2;

pub(in crate::native_pet) fn native_pet_idle_lifecycle_elapsed_ms(
    current_elapsed_ms: u64,
    elapsed_ms: u64,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
) -> u64 {
    if matches!(requested, NativePetAnimationName::Idle)
        && !pointer_hovered
        && !is_dragging
        && !is_inertia_active
    {
        return current_elapsed_ms.saturating_add(elapsed_ms);
    }

    0
}

pub(in crate::native_pet) fn native_pet_task_presence_elapsed_ms(
    current_elapsed_ms: u64,
    elapsed_ms: u64,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
) -> u64 {
    if native_pet_is_task_presence_state(requested)
        && !pointer_hovered
        && !is_dragging
        && !is_inertia_active
    {
        return current_elapsed_ms.saturating_add(elapsed_ms);
    }

    0
}

pub(in crate::native_pet) fn native_pet_task_presence_animation(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
    task_presence_elapsed_ms: u64,
) -> Option<NativePetAnimationName> {
    if pointer_hovered || is_dragging || is_inertia_active || current != requested {
        return None;
    }

    if !native_pet_is_task_presence_state(requested) {
        return None;
    }

    if native_pet_should_play_task_presence_reaction(task_presence_elapsed_ms) {
        return Some(native_pet_task_presence_reaction_animation(requested));
    }

    None
}

fn native_pet_task_presence_reaction_animation(
    requested: NativePetAnimationName,
) -> NativePetAnimationName {
    match requested {
        NativePetAnimationName::Thinking => NativePetAnimationName::Explain,
        NativePetAnimationName::Approval => NativePetAnimationName::Hover,
        NativePetAnimationName::Working => NativePetAnimationName::Curious,
        _ => NativePetAnimationName::Curious,
    }
}

fn native_pet_is_task_presence_state(requested: NativePetAnimationName) -> bool {
    matches!(
        requested,
        NativePetAnimationName::Thinking
            | NativePetAnimationName::Working
            | NativePetAnimationName::Approval
    )
}

fn native_pet_should_play_task_presence_reaction(task_presence_elapsed_ms: u64) -> bool {
    if task_presence_elapsed_ms < NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS {
        return false;
    }

    let elapsed_after_first = task_presence_elapsed_ms - NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS;
    elapsed_after_first % NATIVE_PET_TASK_PRESENCE_INTERVAL_MS
        < NATIVE_PET_TASK_PRESENCE_TRIGGER_WINDOW_MS
}

pub(in crate::native_pet) fn native_pet_animation_for_lifecycle(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
    idle_elapsed_ms: u64,
    idle_presence_schedule_seed: u64,
) -> NativePetAnimationName {
    if is_dragging || is_inertia_active {
        return requested;
    }

    if matches!(requested, NativePetAnimationName::Idle)
        && matches!(current, NativePetAnimationName::Sad)
    {
        return NativePetAnimationName::Reassure;
    }

    if matches!(requested, NativePetAnimationName::Idle)
        && matches!(current, NativePetAnimationName::Working)
    {
        return NativePetAnimationName::Celebrate;
    }

    if !matches!(requested, NativePetAnimationName::Idle) {
        if matches!(current, NativePetAnimationName::Sleep) {
            return NativePetAnimationName::Wake;
        }

        return requested;
    }

    if pointer_hovered {
        if matches!(current, NativePetAnimationName::Sleep) {
            return NativePetAnimationName::Wake;
        }

        return NativePetAnimationName::Hover;
    }

    if idle_elapsed_ms >= NATIVE_PET_SLEEP_AFTER_IDLE_MS {
        return NativePetAnimationName::Sleep;
    }

    if let Some(animation) =
        native_pet_idle_presence_reaction_animation(idle_elapsed_ms, idle_presence_schedule_seed)
    {
        return animation;
    }

    NativePetAnimationName::Idle
}

fn native_pet_idle_presence_reaction_animation(
    idle_elapsed_ms: u64,
    idle_presence_schedule_seed: u64,
) -> Option<NativePetAnimationName> {
    NATIVE_PET_IDLE_PRESENCE_AFTER_IDLE_MS
        .iter()
        .enumerate()
        .find_map(|(index, threshold_ms)| {
            let threshold_ms = native_pet_idle_presence_threshold_ms(
                *threshold_ms,
                index,
                idle_presence_schedule_seed,
            );
            if idle_elapsed_ms < threshold_ms
                || idle_elapsed_ms >= threshold_ms + NATIVE_PET_IDLE_PRESENCE_TRIGGER_WINDOW_MS
            {
                return None;
            }

            Some(native_pet_idle_presence_reaction_for_seed(
                idle_presence_schedule_seed,
                index,
            ))
        })
}

fn native_pet_idle_presence_reaction_for_seed(
    idle_presence_schedule_seed: u64,
    threshold_index: usize,
) -> NativePetAnimationName {
    let branch = idle_presence_schedule_seed.wrapping_add(threshold_index as u64);
    match branch % 3 {
        0 => NativePetAnimationName::Idle,
        _ => NativePetAnimationName::Curious,
    }
}

fn native_pet_idle_presence_threshold_ms(
    threshold_ms: u64,
    threshold_index: usize,
    idle_presence_schedule_seed: u64,
) -> u64 {
    if idle_presence_schedule_seed == 0 {
        return threshold_ms;
    }

    let drift_index = ((idle_presence_schedule_seed + threshold_index as u64) as usize)
        % NATIVE_PET_IDLE_PRESENCE_DRIFT_MS.len();
    let drift_ms = NATIVE_PET_IDLE_PRESENCE_DRIFT_MS[drift_index];
    if drift_ms >= 0 {
        return threshold_ms.saturating_add(drift_ms as u64);
    }

    threshold_ms.saturating_sub(drift_ms.unsigned_abs())
}

pub(in crate::native_pet) fn native_pet_initial_idle_presence_schedule_seed() -> u64 {
    let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return 0;
    };

    duration.as_secs() ^ u64::from(duration.subsec_nanos())
}

pub(in crate::native_pet) fn native_pet_initial_throw_outcome_seed() -> u64 {
    native_pet_initial_idle_presence_schedule_seed()
}

pub(in crate::native_pet) fn native_pet_next_idle_presence_schedule_seed(current_seed: u64) -> u64 {
    current_seed.wrapping_add(1)
}

pub(in crate::native_pet) fn native_pet_next_throw_outcome_seed(current_seed: u64) -> u64 {
    current_seed.wrapping_add(1)
}

pub(in crate::native_pet) fn native_pet_should_rotate_idle_presence_schedule(
    current_idle_elapsed_ms: u64,
    next_idle_elapsed_ms: u64,
) -> bool {
    current_idle_elapsed_ms > 0 && next_idle_elapsed_ms == 0
}

pub(in crate::native_pet) fn native_pet_should_apply_lifecycle_animation(
    current: NativePetAnimationName,
    target: NativePetAnimationName,
) -> bool {
    current != target
        && matches!(
            current,
            NativePetAnimationName::Idle
                | NativePetAnimationName::Sleep
                | NativePetAnimationName::Hover
        )
}
