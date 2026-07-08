use super::{
    animation::NativePetAnimationName, coordinates::NativePetLogicalVelocity,
    geometry::NativePetFacing, lifecycle::native_pet_animation_for_velocity,
    physics_params::NativePetPhysicsParams,
};

const NATIVE_PET_EDGE_RUNOUT_MIN_MS: u64 = 260;
const NATIVE_PET_EDGE_RUNOUT_MAX_MS: u64 = 420;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetEdgeRunoutState {
    animation: NativePetAnimationName,
    finish_animation: NativePetAnimationName,
    remaining_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetEdgeRunoutStep {
    pub(super) animation: NativePetAnimationName,
    pub(super) next_state: Option<NativePetEdgeRunoutState>,
}

pub(super) fn native_pet_edge_runout_after_inertia_step(
    hit_position_clamp: bool,
    facing: NativePetFacing,
    impact_velocity: NativePetLogicalVelocity,
    finish_animation: NativePetAnimationName,
    physics_params: &NativePetPhysicsParams,
) -> Option<NativePetEdgeRunoutState> {
    if !hit_position_clamp {
        return None;
    }

    Some(NativePetEdgeRunoutState {
        animation: native_pet_animation_for_velocity(impact_velocity, facing),
        finish_animation,
        remaining_ms: native_pet_edge_runout_duration_ms(impact_velocity, physics_params),
    })
}

fn native_pet_edge_runout_duration_ms(
    impact_velocity: NativePetLogicalVelocity,
    physics_params: &NativePetPhysicsParams,
) -> u64 {
    let speed_ratio =
        (impact_velocity.x.abs() / physics_params.max_velocity_logical_px_per_s).clamp(0.0, 1.0);
    let duration_ms = NATIVE_PET_EDGE_RUNOUT_MIN_MS as f64
        + (NATIVE_PET_EDGE_RUNOUT_MAX_MS - NATIVE_PET_EDGE_RUNOUT_MIN_MS) as f64 * speed_ratio;

    duration_ms.round() as u64
}

pub(super) fn native_pet_advance_edge_runout(
    state: NativePetEdgeRunoutState,
    elapsed_ms: u64,
) -> NativePetEdgeRunoutStep {
    if elapsed_ms >= state.remaining_ms {
        return NativePetEdgeRunoutStep {
            animation: state.finish_animation,
            next_state: None,
        };
    }

    NativePetEdgeRunoutStep {
        animation: state.animation,
        next_state: Some(NativePetEdgeRunoutState {
            animation: state.animation,
            finish_animation: state.finish_animation,
            remaining_ms: state.remaining_ms - elapsed_ms,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_directional_runout_when_inertia_hits_bounds() {
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Left,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            NativePetAnimationName::TripFallLeft,
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, NativePetAnimationName::RunLeft);
        assert_eq!(
            runout.finish_animation,
            NativePetAnimationName::TripFallLeft
        );
        assert!(runout.remaining_ms >= NATIVE_PET_EDGE_RUNOUT_MIN_MS);
        assert!(runout.remaining_ms <= NATIVE_PET_EDGE_RUNOUT_MAX_MS);
    }

    #[test]
    fn duration_scales_with_impact_speed() {
        let params = NativePetPhysicsParams::default();
        let gentle = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 420.0, y: 0.0 },
            NativePetAnimationName::Idle,
            &params,
        )
        .expect("gentle edge runout");
        let fast = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 1800.0, y: 0.0 },
            NativePetAnimationName::Idle,
            &params,
        )
        .expect("fast edge runout");

        let midpoint_ms = (NATIVE_PET_EDGE_RUNOUT_MIN_MS + NATIVE_PET_EDGE_RUNOUT_MAX_MS) / 2;

        assert!(gentle.remaining_ms < midpoint_ms);
        assert!(fast.remaining_ms > midpoint_ms);
    }

    #[test]
    fn prefers_impact_velocity_direction_over_stale_facing() {
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            NativePetAnimationName::StumbleRecoverLeft,
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, NativePetAnimationName::RunLeft);
    }

    #[test]
    fn holds_running_animation_before_finish_animation() {
        let runout = NativePetEdgeRunoutState {
            animation: NativePetAnimationName::RunRight,
            finish_animation: NativePetAnimationName::StumbleRecoverRight,
            remaining_ms: NATIVE_PET_EDGE_RUNOUT_MAX_MS,
        };

        let running = native_pet_advance_edge_runout(runout, 120);
        assert_eq!(running.animation, NativePetAnimationName::RunRight);
        assert!(running.next_state.is_some());

        let landing =
            native_pet_advance_edge_runout(running.next_state.expect("remaining runout"), 1_000);
        assert_eq!(
            landing.animation,
            NativePetAnimationName::StumbleRecoverRight
        );
        assert!(landing.next_state.is_none());
    }
}
