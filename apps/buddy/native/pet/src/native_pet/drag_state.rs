#[cfg(test)]
use super::coordinates::native_pet_grab_offset;
use super::{
    coordinates::{
        native_pet_position_from_cursor_offset, NativePetLogicalOffset, NativePetLogicalPoint,
        NativePetLogicalVelocity, NativePetPosition,
    },
    physics_params::NativePetPhysicsParams,
    pointer_samples::{NativePetPointerSample, NativePetPointerSamples},
};

pub(super) const PET_DRAG_START_DISTANCE: f64 = 4.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetDragPhase {
    Idle,
    Pressed,
    Dragging,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetDragFrameUpdate {
    pub(super) distance: f64,
    pub(super) movement_dx: f64,
    pub(super) phase: NativePetDragPhase,
    pub(super) position: NativePetPosition,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetDragRelease {
    pub(super) last_cursor_position: NativePetLogicalPoint,
    pub(super) phase_before_release: NativePetDragPhase,
    pub(super) release_velocity: NativePetLogicalVelocity,
}

impl NativePetDragRelease {
    pub(super) fn was_dragging(self) -> bool {
        matches!(self.phase_before_release, NativePetDragPhase::Dragging)
    }
}

#[derive(Debug, Clone)]
pub(super) struct NativePetDragStateMachine {
    dirty: bool,
    event_pointer_samples: NativePetPointerSamples,
    grab_offset: NativePetLogicalOffset,
    latest_event_time_ms: u64,
    latest_cursor_position: NativePetLogicalPoint,
    phase: NativePetDragPhase,
    press_cursor_position: NativePetLogicalPoint,
    submitted_cursor_position: NativePetLogicalPoint,
}

impl NativePetDragStateMachine {
    #[cfg(test)]
    pub(super) fn begin(
        origin_position: NativePetPosition,
        press_cursor_position: NativePetLogicalPoint,
        press_time_ms: u64,
    ) -> Self {
        Self::begin_with_grab_offset(
            press_cursor_position,
            native_pet_grab_offset(origin_position, press_cursor_position),
            press_time_ms,
        )
    }

    pub(super) fn begin_with_grab_offset(
        press_cursor_position: NativePetLogicalPoint,
        grab_offset: NativePetLogicalOffset,
        press_time_ms: u64,
    ) -> Self {
        Self {
            dirty: false,
            event_pointer_samples: NativePetPointerSamples::new(NativePetPointerSample {
                cursor_position: press_cursor_position,
                time_ms: press_time_ms,
            }),
            grab_offset,
            latest_event_time_ms: press_time_ms,
            latest_cursor_position: press_cursor_position,
            phase: NativePetDragPhase::Pressed,
            press_cursor_position,
            submitted_cursor_position: press_cursor_position,
        }
    }

    pub(super) fn grab_offset(&self) -> NativePetLogicalOffset {
        self.grab_offset
    }

    pub(super) fn latest_cursor_position(&self) -> NativePetLogicalPoint {
        self.latest_cursor_position
    }

    pub(super) fn phase(&self) -> NativePetDragPhase {
        self.phase
    }

    pub(super) fn record_pointer_sample(
        &mut self,
        cursor_position: NativePetLogicalPoint,
        time_ms: u64,
    ) {
        if !cursor_position.is_finite() {
            return;
        }

        if time_ms < self.latest_event_time_ms {
            return;
        }
        self.latest_event_time_ms = time_ms;

        let sample = NativePetPointerSample {
            cursor_position,
            time_ms,
        };
        self.event_pointer_samples.push(sample);

        if self.latest_cursor_position == cursor_position {
            return;
        }

        self.latest_cursor_position = cursor_position;
        self.dirty = true;
    }

    pub(super) fn take_frame_update(&mut self) -> Option<NativePetDragFrameUpdate> {
        if !self.dirty {
            return None;
        }

        self.dirty = false;
        let movement_dx = self.latest_cursor_position.x - self.submitted_cursor_position.x;
        let distance = self
            .press_cursor_position
            .distance_to(self.latest_cursor_position);
        if distance >= PET_DRAG_START_DISTANCE {
            self.phase = NativePetDragPhase::Dragging;
        }
        let position =
            native_pet_position_from_cursor_offset(self.latest_cursor_position, self.grab_offset)?;
        self.submitted_cursor_position = self.latest_cursor_position;

        Some(NativePetDragFrameUpdate {
            distance,
            movement_dx,
            phase: self.phase,
            position,
        })
    }

    pub(super) fn flush_pointer_sample(
        &mut self,
        cursor_position: NativePetLogicalPoint,
        time_ms: u64,
    ) -> Option<NativePetDragFrameUpdate> {
        self.record_pointer_sample(cursor_position, time_ms);
        self.take_frame_update()
    }

    pub(super) fn release(self, physics_params: &NativePetPhysicsParams) -> NativePetDragRelease {
        NativePetDragRelease {
            last_cursor_position: self.latest_cursor_position,
            phase_before_release: self.phase,
            release_velocity: self.event_pointer_samples.release_velocity(physics_params),
        }
    }
}

#[cfg(test)]
#[path = "__tests__/drag_state.rs"]
mod tests;
