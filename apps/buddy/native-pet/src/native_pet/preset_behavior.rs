use std::cell::{Cell, RefCell};

use crate::{action_registry::ActionRegistry, error::BuddyResult};

use super::{
    animation::{
        NativePetAnimationPlayback, NativePetAnimationSet, NativePetAnimationTarget,
        NativePetRequestedAnimationState,
    },
    assets::native_pet_action_target_from_registry,
    geometry::NativePetFacing,
    lifecycle::native_pet_requested_animation_for_control_animation,
    process::{
        step_protocol::{
            execute_step_request, ExecuteStepPayload, ExecuteStepPlayback, ExecuteStepRequest,
            SidecarInterruptPolicy, SidecarPlayActionCompletionBehavior,
        },
        NativePetPresetBehaviorEvent,
    },
    step_runtime::{native_pet_start_active_step_for_execute_step, NativePetActiveStepState},
};

pub(super) const THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID: &str = "throw_after_drag";
const PRESET_BEHAVIOR_STEP_TIMEOUT_MS: u64 = 5_000;
const THROW_AFTER_DRAG_NONE_ACTION_ID: &str = "throw_after_drag.none";
const THROW_AFTER_DRAG_FALL_LEFT_ACTION_ID: &str = "throw_after_drag.fall.left";
const THROW_AFTER_DRAG_FALL_RIGHT_ACTION_ID: &str = "throw_after_drag.fall.right";
const THROW_AFTER_DRAG_STUMBLE_LEFT_ACTION_ID: &str = "throw_after_drag.stumble.left";
const THROW_AFTER_DRAG_STUMBLE_RIGHT_ACTION_ID: &str = "throw_after_drag.stumble.right";

pub(super) fn native_pet_new_preset_behavior_interaction_uuid() -> uuid::Uuid {
    uuid::Uuid::now_v7()
}

pub(super) fn native_pet_preset_behavior_interaction_id(interaction_uuid: uuid::Uuid) -> String {
    format!("interaction_{interaction_uuid}")
}

pub(super) fn native_pet_new_preset_behavior_interaction_id() -> String {
    native_pet_preset_behavior_interaction_id(native_pet_new_preset_behavior_interaction_uuid())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum NativePetThrowAfterDragFinish {
    None,
    FallLeft,
    FallRight,
    StumbleLeft,
    StumbleRight,
}

impl NativePetThrowAfterDragFinish {
    pub(super) fn action_id(self) -> &'static str {
        match self {
            Self::None => THROW_AFTER_DRAG_NONE_ACTION_ID,
            Self::FallLeft => THROW_AFTER_DRAG_FALL_LEFT_ACTION_ID,
            Self::FallRight => THROW_AFTER_DRAG_FALL_RIGHT_ACTION_ID,
            Self::StumbleLeft => THROW_AFTER_DRAG_STUMBLE_LEFT_ACTION_ID,
            Self::StumbleRight => THROW_AFTER_DRAG_STUMBLE_RIGHT_ACTION_ID,
        }
    }

    pub(super) fn outcome(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::FallLeft | Self::FallRight => "fall",
            Self::StumbleLeft | Self::StumbleRight => "stumble",
        }
    }

    pub(super) fn waits_for_get_up(self) -> bool {
        matches!(self, Self::FallLeft | Self::FallRight)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetThrowAfterDragFinishTargets {
    none: NativePetAnimationTarget,
    fall_left: NativePetAnimationTarget,
    fall_right: NativePetAnimationTarget,
    stumble_left: NativePetAnimationTarget,
    stumble_right: NativePetAnimationTarget,
}

impl NativePetThrowAfterDragFinishTargets {
    pub(super) fn load_bundled(animations: &NativePetAnimationSet) -> BuddyResult<Self> {
        let registry = ActionRegistry::load_bundled()?;
        Self::load(&registry, animations)
    }

    pub(super) fn load(
        registry: &ActionRegistry,
        animations: &NativePetAnimationSet,
    ) -> BuddyResult<Self> {
        Ok(Self {
            none: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::None,
            )?,
            fall_left: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::FallLeft,
            )?,
            fall_right: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::FallRight,
            )?,
            stumble_left: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::StumbleLeft,
            )?,
            stumble_right: native_pet_throw_after_drag_finish_target(
                registry,
                animations,
                NativePetThrowAfterDragFinish::StumbleRight,
            )?,
        })
    }

    pub(super) fn animation_target(
        &self,
        finish: NativePetThrowAfterDragFinish,
    ) -> NativePetAnimationTarget {
        match finish {
            NativePetThrowAfterDragFinish::None => self.none,
            NativePetThrowAfterDragFinish::FallLeft => self.fall_left,
            NativePetThrowAfterDragFinish::FallRight => self.fall_right,
            NativePetThrowAfterDragFinish::StumbleLeft => self.stumble_left,
            NativePetThrowAfterDragFinish::StumbleRight => self.stumble_right,
        }
    }
}

