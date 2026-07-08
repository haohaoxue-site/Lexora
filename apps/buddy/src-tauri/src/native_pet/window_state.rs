use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use crate::error::BuddyResult;

use super::{
    animation::{NativePetAnimationName, NativePetAnimationPlayback, NativePetAnimationSet},
    assets::load_default_pet_animation_set,
    drag_runtime::NativePetDragRuntimeState,
    edge_runout::NativePetEdgeRunoutState,
    geometry::NativePetFacing,
    lifecycle::{
        native_pet_initial_animation, native_pet_initial_idle_presence_schedule_seed,
        native_pet_initial_throw_outcome_seed,
    },
    physics::NativePetInertiaState,
    physics_params::NativePetPhysicsParams,
    pointer_interaction::NativePetOpenChatClick,
    process::{create_native_pet_control_channel, NativePetControlRequest},
    scripted_walk::NativePetScriptedWalkState,
};

#[derive(Clone)]
pub(super) struct NativePetRuntimeState {
    pub(super) animation_playback: Rc<Cell<NativePetAnimationPlayback>>,
    pub(super) control_messages: Rc<std::sync::mpsc::Receiver<NativePetControlRequest>>,
    pub(super) drag_state: Rc<RefCell<Option<NativePetDragRuntimeState>>>,
    pub(super) edge_runout_state: Rc<Cell<Option<NativePetEdgeRunoutState>>>,
    pub(super) idle_lifecycle_elapsed_ms: Rc<Cell<u64>>,
    pub(super) idle_presence_schedule_seed: Rc<Cell<u64>>,
    pub(super) inertia_state: Rc<RefCell<Option<NativePetInertiaState>>>,
    pub(super) open_chat_click: Rc<Cell<Option<NativePetOpenChatClick>>>,
    pub(super) pet_animations: Rc<NativePetAnimationSet>,
    pub(super) pet_facing: Rc<Cell<NativePetFacing>>,
    pub(super) physics_params: Rc<NativePetPhysicsParams>,
    pub(super) pointer_hovered: Rc<Cell<bool>>,
    pub(super) requested_animation: Rc<Cell<NativePetAnimationName>>,
    pub(super) scripted_walk_state: Rc<RefCell<Option<NativePetScriptedWalkState>>>,
    pub(super) task_presence_elapsed_ms: Rc<Cell<u64>>,
    pub(super) throw_outcome_seed: Rc<Cell<u64>>,
}

impl NativePetRuntimeState {
    pub(super) fn new() -> BuddyResult<Self> {
        Ok(Self {
            animation_playback: Rc::new(Cell::new(NativePetAnimationPlayback::new(
                native_pet_initial_animation(),
            ))),
            control_messages: Rc::new(create_native_pet_control_channel()),
            drag_state: Rc::new(RefCell::new(None)),
            edge_runout_state: Rc::new(Cell::new(None)),
            idle_lifecycle_elapsed_ms: Rc::new(Cell::new(0)),
            idle_presence_schedule_seed: Rc::new(Cell::new(
                native_pet_initial_idle_presence_schedule_seed(),
            )),
            inertia_state: Rc::new(RefCell::new(None)),
            open_chat_click: Rc::new(Cell::new(None)),
            pet_animations: Rc::new(load_default_pet_animation_set()?),
            pet_facing: Rc::new(Cell::new(NativePetFacing::Left)),
            physics_params: Rc::new(NativePetPhysicsParams::default()),
            pointer_hovered: Rc::new(Cell::new(false)),
            requested_animation: Rc::new(Cell::new(NativePetAnimationName::Idle)),
            scripted_walk_state: Rc::new(RefCell::new(None)),
            task_presence_elapsed_ms: Rc::new(Cell::new(0)),
            throw_outcome_seed: Rc::new(Cell::new(native_pet_initial_throw_outcome_seed())),
        })
    }
}
