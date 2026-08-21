use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use crate::error::BuddyResult;

use super::{
    animation::{
        NativePetAnimationPlayback, NativePetAnimationSet, NativePetRequestedAnimationState,
    },
    drag_runtime::NativePetDragRuntimeState,
    edge_runout::NativePetEdgeRunoutState,
    geometry::NativePetFacing,
    lifecycle::{
        native_pet_initial_animation, native_pet_initial_idle_presence_schedule_seed,
        native_pet_initial_throw_outcome_seed, NativePetLifecycleActionTargets,
        NativePetMovementActionTargets,
    },
    physics::NativePetInertiaState,
    physics_params::NativePetPhysicsParams,
    pointer_interaction::NativePetOpenChatClick,
    preset_behavior::NativePetFallenRecoveryState,
    process::{create_native_pet_control_channel, NativePetControlRequest},
    scripted_walk::NativePetScriptedWalkState,
    step_runtime::NativePetActiveStepState,
};

#[derive(Clone)]
pub(super) struct NativePetRuntimeState {
    pub(super) animation_playback: Rc<Cell<NativePetAnimationPlayback>>,
    pub(super) active_step_state: Rc<RefCell<Option<NativePetActiveStepState>>>,
    pub(super) control_messages: Rc<std::sync::mpsc::Receiver<NativePetControlRequest>>,
    pub(super) drag_state: Rc<RefCell<Option<NativePetDragRuntimeState>>>,
    pub(super) edge_runout_state: Rc<Cell<Option<NativePetEdgeRunoutState>>>,
    pub(super) fallen_preset_behavior_recovery_state:
        Rc<RefCell<Option<NativePetFallenRecoveryState>>>,
    pub(super) idle_lifecycle_elapsed_ms: Rc<Cell<u64>>,
    pub(super) idle_presence_schedule_seed: Rc<Cell<u64>>,
    pub(super) inertia_state: Rc<RefCell<Option<NativePetInertiaState>>>,
    pub(super) lifecycle_action_targets: Rc<NativePetLifecycleActionTargets>,
    pub(super) movement_action_targets: Rc<NativePetMovementActionTargets>,
    pub(super) open_chat_click: Rc<Cell<Option<NativePetOpenChatClick>>>,
    pub(super) pet_animations: Rc<NativePetAnimationSet>,
    pub(super) pet_facing: Rc<Cell<NativePetFacing>>,
    pub(super) physics_params: Rc<NativePetPhysicsParams>,
    pub(super) pointer_hovered: Rc<Cell<bool>>,
    pub(super) requested_animation: Rc<Cell<NativePetRequestedAnimationState>>,
    pub(super) scripted_walk_state: Rc<RefCell<Option<NativePetScriptedWalkState>>>,
    pub(super) task_presence_elapsed_ms: Rc<Cell<u64>>,
    pub(super) throw_outcome_seed: Rc<Cell<u64>>,
}

impl NativePetRuntimeState {
    pub(super) fn new(pet_animations: Rc<NativePetAnimationSet>) -> BuddyResult<Self> {
        Self::with_control_messages(pet_animations, create_native_pet_control_channel()?)
    }

    fn with_control_messages(
        pet_animations: Rc<NativePetAnimationSet>,
        control_messages: std::sync::mpsc::Receiver<NativePetControlRequest>,
    ) -> BuddyResult<Self> {
        let lifecycle_action_targets = Rc::new(NativePetLifecycleActionTargets::load_bundled(
            pet_animations.as_ref(),
        )?);
        let movement_action_targets = Rc::new(NativePetMovementActionTargets::load_bundled(
            pet_animations.as_ref(),
        )?);
        let initial_animation = native_pet_initial_animation(lifecycle_action_targets.as_ref());
        let requested_idle_animation =
            NativePetRequestedAnimationState::from(lifecycle_action_targets.as_ref().idle());

        Ok(Self {
            animation_playback: Rc::new(Cell::new(NativePetAnimationPlayback::from_target(
                initial_animation,
            ))),
            active_step_state: Rc::new(RefCell::new(None)),
            control_messages: Rc::new(control_messages),
            drag_state: Rc::new(RefCell::new(None)),
            edge_runout_state: Rc::new(Cell::new(None)),
            fallen_preset_behavior_recovery_state: Rc::new(RefCell::new(None)),
            idle_lifecycle_elapsed_ms: Rc::new(Cell::new(0)),
            idle_presence_schedule_seed: Rc::new(Cell::new(
                native_pet_initial_idle_presence_schedule_seed(),
            )),
            inertia_state: Rc::new(RefCell::new(None)),
            lifecycle_action_targets,
            movement_action_targets,
            open_chat_click: Rc::new(Cell::new(None)),
            pet_animations,
            pet_facing: Rc::new(Cell::new(NativePetFacing::Left)),
            physics_params: Rc::new(NativePetPhysicsParams::default()),
            pointer_hovered: Rc::new(Cell::new(false)),
            requested_animation: Rc::new(Cell::new(requested_idle_animation)),
            scripted_walk_state: Rc::new(RefCell::new(None)),
            task_presence_elapsed_ms: Rc::new(Cell::new(0)),
            throw_outcome_seed: Rc::new(Cell::new(native_pet_initial_throw_outcome_seed())),
        })
    }
}
