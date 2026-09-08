use std::cell::{Cell, RefCell};

use crate::{action_registry::ActionRegistry, error::BuddyResult};

use super::{
    animation::{
        NativePetAnimationPlayback, NativePetAnimationSet, NativePetAnimationTarget,
        NativePetRequestedAnimationState,
    },
    assets::native_pet_action_target_from_registry,
    geometry::NativePetFacing,
    lifecycle::native_pet_requested_animation_for_control_animation,
    process::{
        step_protocol::{
            execute_step_request, ExecuteStepPayload, ExecuteStepPlayback, ExecuteStepRequest,
            SidecarInterruptPolicy, SidecarPlayActionCompletionBehavior,
        },
        NativePetPresetBehaviorEvent,
    },
    step_runtime::{native_pet_start_active_step_for_execute_step, NativePetActiveStepState},
};

pub(super) const THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID: &str = "throw_after_drag";
const PRESET_BEHAVIOR_STEP_TIMEOUT_MS: u64 = 5_000;
const THROW_AFTER_DRAG_NONE_ACTION_ID: &str = "throw_after_drag.none";
const THROW_AFTER_DRAG_FALL_LEFT_ACTION_ID: &str = "throw_after_drag.fall.left";
const THROW_AFTER_DRAG_FALL_RIGHT_ACTION_ID: &str = "throw_after_drag.fall.right";
const THROW_AFTER_DRAG_STUMBLE_LEFT_ACTION_ID: &str = "throw_after_drag.stumble.left";
const THROW_AFTER_DRAG_STUMBLE_RIGHT_ACTION_ID: &str = "throw_after_drag.stumble.right";

pub(super) fn native_pet_new_preset_behavior_interaction_uuid() -> uuid::Uuid {
    uuid::Uuid::now_v7()
}

pub(super) fn native_pet_preset_behavior_interaction_id(interaction_uuid: uuid::Uuid) -> String {
    format!("interaction_{interaction_uuid}")
}

pub(super) fn native_pet_new_preset_behavior_interaction_id() -> String {
    native_pet_preset_behavior_interaction_id(native_pet_new_preset_behavior_interaction_uuid())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetThrowAfterDragFinish {
    None,
    FallLeft,
    FallRight,
    StumbleLeft,
    StumbleRight,
}

impl NativePetThrowAfterDragFinish {
    pub(super) fn action_id(self) -> &'static str {
        match self {
            Self::None => THROW_AFTER_DRAG_NONE_ACTION_ID,
            Self::FallLeft => THROW_AFTER_DRAG_FALL_LEFT_ACTION_ID,
            Self::FallRight => THROW_AFTER_DRAG_FALL_RIGHT_ACTION_ID,
            Self::StumbleLeft => THROW_AFTER_DRAG_STUMBLE_LEFT_ACTION_ID,
            Self::StumbleRight => THROW_AFTER_DRAG_STUMBLE_RIGHT_ACTION_ID,
        }
    }

    pub(super) fn outcome(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::FallLeft | Self::FallRight => "fall",
            Self::StumbleLeft | Self::StumbleRight => "stumble",
        }
    }

    pub(super) fn waits_for_get_up(self) -> bool {
        matches!(self, Self::FallLeft | Self::FallRight)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetThrowAfterDragFinishTargets {
    none: NativePetAnimationTarget,
    fall_left: NativePetAnimationTarget,
    fall_right: NativePetAnimationTarget,
    stumble_left: NativePetAnimationTarget,
    stumble_right: NativePetAnimationTarget,
}

impl NativePetThrowAfterDragFinishTargets {
    pub(super) fn load_bundled(animations: &NativePetAnimationSet) -> BuddyResult<Self> {
        let registry = ActionRegistry::load_bundled()?;
        Self::load(&registry, animations)
    }

    pub(super) fn load(
        registry: &ActionRegistry,
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        Ok(Self {
            none: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::None,
            )?,
            fall_left: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::FallLeft,
            )?,
            fall_right: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::FallRight,
            )?,
            stumble_left: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::StumbleLeft,
            )?,
            stumble_right: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::StumbleRight,
            )?,
        })
    }

    pub(super) fn animation_target(
        &self,
        finish: NativePetThrowAfterDragFinish,
    ) -> NativePetAnimationTarget {
        match finish {
            NativePetThrowAfterDragFinish::None => self.none,
            NativePetThrowAfterDragFinish::FallLeft => self.fall_left,
            NativePetThrowAfterDragFinish::FallRight => self.fall_right,
            NativePetThrowAfterDragFinish::StumbleLeft => self.stumble_left,
            NativePetThrowAfterDragFinish::StumbleRight => self.stumble_right,
        }
    }
}

