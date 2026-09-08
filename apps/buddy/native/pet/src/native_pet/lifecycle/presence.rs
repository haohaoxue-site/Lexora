use std::time::{SystemTime, UNIX_EPOCH};

use super::super::animation::{
    NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
    NativePetAnimationRenderProfile, NativePetAnimationSet, NativePetAnimationTarget,
    NativePetLifecycleAnimationDecision, NativePetRequestedAnimationState,
};
use super::current::NativePetCurrentAnimationState;
use super::targets::NativePetLifecycleActionTargets;

const NATIVE_PET_IDLE_PRESENCE_AFTER_IDLE_MS: [u64; 2] = [18_000, 31_000];
const NATIVE_PET_IDLE_PRESENCE_DRIFT_MS: [i64; 5] = [0, 1_000, -1_000, 500, -500];
const NATIVE_PET_IDLE_PRESENCE_TRIGGER_WINDOW_MS: u64 = 64 * 2;
const NATIVE_PET_SLEEP_AFTER_IDLE_MS: u64 = 45_000;
const NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS: u64 = 22_000;
const NATIVE_PET_TASK_PRESENCE_INTERVAL_MS: u64 = 24_000;
const NATIVE_PET_TASK_PRESENCE_TRIGGER_WINDOW_MS: u64 = 64 * 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetTaskPresenceState {
    Approval,
    Thinking,
    Working,
}

