use super::{
    coordinates::{NativePetLogicalPoint, NativePetLogicalVelocity, NativePetPosition},
    physics_params::NativePetPhysicsParams,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetPhysicsPhase {
    Idle,
    Inertia,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetPhysicsStep {
    pub(super) clamped_dt_seconds: f64,
    pub(super) hit_position_clamp: bool,
    pub(super) phase: NativePetPhysicsPhase,
    pub(super) position: NativePetPosition,
    pub(super) velocity: NativePetLogicalVelocity,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetInertiaState {
    position: NativePetLogicalPoint,
    window_position: NativePetPosition,
    velocity: NativePetLogicalVelocity,
}

impl NativePetInertiaState {
    pub(super) fn from_release(
        position: NativePetPosition,
        release_velocity: NativePetLogicalVelocity,
        params: &NativePetPhysicsParams,
    ) -> Option<Self> {
        let velocity = release_velocity.clamp_speed(params.max_velocity_logical_px_per_s);
        if velocity.speed() < params.min_inertia_velocity_logical_px_per_s {
            return None;
        }
        if velocity.x.abs() < params.min_inertia_velocity_logical_px_per_s {
            return None;
        }
        if velocity.x.abs() < velocity.y.abs() {
            return None;
        }

        Some(Self {
            position: NativePetLogicalPoint::from_position(position),
            window_position: position,
            velocity,
        })
    }

    pub(super) fn velocity(self) -> NativePetLogicalVelocity {
        self.velocity
    }

    pub(super) fn step(
        &mut self,
        dt_seconds: f64,
        params: &NativePetPhysicsParams,
        clamp_position: impl Fn(NativePetPosition) -> NativePetPosition,
    ) -> NativePetPhysicsStep {
        let clamped_dt_seconds = native_pet_clamped_dt_seconds(dt_seconds, params);
        let damping_factor = (-params.damping_per_second * clamped_dt_seconds).exp();
        let next_velocity = self.velocity.scaled(damping_factor);
        let average_velocity = NativePetLogicalVelocity {
            x: (self.velocity.x + next_velocity.x) * 0.5,
            y: (self.velocity.y + next_velocity.y) * 0.5,
        };
        let raw_position = NativePetLogicalPoint::new(
            self.position.x + average_velocity.x * clamped_dt_seconds,
            self.position.y + average_velocity.y * clamped_dt_seconds,
        );
        let Some(raw_window_position) = raw_position.round_to_window_position() else {
            self.velocity = NativePetLogicalVelocity::default();
            return NativePetPhysicsStep {
                clamped_dt_seconds,
                hit_position_clamp: true,
                phase: NativePetPhysicsPhase::Idle,
                position: self.window_position,
                velocity: self.velocity,
            };
        };
        let clamped_window_position = clamp_position(raw_window_position);
        let hit_position_clamp = clamped_window_position != raw_window_position;

        self.position = NativePetLogicalPoint::from_position(clamped_window_position);
        self.window_position = clamped_window_position;
        self.velocity = if hit_position_clamp
            || next_velocity.speed() < params.stop_velocity_threshold_logical_px_per_s
        {
            NativePetLogicalVelocity::default()
        } else {
            next_velocity
        };

        let phase = if self.velocity.speed() > 0.0 {
            NativePetPhysicsPhase::Inertia
        } else {
            NativePetPhysicsPhase::Idle
        };

        NativePetPhysicsStep {
            clamped_dt_seconds,
            hit_position_clamp,
            phase,
            position: clamped_window_position,
            velocity: self.velocity,
        }
    }
}

pub(super) fn native_pet_clamped_dt_seconds(
    dt_seconds: f64,
    params: &NativePetPhysicsParams,
) -> f64 {
    if !dt_seconds.is_finite() {
        return 0.0;
    }

    let max_dt_seconds = if params.max_dt_seconds.is_finite() && params.max_dt_seconds > 0.0 {
        params.max_dt_seconds
    } else {
        0.0
    };

    dt_seconds.clamp(0.0, max_dt_seconds)
}

#[cfg(test)]
#[path = "__tests__/physics.rs"]
mod tests;