pub(super) fn native_pet_throw_after_drag_finish_after_runout(
    run_facing: NativePetFacing,
    variant_seed: u64,
) -> NativePetThrowAfterDragFinish {
    match (run_facing, variant_seed % 3) {
        (_, 0) => NativePetThrowAfterDragFinish::None,
        (NativePetFacing::Left, 1) => NativePetThrowAfterDragFinish::FallLeft,
        (NativePetFacing::Right, 1) => NativePetThrowAfterDragFinish::FallRight,
        (NativePetFacing::Left, _) => NativePetThrowAfterDragFinish::StumbleLeft,
        (NativePetFacing::Right, _) => NativePetThrowAfterDragFinish::StumbleRight,
    }
}

pub(super) fn native_pet_throw_after_drag_preset_behavior_event(
    finish: NativePetThrowAfterDragFinish,
    animation: NativePetAnimationTarget,
    interaction_id: String,
    animations: &NativePetAnimationSet,
) -> NativePetPresetBehaviorEvent {
    NativePetPresetBehaviorEvent {
        preset_behavior_id: THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID.to_owned(),
        interaction_id: Some(interaction_id),
        outcome: finish.outcome().to_owned(),
        animation: animations.manifest_key_for_target(animation).to_owned(),
    }
}

pub(super) fn native_pet_fallen_get_up_preset_behavior_event(
    animation: NativePetAnimationTarget,
    interaction_id: String,
    animations: &NativePetAnimationSet,
) -> NativePetPresetBehaviorEvent {
    NativePetPresetBehaviorEvent {
        preset_behavior_id: THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID.to_owned(),
        interaction_id: Some(interaction_id),
        outcome: "get_up".to_owned(),
        animation: animations.manifest_key_for_target(animation).to_owned(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetFallenRecoveryState {
    interaction_id: String,
}

impl NativePetFallenRecoveryState {
    pub(super) fn into_interaction_id(self) -> String {
        self.interaction_id
    }
}

pub(super) fn native_pet_fallen_recovery_state_after_throw_finish(
    finish: NativePetThrowAfterDragFinish,
    interaction_id: String,
) -> Option<NativePetFallenRecoveryState> {
    if !finish.waits_for_get_up() {
        return None;
    }

    Some(NativePetFallenRecoveryState { interaction_id })
}

pub(super) fn native_pet_preset_behavior_execute_step_request(
    animation: NativePetAnimationTarget,
    interaction_id: &str,
    animations: &NativePetAnimationSet,
) -> ExecuteStepRequest {
    let animation_key = animations.manifest_key_for_target(animation);
    execute_step_request(
        native_pet_preset_behavior_step_id(interaction_id, animation_key),
        ExecuteStepPayload::PlayAction {
            animation: animation_key.to_owned(),
            playback: ExecuteStepPlayback::Once {
                duration_ms: animations
                    .animation_for_target(animation)
                    .total_duration_ms(),
            },
            interrupt_policy: SidecarInterruptPolicy::FinishStep,
            completion_behavior: SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
            timeout_ms: PRESET_BEHAVIOR_STEP_TIMEOUT_MS,
        },
    )
}

pub(super) fn native_pet_start_preset_behavior_execute_step(
    active_step_state: &RefCell<Option<NativePetActiveStepState>>,
    animations: &NativePetAnimationSet,
    playback: &mut NativePetAnimationPlayback,
    requested_animation: &Cell<NativePetRequestedAnimationState>,
    animation: NativePetAnimationTarget,
    idle_target: NativePetAnimationTarget,
    interaction_id: &str,
) -> ExecuteStepRequest {
    let request =
        native_pet_preset_behavior_execute_step_request(animation, interaction_id, animations);
    requested_animation.set(native_pet_requested_animation_for_control_animation(
        animations,
        animation,
        idle_target,
    ));
    playback.restart_animation_target(animation);
    active_step_state.replace(Some(native_pet_start_active_step_for_execute_step(
        &request,
    )));
    request
}

fn native_pet_preset_behavior_step_id(interaction_id: &str, animation_key: &str) -> String {
    let interaction_suffix = interaction_id
        .strip_prefix("interaction_")
        .unwrap_or(interaction_id);
    format!("step_{interaction_suffix}_{animation_key}")
}

fn native_pet_throw_after_drag_finish_target(
    registry: &ActionRegistry,
    animations: &NativePetAnimationSet,
    finish: NativePetThrowAfterDragFinish,
) -> BuddyResult<NativePetAnimationTarget> {
    native_pet_action_target_from_registry(registry, animations, finish.action_id())
}

#[cfg(test)]
#[path = "__tests__/preset_behavior.rs"]
mod tests;
