use super::{
    animation::NativePetAnimationTarget,
    coordinates::NativePetLogicalVelocity,
    geometry::NativePetFacing,
    lifecycle::{native_pet_animation_for_velocity, NativePetMovementActionTargets},
    physics_params::NativePetPhysicsParams,
};

const NATIVE_PET_EDGE_RUNOUT_MIN_MS: u64 = 260;
const NATIVE_PET_EDGE_RUNOUT_MAX_MS: u64 = 420;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetEdgeRunoutState {
    animation: NativePetAnimationTarget,
    finish_animation: NativePetAnimationTarget,
    pub(super) preset_behavior_interaction_uuid: uuid::Uuid,
    remaining_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetEdgeRunoutStep {
    pub(super) animation: NativePetAnimationTarget,
    pub(super) next_state: Option<NativePetEdgeRunoutState>,
}

pub(super) fn native_pet_edge_runout_after_inertia_step(
    movement_action_targets: &NativePetMovementActionTargets,
    hit_position_clamp: bool,
    facing: NativePetFacing,
    impact_velocity: NativePetLogicalVelocity,
    finish_animation: NativePetAnimationTarget,
    preset_behavior_interaction_uuid: uuid::Uuid,
    physics_params: &NativePetPhysicsParams,
) -> Option<NativePetEdgeRunoutState> {
    if !hit_position_clamp {
        return None;
    }

    Some(NativePetEdgeRunoutState {
        animation: native_pet_animation_for_velocity(
            movement_action_targets,
            impact_velocity,
            facing,
        ),
        finish_animation,
        preset_behavior_interaction_uuid,
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
            preset_behavior_interaction_uuid: state.preset_behavior_interaction_uuid,
            remaining_ms: state.remaining_ms - elapsed_ms,
        }),
    }
}

#[cfg(test)]
#[path = "__tests__/edge_runout.rs"]
mod tests;
