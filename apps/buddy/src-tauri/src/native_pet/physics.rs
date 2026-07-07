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
        let raw_window_position = raw_position.round_to_window_position();
        let clamped_window_position = clamp_position(raw_window_position);
        let hit_position_clamp = clamped_window_position != raw_window_position;

        self.position = NativePetLogicalPoint::from_position(clamped_window_position);
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
    dt_seconds.clamp(0.0, params.max_dt_seconds)
}

#[cfg(test)]
mod tests {
    use super::{native_pet_clamped_dt_seconds, NativePetInertiaState, NativePetPhysicsPhase};
    use crate::native_pet::{
        coordinates::{NativePetLogicalVelocity, NativePetPosition},
        physics_params::NativePetPhysicsParams,
    };

    #[test]
    fn low_speed_release_skips_inertia() {
        let params = NativePetPhysicsParams::default();
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 40.0, y: 0.0 },
            &params,
        );

        assert!(inertia.is_none());
    }

    #[test]
    fn short_release_skips_inertia_to_avoid_single_frame_run_flash() {
        let params = NativePetPhysicsParams::default();
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 300.0, y: 0.0 },
            &params,
        );

        assert!(inertia.is_none());
    }

    #[test]
    fn high_speed_release_enters_inertia() {
        let params = NativePetPhysicsParams::default();
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity {
                x: 600.0,
                y: -200.0,
            },
            &params,
        )
        .expect("high speed release should enter inertia");

        assert_eq!(
            inertia.velocity(),
            NativePetLogicalVelocity {
                x: 600.0,
                y: -200.0
            }
        );
    }

    #[test]
    fn vertical_release_skips_inertia_without_directional_gait() {
        let params = NativePetPhysicsParams::default();
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 40.0, y: -900.0 },
            &params,
        );

        assert!(inertia.is_none());
    }

    #[test]
    fn vertical_dominant_release_skips_inertia_even_with_some_horizontal_speed() {
        let params = NativePetPhysicsParams::default();
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity {
                x: 220.0,
                y: -900.0,
            },
            &params,
        );

        assert!(inertia.is_none());
    }

    #[test]
    fn clamps_dt_before_advancing_inertia() {
        let params = NativePetPhysicsParams::default();
        let mut inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 600.0, y: 0.0 },
            &params,
        )
        .expect("release should enter inertia");

        let step = inertia.step(0.5, &params, |position| position);

        assert_eq!(step.clamped_dt_seconds, params.max_dt_seconds);
        assert!(step.position.x < 100 + (params.max_velocity_logical_px_per_s * 0.5) as i32);
    }

    #[test]
    fn damping_reduces_velocity_every_step() {
        let params = NativePetPhysicsParams::default();
        let mut inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 900.0, y: 0.0 },
            &params,
        )
        .expect("release should enter inertia");

        let first = inertia.step(0.016, &params, |position| position);
        let second = inertia.step(0.016, &params, |position| position);

        assert!(first.velocity.x < 900.0);
        assert!(second.velocity.x < first.velocity.x);
    }

    #[test]
    fn position_clamp_ends_inertia_without_flying_offscreen() {
        let params = NativePetPhysicsParams::default();
        let mut inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            NativePetLogicalVelocity { x: 1600.0, y: 0.0 },
            &params,
        )
        .expect("release should enter inertia");

        let step = inertia.step(0.016, &params, |_| NativePetPosition { x: 120, y: 200 });

        assert!(step.hit_position_clamp);
        assert_eq!(step.position, NativePetPosition { x: 120, y: 200 });
        assert_eq!(step.phase, NativePetPhysicsPhase::Idle);
    }

    #[test]
    fn clamps_large_dt_even_without_active_motion() {
        let params = NativePetPhysicsParams::default();
        assert_eq!(
            native_pet_clamped_dt_seconds(1.0, &params),
            params.max_dt_seconds
        );
        assert_eq!(native_pet_clamped_dt_seconds(-1.0, &params), 0.0);
    }
}
