use crate::{action_registry::ActionRegistry, error::BuddyResult};

use super::super::{
    animation::{NativePetAnimationSet, NativePetAnimationTarget},
    assets::native_pet_action_target_from_registry,
};

const LIFECYCLE_IDLE_ACTION_ID: &str = "idle";
const LIFECYCLE_WAKE_ACTION_ID: &str = "wake";
const LIFECYCLE_SLEEP_ENTER_ACTION_ID: &str = "sleep_enter";
const LIFECYCLE_SLEEP_ACTION_ID: &str = "sleep";
const LIFECYCLE_HOVER_ACTION_ID: &str = "hover";
const LIFECYCLE_CELEBRATE_ACTION_ID: &str = "celebrate";
const LIFECYCLE_REASSURE_ACTION_ID: &str = "reassure";
const LIFECYCLE_CURIOUS_ACTION_ID: &str = "curious";
const LIFECYCLE_EXPLAIN_ACTION_ID: &str = "explain";
const MOVEMENT_IDLE_ACTION_ID: &str = "idle";
const MOVEMENT_TAP_ACTION_ID: &str = "tap";
const MOVEMENT_GRAB_START_ACTION_ID: &str = "grab_start";
const MOVEMENT_DRAG_ACTION_ID: &str = "drag";
const MOVEMENT_RUN_LEFT_ACTION_ID: &str = "run.left";
const MOVEMENT_RUN_RIGHT_ACTION_ID: &str = "run.right";
const FALLEN_GET_UP_LEFT_ACTION_ID: &str = "throw_after_drag.get_up.left";
const FALLEN_GET_UP_RIGHT_ACTION_ID: &str = "throw_after_drag.get_up.right";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetLifecycleActionTargets {
    idle: NativePetAnimationTarget,
    wake: NativePetAnimationTarget,
    sleep_enter: NativePetAnimationTarget,
    sleep: NativePetAnimationTarget,
    hover: NativePetAnimationTarget,
    celebrate: NativePetAnimationTarget,
    reassure: NativePetAnimationTarget,
    curious: NativePetAnimationTarget,
    explain: NativePetAnimationTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetMovementActionTargets {
    idle: NativePetAnimationTarget,
    tap: NativePetAnimationTarget,
    grab_start: NativePetAnimationTarget,
    drag: NativePetAnimationTarget,
    run_left: NativePetAnimationTarget,
    run_right: NativePetAnimationTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetFallenGetUpActionTargets {
    left: NativePetAnimationTarget,
    right: NativePetAnimationTarget,
}

impl NativePetLifecycleActionTargets {
    pub(in crate::native_pet) fn load_bundled(
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        let registry = ActionRegistry::load_bundled()?;
        Self::load(&registry, animations)
    }

    pub(in crate::native_pet) fn load(
        registry: &ActionRegistry,
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        Ok(Self {
            idle: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_IDLE_ACTION_ID,
            )?,
            wake: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_WAKE_ACTION_ID,
            )?,
            sleep_enter: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_SLEEP_ENTER_ACTION_ID,
            )?,
            sleep: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_SLEEP_ACTION_ID,
            )?,
            hover: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_HOVER_ACTION_ID,
            )?,
            celebrate: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_CELEBRATE_ACTION_ID,
            )?,
            reassure: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_REASSURE_ACTION_ID,
            )?,
            curious: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_CURIOUS_ACTION_ID,
            )?,
            explain: native_pet_lifecycle_action_target(
                registry,
                animations,
                LIFECYCLE_EXPLAIN_ACTION_ID,
            )?,
        })
    }

    pub(in crate::native_pet) fn idle(self) -> NativePetAnimationTarget {
        self.idle
    }

    pub(in crate::native_pet) fn wake(self) -> NativePetAnimationTarget {
        self.wake
    }

    pub(in crate::native_pet) fn sleep_enter(self) -> NativePetAnimationTarget {
        self.sleep_enter
    }

    pub(in crate::native_pet) fn sleep(self) -> NativePetAnimationTarget {
        self.sleep
    }

    pub(in crate::native_pet) fn hover(self) -> NativePetAnimationTarget {
        self.hover
    }

    pub(in crate::native_pet) fn celebrate(self) -> NativePetAnimationTarget {
        self.celebrate
    }

    pub(in crate::native_pet) fn reassure(self) -> NativePetAnimationTarget {
        self.reassure
    }

    pub(in crate::native_pet) fn curious(self) -> NativePetAnimationTarget {
        self.curious
    }

    pub(in crate::native_pet) fn explain(self) -> NativePetAnimationTarget {
        self.explain
    }

    #[cfg(test)]
    pub(super) fn with_sleep_target(self, sleep: NativePetAnimationTarget) -> Self {
        Self { sleep, ..self }
    }
}

impl NativePetFallenGetUpActionTargets {
    pub(in crate::native_pet) fn load_bundled(
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        let registry = ActionRegistry::load_bundled()?;
        Self::load(&registry, animations)
    }

    pub(in crate::native_pet) fn load(
        registry: &ActionRegistry,
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        Ok(Self {
            left: native_pet_action_target_from_registry(
                registry,
                animations,
                FALLEN_GET_UP_LEFT_ACTION_ID,
            )?,
            right: native_pet_action_target_from_registry(
                registry,
                animations,
                FALLEN_GET_UP_RIGHT_ACTION_ID,
            )?,
        })
    }

    pub(in crate::native_pet) fn left(self) -> NativePetAnimationTarget {
        self.left
    }

    pub(in crate::native_pet) fn right(self) -> NativePetAnimationTarget {
        self.right
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn with_left_target(self, left: NativePetAnimationTarget) -> Self {
        Self { left, ..self }
    }
}

impl NativePetMovementActionTargets {
    pub(in crate::native_pet) fn load_bundled(
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        let registry = ActionRegistry::load_bundled()?;
        Self::load(&registry, animations)
    }

    pub(in crate::native_pet) fn load(
        registry: &ActionRegistry,
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        Ok(Self {
            idle: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_IDLE_ACTION_ID,
            )?,
            tap: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_TAP_ACTION_ID,
            )?,
            grab_start: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_GRAB_START_ACTION_ID,
            )?,
            drag: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_DRAG_ACTION_ID,
            )?,
            run_left: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_RUN_LEFT_ACTION_ID,
            )?,
            run_right: native_pet_action_target_from_registry(
                registry,
                animations,
                MOVEMENT_RUN_RIGHT_ACTION_ID,
            )?,
        })
    }

    pub(in crate::native_pet) fn idle(self) -> NativePetAnimationTarget {
        self.idle
    }

    pub(in crate::native_pet) fn tap(self) -> NativePetAnimationTarget {
        self.tap
    }

    pub(in crate::native_pet) fn grab_start(self) -> NativePetAnimationTarget {
        self.grab_start
    }

    pub(in crate::native_pet) fn drag(self) -> NativePetAnimationTarget {
        self.drag
    }

    pub(in crate::native_pet) fn run_left(self) -> NativePetAnimationTarget {
        self.run_left
    }

    pub(in crate::native_pet) fn run_right(self) -> NativePetAnimationTarget {
        self.run_right
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn with_run_targets(
        self,
        run_left: NativePetAnimationTarget,
        run_right: NativePetAnimationTarget,
    ) -> Self {
        Self {
            run_left,
            run_right,
            ..self
        }
    }
}

fn native_pet_lifecycle_action_target(
    registry: &ActionRegistry,
    animations: &NativePetAnimationSet,
    action_id: &str,
) -> BuddyResult<NativePetAnimationTarget> {
    native_pet_action_target_from_registry(registry, animations, action_id)
}