impl NativePetTaskPresenceState {
    fn from_render_profile(profile: NativePetAnimationRenderProfile) -> Option<Self> {
        match profile {
            NativePetAnimationRenderProfile::Approval => Some(Self::Approval),
            NativePetAnimationRenderProfile::Thinking => Some(Self::Thinking),
            NativePetAnimationRenderProfile::Working => Some(Self::Working),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetLifecycleAnimationInput {
    pub(in crate::native_pet) pointer_hovered: bool,
    pub(in crate::native_pet) is_dragging: bool,
    pub(in crate::native_pet) is_inertia_active: bool,
    pub(in crate::native_pet) requested: NativePetRequestedAnimationState,
    pub(in crate::native_pet) current: NativePetCurrentAnimationState,
    pub(in crate::native_pet) idle_elapsed_ms: u64,
    pub(in crate::native_pet) idle_presence_schedule_seed: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetTaskPresenceAnimationInput {
    pub(in crate::native_pet) pointer_hovered: bool,
    pub(in crate::native_pet) is_dragging: bool,
    pub(in crate::native_pet) is_inertia_active: bool,
    pub(in crate::native_pet) requested: NativePetRequestedAnimationState,
    pub(in crate::native_pet) current: NativePetCurrentAnimationState,
    pub(in crate::native_pet) task_presence_elapsed_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetIdleLifecycleElapsedInput {
    pub(in crate::native_pet) current_elapsed_ms: u64,
    pub(in crate::native_pet) elapsed_ms: u64,
    pub(in crate::native_pet) pointer_hovered: bool,
    pub(in crate::native_pet) is_dragging: bool,
    pub(in crate::native_pet) is_inertia_active: bool,
    pub(in crate::native_pet) requested: NativePetRequestedAnimationState,
    pub(in crate::native_pet) current: NativePetCurrentAnimationState,
    pub(in crate::native_pet) idle_target: NativePetAnimationTarget,
}

pub(in crate::native_pet) fn native_pet_idle_lifecycle_elapsed_ms(
    input: NativePetIdleLifecycleElapsedInput,
) -> u64 {
    let NativePetIdleLifecycleElapsedInput {
        current_elapsed_ms,
        elapsed_ms,
        pointer_hovered,
        is_dragging,
        is_inertia_active,
        requested,
        current,
        idle_target,
    } = input;
    if current.is_sleep()
        || matches!(
            current.local_interaction_profile(),
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction
        )
    {
        return 0;
    }

    if requested.is_idle(idle_target) && !pointer_hovered && !is_dragging && !is_inertia_active {
        return current_elapsed_ms.saturating_add(elapsed_ms);
    }

    0
}

pub(in crate::native_pet) fn native_pet_task_presence_elapsed_ms(
    animations: &NativePetAnimationSet,
    current_elapsed_ms: u64,
    elapsed_ms: u64,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetRequestedAnimationState,
) -> u64 {
    if NativePetTaskPresenceState::from_render_profile(
        animations.render_profile_for_target(requested.animation_target()),
    )
    .is_none()
    {
        return 0;
    }
    if pointer_hovered || is_dragging || is_inertia_active {
        return 0;
    }

    current_elapsed_ms.saturating_add(elapsed_ms)
}

pub(in crate::native_pet) fn native_pet_task_presence_animation(
    targets: &NativePetLifecycleActionTargets,
    animations: &NativePetAnimationSet,
    input: NativePetTaskPresenceAnimationInput,
) -> Option<NativePetLifecycleAnimationDecision> {
    let NativePetTaskPresenceAnimationInput {
        pointer_hovered,
        is_dragging,
        is_inertia_active,
        requested,
        current,
        task_presence_elapsed_ms,
    } = input;
    let requested_presence_state = NativePetTaskPresenceState::from_render_profile(
        animations.render_profile_for_target(requested.animation_target()),
    )?;
    if pointer_hovered
        || is_dragging
        || is_inertia_active
        || current.animation_target() != requested.animation_target()
    {
        return None;
    }

    if native_pet_should_play_task_presence_reaction(task_presence_elapsed_ms) {
        return Some(
            native_pet_task_presence_reaction_animation(targets, requested_presence_state).into(),
        );
    }

    None
}

fn native_pet_task_presence_reaction_animation(
    targets: &NativePetLifecycleActionTargets,
    requested: NativePetTaskPresenceState,
) -> NativePetAnimationTarget {
    match requested {
        NativePetTaskPresenceState::Thinking => targets.explain(),
        NativePetTaskPresenceState::Approval => targets.hover(),
        NativePetTaskPresenceState::Working => targets.curious(),
    }
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
    targets: &NativePetLifecycleActionTargets,
    input: NativePetLifecycleAnimationInput,
) -> NativePetLifecycleAnimationDecision {
    let NativePetLifecycleAnimationInput {
        pointer_hovered,
        is_dragging,
        is_inertia_active,
        requested,
        current,
        idle_elapsed_ms,
        idle_presence_schedule_seed,
    } = input;

    if is_dragging || is_inertia_active {
        return requested.animation_target().into();
    }

    if requested.is_idle(targets.idle()) && current.is_sad() {
        return targets.reassure().into();
    }

    if requested.is_idle(targets.idle()) && current.is_working() {
        return targets.celebrate().into();
    }

    if requested.animation_target() == targets.sleep() {
        return targets.sleep().into();
    }

    if !requested.is_idle(targets.idle()) {
        if current.is_sleep() {
            return targets.wake().into();
        }

        return requested.animation_target().into();
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

    if idle_elapsed_ms >= NATIVE_PET_SLEEP_AFTER_IDLE_MS {
        return targets.sleep_enter().into();
    }

    if let Some(animation) = native_pet_idle_presence_reaction_animation(
        targets,
        idle_elapsed_ms,
        idle_presence_schedule_seed,
    ) {
        return animation.into();
    }

    targets.idle().into()
}

fn native_pet_idle_presence_reaction_animation(
    targets: &NativePetLifecycleActionTargets,
    idle_elapsed_ms: u64,
    idle_presence_schedule_seed: u64,
) -> Option<NativePetAnimationTarget> {
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
                targets,
                idle_presence_schedule_seed,
                index,
            ))
        })
}

fn native_pet_idle_presence_reaction_for_seed(
    targets: &NativePetLifecycleActionTargets,
    idle_presence_schedule_seed: u64,
    threshold_index: usize,
) -> NativePetAnimationTarget {
    let branch = idle_presence_schedule_seed.wrapping_add(threshold_index as u64);
    match branch % 3 {
        0 => targets.idle(),
        _ => targets.curious(),
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
    animations: &NativePetAnimationSet,
    current: NativePetAnimationPlayback,
    target: NativePetLifecycleAnimationDecision,
) -> bool {
    let current = NativePetCurrentAnimationState::from_playback(animations, current);
    current.animation_target() != target.animation_target()
        && !matches!(
            current.local_interaction_profile(),
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction
        )
        && current.can_be_replaced_by_lifecycle()
}