pub(super) fn native_pet_throw_after_drag_finish_after_runout(
    run_facing: NativePetFacing,
    variant_seed: u64,
) -> NativePetThrowAfterDragFinish {
    match (run_facing, variant_seed % 3) {
        (_, 0) => NativePetThrowAfterDragFinish::None,
        (NativePetFacing::Left, 1) => NativePetThrowAfterDragFinish::FallLeft,
        (NativePetFacing::Right, 1) => NativePetThrowAfterDragFinish::FallRight,
        (NativePetFacing::Left, _) => NativePetThrowAfterDragFinish::StumbleLeft,
        (NativePetFacing::Right, _) => NativePetThrowAfterDragFinish::StumbleRight,
    }
}

pub(super) fn native_pet_throw_after_drag_preset_behavior_event(
    finish: NativePetThrowAfterDragFinish,
    animation: NativePetAnimationTarget,
    interaction_id: String,
    animations: &NativePetAnimationSet,
) -> NativePetPresetBehaviorEvent {
    NativePetPresetBehaviorEvent {
        preset_behavior_id: THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID.to_owned(),
        interaction_id: Some(interaction_id),
        outcome: finish.outcome().to_owned(),
        animation: animations.manifest_key_for_target(animation).to_owned(),
    }
}

pub(super) fn native_pet_fallen_get_up_preset_behavior_event(
    animation: NativePetAnimationTarget,
    interaction_id: String,
    animations: &NativePetAnimationSet,
) -> NativePetPresetBehaviorEvent {
    NativePetPresetBehaviorEvent {
        preset_behavior_id: THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID.to_owned(),
        interaction_id: Some(interaction_id),
        outcome: "get_up".to_owned(),
        animation: animations.manifest_key_for_target(animation).to_owned(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetFallenRecoveryState {
    interaction_id: String,
}

impl NativePetFallenRecoveryState {
    pub(super) fn into_interaction_id(self) -> String {
        self.interaction_id
    }
}

pub(super) fn native_pet_fallen_recovery_state_after_throw_finish(
    finish: NativePetThrowAfterDragFinish,
    interaction_id: String,
) -> Option<NativePetFallenRecoveryState> {
    if !finish.waits_for_get_up() {
        return None;
    }

    Some(NativePetFallenRecoveryState { interaction_id })
}

pub(super) fn native_pet_preset_behavior_execute_step_request(
    animation: NativePetAnimationTarget,
    interaction_id: &str,
    animations: &NativePetAnimationSet,
) -> ExecuteStepRequest {
    let animation_key = animations.manifest_key_for_target(animation);
    execute_step_request(
        native_pet_preset_behavior_step_id(interaction_id, animation_key),
        ExecuteStepPayload::PlayAction {
            animation: animation_key.to_owned(),
            playback: ExecuteStepPlayback::Once {
                duration_ms: animations
                    .animation_for_target(animation)
                    .total_duration_ms(),
            },
            interrupt_policy: SidecarInterruptPolicy::FinishStep,
            completion_behavior: SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
            timeout_ms: PRESET_BEHAVIOR_STEP_TIMEOUT_MS,
        },
    )
}

pub(super) fn native_pet_start_preset_behavior_execute_step(
    active_step_state: &RefCell<Option<NativePetActiveStepState>>,
    animations: &NativePetAnimationSet,
    playback: &mut NativePetAnimationPlayback,
    requested_animation: &Cell<NativePetRequestedAnimationState>,
    animation: NativePetAnimationTarget,
    idle_target: NativePetAnimationTarget,
    interaction_id: &str,
) -> ExecuteStepRequest {
    let request =
        native_pet_preset_behavior_execute_step_request(animation, interaction_id, animations);
    requested_animation.set(native_pet_requested_animation_for_control_animation(
        animations,
        animation,
        idle_target,
    ));
    playback.restart_animation_target(animation);
    active_step_state.replace(Some(native_pet_start_active_step_for_execute_step(
        &request,
    )));
    request
}

fn native_pet_preset_behavior_step_id(interaction_id: &str, animation_key: &str) -> String {
    let interaction_suffix = interaction_id
        .strip_prefix("interaction_")
        .unwrap_or(interaction_id);
    format!("step_{interaction_suffix}_{animation_key}")
}

fn native_pet_throw_after_drag_finish_target(
    registry: &ActionRegistry,
    animations: &NativePetAnimationSet,
    finish: NativePetThrowAfterDragFinish,
) -> BuddyResult<NativePetAnimationTarget> {
    native_pet_action_target_from_registry(registry, animations, finish.action_id())
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;
    use crate::{
        action_registry::ActionRegistry,
        native_pet::{
            animation::{
                NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
                NativePetAnimationLocalInteractionProfile, NativePetAnimationRenderProfile,
                NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetManifest,
            },
            assets::load_default_pet_animation_set,
            control_runtime::native_pet_apply_completed_play_action_behavior,
            lifecycle::NativePetLifecycleActionTargets,
            process::step_protocol::{
                step_completed_response, ExecuteStepPayload, ExecuteStepPlayback,
                SidecarStepResponse,
            },
            step_runtime::{
                native_pet_active_play_action_completion_behavior, native_pet_advance_active_step,
                native_pet_play_action_completion_behavior_for_response,
            },
            window_tick::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState},
        },
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn idle_target(animations: &NativePetAnimationSet) -> NativePetAnimationTarget {
        let idle_key = NativePetAnimationKey::parse("idle").expect("valid animation key");
        animations
            .animation_target_for_key(&idle_key)
            .expect("idle animation target resolves")
    }

    fn test_target(
        animations: &NativePetAnimationSet,
        manifest_key: &str,
    ) -> NativePetAnimationTarget {
        animations.animation_target_for_test_key(manifest_key)
    }

    fn requested_idle_state(
        animations: &NativePetAnimationSet,
    ) -> NativePetRequestedAnimationState {
        NativePetRequestedAnimationState::from(idle_target(animations))
    }

    #[test]
    fn throw_after_drag_finish_maps_to_stable_outcome() {
        let cases = [
            (NativePetThrowAfterDragFinish::FallLeft, "fall", true),
            (NativePetThrowAfterDragFinish::FallRight, "fall", true),
            (NativePetThrowAfterDragFinish::StumbleLeft, "stumble", false),
            (
                NativePetThrowAfterDragFinish::StumbleRight,
                "stumble",
                false,
            ),
            (NativePetThrowAfterDragFinish::None, "none", false),
        ];

        for (finish, outcome, waits_for_get_up) in cases {
            assert_eq!(finish.outcome(), outcome);
            assert_eq!(finish.waits_for_get_up(), waits_for_get_up);
        }
    }

    #[test]
    fn throw_after_drag_finish_selects_action_id_and_resolves_registry_target() {
        let registry = ActionRegistry::load_bundled().expect("load bundled action registry");
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let targets = NativePetThrowAfterDragFinishTargets::load(&registry, &animations)
            .expect("throw finish targets resolve from registry");
        let cases = [
            (
                NativePetFacing::Left,
                0,
                "throw_after_drag.none",
                "none",
                "idle",
                false,
            ),
            (
                NativePetFacing::Left,
                1,
                "throw_after_drag.fall.left",
                "fall",
                "trip_fall_left",
                true,
            ),
            (
                NativePetFacing::Right,
                1,
                "throw_after_drag.fall.right",
                "fall",
                "trip_fall_right",
                true,
            ),
            (
                NativePetFacing::Left,
                2,
                "throw_after_drag.stumble.left",
                "stumble",
                "stumble_recover_left",
                false,
            ),
            (
                NativePetFacing::Right,
                2,
                "throw_after_drag.stumble.right",
                "stumble",
                "stumble_recover_right",
                false,
            ),
            (
                NativePetFacing::Left,
                5,
                "throw_after_drag.stumble.left",
                "stumble",
                "stumble_recover_left",
                false,
            ),
            (
                NativePetFacing::Right,
                5,
                "throw_after_drag.stumble.right",
                "stumble",
                "stumble_recover_right",
                false,
            ),
        ];

        for (run_facing, seed, action_id, outcome, animation_key, waits_for_get_up) in cases {
            let finish = native_pet_throw_after_drag_finish_after_runout(run_facing, seed);
            let animation = targets.animation_target(finish);
            let event = native_pet_throw_after_drag_preset_behavior_event(
                finish,
                animation,
                "interaction_test".to_owned(),
                &animations,
            );

            assert_eq!(finish.action_id(), action_id);
            assert_eq!(finish.outcome(), outcome);
            assert_eq!(finish.waits_for_get_up(), waits_for_get_up);
            assert_eq!(animations.manifest_key_for_target(animation), animation_key);
            assert_eq!(event.outcome, outcome);
            assert_eq!(event.animation, animation_key);
        }
    }

    #[test]
    fn fallen_get_up_event_reuses_throw_interaction_id() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let event = native_pet_fallen_get_up_preset_behavior_event(
            test_target(&animations, "fallen_get_up_left"),
            "interaction_test".to_owned(),
            &animations,
        );

        assert_eq!(
            event.preset_behavior_id,
            THROW_AFTER_DRAG_PRESET_BEHAVIOR_ID
        );
        assert_eq!(event.interaction_id.as_deref(), Some("interaction_test"));
        assert_eq!(event.outcome, "get_up");
        assert_eq!(event.animation, "fallen_get_up_left");
    }

    #[test]
    fn fallen_recovery_state_waits_only_for_fall_outcomes() {
        let state = native_pet_fallen_recovery_state_after_throw_finish(
            NativePetThrowAfterDragFinish::FallRight,
            "interaction_test".to_owned(),
        )
        .expect("fall waits for recovery");

        assert_eq!(state.clone().into_interaction_id(), "interaction_test");
        assert_eq!(state.into_interaction_id(), "interaction_test");
        assert!(native_pet_fallen_recovery_state_after_throw_finish(
            NativePetThrowAfterDragFinish::StumbleRight,
            "interaction_stumble".to_owned(),
        )
        .is_none());
        assert!(native_pet_fallen_recovery_state_after_throw_finish(
            NativePetThrowAfterDragFinish::None,
            "interaction_none".to_owned(),
        )
        .is_none());
    }

    #[test]
    fn preset_behavior_execute_step_request_uses_manifest_animation_and_clip_duration() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        let request = native_pet_preset_behavior_execute_step_request(
            test_target(&animations, "stumble_recover_right"),
            "interaction_019f5200-0000-7000-8000-000000000001",
            &animations,
        );

        assert_eq!(
            request.step_id,
            "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right"
        );
        assert_eq!(
            request.step,
            ExecuteStepPayload::PlayAction {
                animation: "stumble_recover_right".to_owned(),
                playback: ExecuteStepPlayback::Once {
                    duration_ms: animations
                        .test_animation("stumble_recover_right")
                        .total_duration_ms(),
                },
                interrupt_policy: SidecarInterruptPolicy::FinishStep,
                completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
                timeout_ms: 5_000,
            }
        );
    }

    #[test]
    fn preset_behavior_execute_step_starts_active_step_for_runtime_completion() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let active_step = RefCell::new(None);
        let idle_target = idle_target(&animations);
        let requested_animation = Cell::new(requested_idle_state(&animations));
        let mut playback = animations.playback_for_test_key("idle");

        let request = native_pet_start_preset_behavior_execute_step(
            &active_step,
            &animations,
            &mut playback,
            &requested_animation,
            test_target(&animations, "stumble_recover_right"),
            idle_target,
            "interaction_019f5200-0000-7000-8000-000000000001",
        );

        assert_eq!(
            request.step_id,
            "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right"
        );
        assert_eq!(
            playback,
            animations.playback_for_test_key("stumble_recover_right")
        );
        assert_eq!(requested_animation.get().animation_target(), idle_target);
        assert_eq!(
            native_pet_advance_active_step(
                &mut active_step.borrow_mut(),
                animations
                    .test_animation("stumble_recover_right")
                    .total_duration_ms(),
            ),
            Some(SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f5200-0000-7000-8000-000000000001_stumble_recover_right",
                animations
                    .test_animation("stumble_recover_right")
                    .total_duration_ms(),
            )))
        );
    }

    #[test]
    fn trip_fall_execute_step_finishes_in_fallen_idle_until_click() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let lifecycle_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let active_step = RefCell::new(None);
        let requested_animation = Cell::new(requested_idle_state(&animations));
        let mut playback = animations.playback_for_test_key("idle");
        let trip_fall = test_target(&animations, "trip_fall_left");
        let duration_ms = animations
            .test_animation("trip_fall_left")
            .total_duration_ms();

        native_pet_start_preset_behavior_execute_step(
            &active_step,
            &animations,
            &mut playback,
            &requested_animation,
            trip_fall,
            lifecycle_targets.idle(),
            "interaction_fall",
        );
        let completion_behavior =
            native_pet_active_play_action_completion_behavior(&active_step.borrow());
        let response = native_pet_advance_active_step(&mut active_step.borrow_mut(), duration_ms)
            .expect("trip fall step completes");
        let completion_behavior =
            native_pet_play_action_completion_behavior_for_response(completion_behavior, &response)
                .expect("play action completion behavior resolves");
        native_pet_apply_completed_play_action_behavior(
            completion_behavior,
            &animations,
            &lifecycle_targets,
            &mut playback,
            &requested_animation,
        );
        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &Cell::new(false),
            idle_lifecycle_elapsed_ms: &Cell::new(0),
            idle_presence_schedule_seed: &Cell::new(0),
            task_presence_elapsed_ms: &Cell::new(0),
            elapsed_ms: duration_ms,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(
            animations.manifest_key_for_playback(playback),
            "fallen_idle_left"
        );
    }

    #[test]
    fn preset_behavior_execute_step_starts_manifest_only_target_by_runtime_profile() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future preset action",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": "future_preset_action",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future preset action");
        let mut profiles = std::collections::HashMap::new();
        profiles.insert(
            "future_preset_action".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::StumbleRecover,
                local_interaction_profile:
                    NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Idle,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future preset action loads");
        let key = NativePetAnimationKey::parse("future_preset_action").expect("valid key");
        let target = animations
            .animation_target_for_key(&key)
            .expect("future preset action target exists");
        let active_step = RefCell::new(None);
        let idle_target = idle_target(&animations);
        let requested_animation = Cell::new(requested_idle_state(&animations));
        let mut playback = animations.playback_for_test_key("idle");

        let request = native_pet_start_preset_behavior_execute_step(
            &active_step,
            &animations,
            &mut playback,
            &requested_animation,
            target,
            idle_target,
            "interaction_019f5200-0000-7000-8000-000000000001",
        );

        assert_eq!(
            request.step_id,
            "step_019f5200-0000-7000-8000-000000000001_future_preset_action"
        );
        assert_eq!(
            request.step,
            ExecuteStepPayload::PlayAction {
                animation: "future_preset_action".to_owned(),
                playback: ExecuteStepPlayback::Once { duration_ms: 120 },
                interrupt_policy: SidecarInterruptPolicy::FinishStep,
                completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::FollowAnimationFallback,
                timeout_ms: 5_000,
            }
        );
        assert!(playback.manifest_handle().is_some());
        assert_eq!(requested_animation.get().animation_target(), idle_target);
        assert_eq!(
            native_pet_advance_active_step(&mut active_step.borrow_mut(), 120),
            Some(SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f5200-0000-7000-8000-000000000001_future_preset_action",
                120,
            )))
        );
    }
}
