use std::cell::Cell;

use gdk::prelude::*;

use super::{
    animation::NativePetAnimationPlayback,
    bounds::native_pet_runtime_resolve_window_placement,
    coordinates::NativePetLogicalSize,
    drag_motion::NativePetDragMotionState,
    drag_state::{
        NativePetDragFrameUpdate, NativePetDragPhase, NativePetDragRelease,
        NativePetDragStateMachine,
    },
    geometry::NativePetFacing,
    lifecycle::NativePetMovementActionTargets,
    physics_params::NativePetPhysicsParams,
    window_movement::NativePetWindowMovementAdapter,
};

#[derive(Debug, Clone)]
pub(super) struct NativePetDragRuntimeState {
    grabbed_seat: Option<gdk::Seat>,
    motion: NativePetDragMotionState,
}

pub(super) struct NativePetDragCommitContext<'a, 'b> {
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) movement_action_targets: &'a NativePetMovementActionTargets,
    pub(super) pet_facing: &'a Cell<NativePetFacing>,
    pub(super) movement_adapter: &'a NativePetWindowMovementAdapter<'b>,
    pub(super) window_size: NativePetLogicalSize,
    pub(super) drag_debug: bool,
}

impl NativePetDragRuntimeState {
    pub(super) fn begin(
        drawing_area: &gtk::DrawingArea,
        event: &gdk::EventButton,
        machine: NativePetDragStateMachine,
    ) -> Self {
        Self {
            grabbed_seat: native_pet_grab_pointer(drawing_area, event),
            motion: NativePetDragMotionState::new(machine),
        }
    }

    pub(super) fn grab_offset(&self) -> super::coordinates::NativePetLogicalOffset {
        self.motion.grab_offset()
    }

    pub(super) fn motion_mut(&mut self) -> &mut NativePetDragMotionState {
        &mut self.motion
    }

    pub(super) fn phase(&self) -> super::drag_state::NativePetDragPhase {
        self.motion.phase()
    }

    pub(super) fn release(self, physics_params: &NativePetPhysicsParams) -> NativePetDragRelease {
        let Self {
            grabbed_seat,
            motion,
        } = self;
        if let Some(seat) = grabbed_seat {
            seat.ungrab();
        }

        motion.release(physics_params)
    }
}

pub(super) fn native_pet_commit_drag_update(
    state: &mut NativePetDragRuntimeState,
    update: NativePetDragFrameUpdate,
    context: NativePetDragCommitContext<'_, '_>,
) {
    if update.movement_dx.abs() > 1.0 {
        context.pet_facing.set(if update.movement_dx > 0.0 {
            NativePetFacing::Right
        } else {
            NativePetFacing::Left
        });
    }

    if matches!(update.phase, NativePetDragPhase::Dragging) {
        context
            .playback
            .set_animation_target(context.movement_action_targets.drag());
        let cursor_position = state.motion.latest_cursor_position();
        let bounds = native_pet_runtime_resolve_window_placement(
            update.position,
            context.window_size,
            Some(cursor_position),
        );
        context.movement_adapter.move_to(bounds.placement);
        if context.drag_debug {
            eprintln!(
                "native-pet-drag-debug frame cursor=({:.1},{:.1}) dx={:.1} distance={:.1} position=({}, {}) monitor={:?} visibility={:?}",
                cursor_position.x,
                cursor_position.y,
                update.movement_dx,
                update.distance,
                bounds.placement.position.x,
                bounds.placement.position.y,
                bounds.placement.monitor_index,
                bounds.visibility,
            );
        }
    } else if context.drag_debug {
        let cursor_position = state.motion.latest_cursor_position();
        eprintln!(
            "native-pet-drag-debug frame cursor=({:.1},{:.1}) dx={:.1} distance={:.1} pending",
            cursor_position.x, cursor_position.y, update.movement_dx, update.distance
        );
    }
}

fn native_pet_grab_pointer(
    drawing_area: &gtk::DrawingArea,
    event: &gdk::EventButton,
) -> Option<gdk::Seat> {
    let seat = event.device().and_then(|device| device.seat())?;
    let window = gtk::prelude::WidgetExt::window(drawing_area)?;
    let status = seat.grab(
        &window,
        gdk::SeatCapabilities::POINTER,
        false,
        None,
        None,
        None,
    );

    if status == gdk::GrabStatus::Success {
        Some(seat)
    } else {
        None
    }
}
