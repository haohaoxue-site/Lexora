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
mod tests {
    use super::*;
    use crate::native_pet::animation::{
        NativePetAnimationKey, NativePetAnimationSet, NativePetManifest,
    };
    use crate::native_pet::assets::load_default_pet_animation_set;

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn default_animations() -> NativePetAnimationSet {
        load_default_pet_animation_set().expect("default native pet animation set loads")
    }

    fn animation_target(
        animations: &NativePetAnimationSet,
        animation_key: &str,
    ) -> NativePetAnimationTarget {
        let key = NativePetAnimationKey::parse(animation_key).expect("valid animation key");
        animations
            .animation_target_for_key(&key)
            .expect("animation target exists")
    }

    fn movement_targets(animations: &NativePetAnimationSet) -> NativePetMovementActionTargets {
        NativePetMovementActionTargets::load_bundled(animations)
            .expect("movement targets resolve from registry")
    }

    #[test]
    fn starts_directional_runout_when_inertia_hits_bounds() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Left,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            animation_target(&animations, "trip_fall_left"),
            uuid::Uuid::nil(),
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, movement_targets.run_left());
        assert_eq!(
            runout.finish_animation,
            animation_target(&animations, "trip_fall_left")
        );
        assert!(runout.remaining_ms >= NATIVE_PET_EDGE_RUNOUT_MIN_MS);
        assert!(runout.remaining_ms <= NATIVE_PET_EDGE_RUNOUT_MAX_MS);
    }

    #[test]
    fn duration_scales_with_impact_speed() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let idle_target = animation_target(&animations, "idle");
        let params = NativePetPhysicsParams::default();
        let gentle = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 420.0, y: 0.0 },
            idle_target,
            uuid::Uuid::nil(),
            &params,
        )
        .expect("gentle edge runout");
        let fast = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 1800.0, y: 0.0 },
            idle_target,
            uuid::Uuid::nil(),
            &params,
        )
        .expect("fast edge runout");

        let midpoint_ms = (NATIVE_PET_EDGE_RUNOUT_MIN_MS + NATIVE_PET_EDGE_RUNOUT_MAX_MS) / 2;

        assert!(gentle.remaining_ms < midpoint_ms);
        assert!(fast.remaining_ms > midpoint_ms);
    }

    #[test]
    fn prefers_impact_velocity_direction_over_stale_facing() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            animation_target(&animations, "stumble_recover_left"),
            uuid::Uuid::nil(),
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, movement_targets.run_left());
    }

    #[test]
    fn supports_manifest_only_directional_runout_animation() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future edge run left",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_edge_run_left",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future edge run left");
        let animations = NativePetAnimationSet::from_manifest(manifest)
            .expect("manifest with future edge run left");
        let key = NativePetAnimationKey::parse("future_edge_run_left").expect("valid key");
        let run_left = animations
            .animation_target_for_key(&key)
            .expect("future edge run left target exists");
        let bundled_targets = movement_targets(&animations);
        let targets = bundled_targets.with_run_targets(run_left, bundled_targets.run_right());
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            &targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            animation_target(&animations, "stumble_recover_left"),
            uuid::Uuid::nil(),
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, run_left);
    }

    #[test]
    fn holds_running_animation_before_finish_animation() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let runout = NativePetEdgeRunoutState {
            animation: movement_targets.run_right(),
            finish_animation: animation_target(&animations, "stumble_recover_right"),
            preset_behavior_interaction_uuid: uuid::Uuid::nil(),
            remaining_ms: NATIVE_PET_EDGE_RUNOUT_MAX_MS,
        };

        let running = native_pet_advance_edge_runout(runout, 120);
        assert_eq!(running.animation, movement_targets.run_right());
        assert!(running.next_state.is_some());

        let landing =
            native_pet_advance_edge_runout(running.next_state.expect("remaining runout"), 1_000);
        assert_eq!(
            landing.animation,
            animation_target(&animations, "stumble_recover_right")
        );
        assert!(landing.next_state.is_none());
    }

    #[test]
    fn preserves_preset_behavior_interaction_id_until_finish_animation() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let params = NativePetPhysicsParams::default();
        let interaction_uuid =
            uuid::Uuid::parse_str("019f5200-0000-7000-8000-000000000001").expect("uuid");
        let runout = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 900.0, y: 0.0 },
            animation_target(&animations, "trip_fall_right"),
            interaction_uuid,
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.preset_behavior_interaction_uuid, interaction_uuid);

        let running = native_pet_advance_edge_runout(runout, 120)
            .next_state
            .expect("remaining runout");
        assert_eq!(running.preset_behavior_interaction_uuid, interaction_uuid);
    }

    #[test]
    fn preserves_manifest_only_finish_target_until_edge_runout_finishes() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future throw finish",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": "future_throw_finish",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future throw finish");
        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with future finish");
        let key = NativePetAnimationKey::parse("future_throw_finish").expect("valid key");
        let finish_target = animations
            .animation_target_for_key(&key)
            .expect("future finish target exists");
        let params = NativePetPhysicsParams::default();
        let movement_targets = movement_targets(&animations);
        let runout = native_pet_edge_runout_after_inertia_step(
            &movement_targets,
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 900.0, y: 0.0 },
            finish_target,
            uuid::Uuid::nil(),
            &params,
        )
        .expect("edge runout");

        let running = native_pet_advance_edge_runout(runout, 120);
        assert_eq!(running.animation, movement_targets.run_right());

        let landing =
            native_pet_advance_edge_runout(running.next_state.expect("remaining runout"), 1_000);
        assert_eq!(
            animations.manifest_key_for_target(landing.animation),
            "future_throw_finish"
        );
        assert!(landing.next_state.is_none());
    }
}
