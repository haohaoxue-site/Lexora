mod current;
mod presence;
mod targets;
mod transitions;

pub(in crate::native_pet) use current::NativePetCurrentAnimationState;
pub(super) use presence::{
    native_pet_animation_for_lifecycle, native_pet_idle_lifecycle_elapsed_ms,
    native_pet_initial_idle_presence_schedule_seed, native_pet_initial_throw_outcome_seed,
    native_pet_next_idle_presence_schedule_seed, native_pet_next_throw_outcome_seed,
    native_pet_should_apply_lifecycle_animation, native_pet_should_rotate_idle_presence_schedule,
    native_pet_task_presence_animation, native_pet_task_presence_elapsed_ms,
    NativePetIdleLifecycleElapsedInput, NativePetLifecycleAnimationInput,
    NativePetTaskPresenceAnimationInput,
};
pub(in crate::native_pet) use targets::{
    NativePetFallenGetUpActionTargets, NativePetLifecycleActionTargets,
    NativePetMovementActionTargets,
};
pub(super) use transitions::{
    native_pet_animation_after_drag_release, native_pet_animation_for_hover_state,
    native_pet_animation_for_velocity, native_pet_facing_for_velocity,
    native_pet_fallen_get_up_animation, native_pet_initial_animation,
    native_pet_requested_animation_after_pointer_interaction,
    native_pet_requested_animation_for_control_animation,
    native_pet_should_block_pointer_interaction, native_pet_should_keep_scripted_action_playing,
    NativePetLocalInteractionAnimationState,
};

#[cfg(test)]
use transitions::native_pet_should_keep_fallen_waiting;

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::targets::NativePetMovementActionTargets;
    use super::*;
    use crate::native_pet::{
        animation::{
            native_pet_requested_animation_fallback, NativePetAnimationCompletionFallbackProfile,
            NativePetAnimationKey, NativePetAnimationLocalInteractionProfile,
            NativePetAnimationPlayback, NativePetAnimationRenderProfile,
            NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetAnimationTarget,
            NativePetLifecycleAnimationDecision, NativePetManifest,
            NativePetRequestedAnimationState,
        },
        assets::load_default_pet_animation_set,
        coordinates::NativePetLogicalVelocity,
        geometry::NativePetFacing,
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn requested_state(manifest_key: &str) -> NativePetRequestedAnimationState {
        NativePetRequestedAnimationState::from(test_target(manifest_key))
    }

    fn test_target(manifest_key: &str) -> NativePetAnimationTarget {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        animations.animation_target_for_test_key(manifest_key)
    }

    fn requested_idle_state() -> NativePetRequestedAnimationState {
        NativePetRequestedAnimationState::from(lifecycle_targets().idle())
    }

    fn lifecycle_decision(manifest_key: &str) -> NativePetLifecycleAnimationDecision {
        NativePetLifecycleAnimationDecision::from(test_target(manifest_key))
    }

    fn lifecycle_target_decision(
        target: NativePetAnimationTarget,
    ) -> NativePetLifecycleAnimationDecision {
        NativePetLifecycleAnimationDecision::from(target)
    }

    fn lifecycle_targets() -> NativePetLifecycleActionTargets {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle targets resolve from registry")
    }

    fn movement_targets() -> NativePetMovementActionTargets {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        NativePetMovementActionTargets::load_bundled(&animations)
            .expect("movement targets resolve from registry")
    }

    fn fallen_get_up_targets() -> NativePetFallenGetUpActionTargets {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        NativePetFallenGetUpActionTargets::load_bundled(&animations)
            .expect("fallen get-up targets resolve from registry")
    }

    fn current_state(manifest_key: &str) -> NativePetCurrentAnimationState {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        NativePetCurrentAnimationState::from_playback(
            &animations,
            animations.playback_for_test_key(manifest_key),
        )
    }

    fn manifest_only_finite_scripted_playback(
    ) -> (NativePetAnimationSet, NativePetAnimationPlayback) {
        manifest_only_profile_playback(
            "future_scripted_celebration",
            NativePetAnimationRenderProfile::Celebrate,
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
            NativePetAnimationCompletionFallbackProfile::Idle,
            false,
        )
    }

    fn manifest_only_profile_playback(
        name: &str,
        render_profile: NativePetAnimationRenderProfile,
        local_interaction_profile: NativePetAnimationLocalInteractionProfile,
        completion_fallback_profile: NativePetAnimationCompletionFallbackProfile,
        loop_animation: bool,
    ) -> (NativePetAnimationSet, NativePetAnimationPlayback) {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future profile animation",
                "frames": [
                    { "index": 0, "durationMs": 120 },
                    { "index": 1, "durationMs": 120 }
                ],
                "loop": loop_animation,
                "name": name,
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future profile animation");
        let mut profiles = HashMap::new();
        profiles.insert(
            name.to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile,
                local_interaction_profile,
                completion_fallback_profile,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future profile animation loads");
        let key = NativePetAnimationKey::parse(name).expect("valid key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("future profile animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

        (animations, playback)
    }

    fn manifest_only_profile_playback_pair(
        first_name: &str,
        second_name: &str,
        render_profile: NativePetAnimationRenderProfile,
    ) -> (
        NativePetAnimationSet,
        NativePetAnimationPlayback,
        NativePetAnimationPlayback,
    ) {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        let animations_json = manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array");
        animations_json.push(serde_json::json!({
            "description": "Fixture future profile animation",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": true,
            "name": first_name,
            "row": 0
        }));
        animations_json.push(serde_json::json!({
            "description": "Fixture alternate future profile animation",
            "frames": [{ "index": 1, "durationMs": 120 }],
            "loop": true,
            "name": second_name,
            "row": 0
        }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future profile animations");
        let runtime_profile = NativePetAnimationRuntimeProfile {
            render_profile,
            local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
            completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
        };
        let mut profiles = HashMap::new();
        profiles.insert(first_name.to_owned(), runtime_profile);
        profiles.insert(second_name.to_owned(), runtime_profile);
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future profile animations loads");
        let first_key = NativePetAnimationKey::parse(first_name).expect("valid first key");
        let second_key = NativePetAnimationKey::parse(second_name).expect("valid second key");
        let first_playback = NativePetAnimationPlayback::from_manifest_handle(
            animations
                .animation_handle_for_key(&first_key)
                .expect("first profile animation exists"),
        );
        let second_playback = NativePetAnimationPlayback::from_manifest_handle(
            animations
                .animation_handle_for_key(&second_key)
                .expect("second profile animation exists"),
        );

        (animations, first_playback, second_playback)
    }

    fn native_pet_animation_for_lifecycle(
        pointer_hovered: bool,
        is_dragging: bool,
        is_inertia_active: bool,
        requested: NativePetRequestedAnimationState,
        current: &str,
        idle_elapsed_ms: u64,
        idle_presence_schedule_seed: u64,
    ) -> NativePetLifecycleAnimationDecision {
        super::native_pet_animation_for_lifecycle(
            &lifecycle_targets(),
            NativePetLifecycleAnimationInput {
                pointer_hovered,
                is_dragging,
                is_inertia_active,
                requested,
                current: current_state(current),
                idle_elapsed_ms,
                idle_presence_schedule_seed,
            },
        )
    }

    fn native_pet_animation_for_hover_state(
        pointer_hovered: bool,
        is_dragging: bool,
        is_inertia_active: bool,
        requested: NativePetRequestedAnimationState,
        current: &str,
    ) -> NativePetLifecycleAnimationDecision {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        super::native_pet_animation_for_hover_state(
            &lifecycle_targets(),
            &animations,
            pointer_hovered,
            is_dragging,
            is_inertia_active,
            requested,
            animations.playback_for_test_key(current),
        )
    }

    fn native_pet_task_presence_elapsed_ms(
        current_elapsed_ms: u64,
        elapsed_ms: u64,
        pointer_hovered: bool,
        is_dragging: bool,
        is_inertia_active: bool,
        requested: NativePetRequestedAnimationState,
    ) -> u64 {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        super::native_pet_task_presence_elapsed_ms(
            &animations,
            current_elapsed_ms,
            elapsed_ms,
            pointer_hovered,
            is_dragging,
            is_inertia_active,
            requested,
        )
    }

    fn native_pet_task_presence_animation(
        pointer_hovered: bool,
        is_dragging: bool,
        is_inertia_active: bool,
        requested: NativePetRequestedAnimationState,
        current: &str,
        task_presence_elapsed_ms: u64,
    ) -> Option<NativePetLifecycleAnimationDecision> {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        super::native_pet_task_presence_animation(
            &lifecycle_targets(),
            &animations,
            NativePetTaskPresenceAnimationInput {
                pointer_hovered,
                is_dragging,
                is_inertia_active,
                requested,
                current: current_state(current),
                task_presence_elapsed_ms,
            },
        )
    }

    fn interaction_state(manifest_key: &str) -> NativePetLocalInteractionAnimationState {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        NativePetLocalInteractionAnimationState::from(
            animations.local_interaction_profile_for_target(test_target(manifest_key)),
        )
    }

    #[test]
    fn starts_with_wake_transition_before_idle_loop() {
        let targets = lifecycle_targets();
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        assert_eq!(native_pet_initial_animation(&targets), targets.wake());
        assert_eq!(
            native_pet_requested_animation_fallback(
                &animations,
                lifecycle_target_decision(targets.wake()),
                targets.idle(),
            )
            .animation_target(),
            targets.idle()
        );
    }

    #[test]
    fn drag_release_without_inertia_returns_idle_after_confirmed_drag() {
        let targets = movement_targets();

        assert_eq!(
            native_pet_animation_after_drag_release(&targets, true, None, NativePetFacing::Left),
            targets.idle()
        );
        assert_eq!(
            native_pet_animation_after_drag_release(&targets, true, None, NativePetFacing::Right),
            targets.idle()
        );
        assert_eq!(
            native_pet_animation_after_drag_release(&targets, false, None, NativePetFacing::Left),
            targets.tap()
        );
    }

    #[test]
    fn drag_release_inertia_uses_resolved_directional_run_target() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future run left",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_run_left",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future run left");
        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with future run left");
        let key = NativePetAnimationKey::parse("future_run_left").expect("valid animation key");
        let run_left = animations
            .animation_target_for_key(&key)
            .expect("future run left target exists");
        let bundled_targets = NativePetMovementActionTargets::load_bundled(&animations)
            .expect("movement targets resolve from registry");
        let targets = bundled_targets.with_run_targets(run_left, bundled_targets.run_right());

        assert_eq!(
            native_pet_animation_after_drag_release(
                &targets,
                true,
                Some(NativePetLogicalVelocity { x: -900.0, y: 0.0 }),
                NativePetFacing::Right,
            ),
            run_left
        );
    }

    #[test]
    fn fallen_idle_click_maps_to_directional_get_up_animation() {
        let targets = fallen_get_up_targets();

        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, interaction_state("fallen_idle_left")),
            Some(targets.left())
        );
        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, interaction_state("fallen_idle_right")),
            Some(targets.right())
        );
        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, interaction_state("idle")),
            None
        );
    }

    #[test]
    fn fallen_idle_click_can_use_registry_manifest_get_up_target() {
        let (animations, playback) = manifest_only_profile_playback(
            "future_get_up_left",
            NativePetAnimationRenderProfile::FallenGetUp,
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
            NativePetAnimationCompletionFallbackProfile::Idle,
            false,
        );
        let targets = NativePetFallenGetUpActionTargets::load_bundled(&animations)
            .expect("fallen get-up targets resolve from registry")
            .with_left_target(playback.animation_target());

        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, interaction_state("fallen_idle_left"),),
            Some(playback.animation_target())
        );
    }

    #[test]
    fn local_interaction_state_uses_bundled_runtime_profile_for_fallen_get_up() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let key = NativePetAnimationKey::parse("fallen_idle_left").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("fallen idle animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);
        let current = NativePetLocalInteractionAnimationState::from_playback(&animations, playback);
        let targets = NativePetFallenGetUpActionTargets::load_bundled(&animations)
            .expect("fallen get-up targets resolve from registry");

        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, current),
            Some(targets.left())
        );
    }

    #[test]
    fn local_interaction_state_uses_runtime_profile_for_manifest_handles() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future fallen idle",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_fallen_wait",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future fallen wait");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_fallen_wait".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Fallen,
                local_interaction_profile:
                    NativePetAnimationLocalInteractionProfile::FallenIdleLeft,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future fallen wait loads");
        let key = NativePetAnimationKey::parse("future_fallen_wait").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("future fallen wait animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);
        let current = NativePetLocalInteractionAnimationState::from_playback(&animations, playback);
        let targets = NativePetFallenGetUpActionTargets::load_bundled(&animations)
            .expect("fallen get-up targets resolve from registry");

        assert_eq!(
            native_pet_fallen_get_up_animation(&targets, current),
            Some(targets.left())
        );
    }

    #[test]
    fn hover_preserves_manifest_only_finite_scripted_action_by_runtime_profile() {
        let (animations, playback) = manifest_only_finite_scripted_playback();

        let decision = super::native_pet_animation_for_hover_state(
            &lifecycle_targets(),
            &animations,
            true,
            false,
            false,
            requested_state("idle"),
            playback,
        );

        assert_eq!(decision.animation_target(), playback.animation_target());
    }

    #[test]
    fn lifecycle_application_preserves_manifest_only_finite_scripted_action_by_runtime_profile() {
        let (animations, playback) = manifest_only_finite_scripted_playback();

        assert!(!native_pet_should_apply_lifecycle_animation(
            &animations,
            playback,
            lifecycle_decision("hover"),
        ));
    }

    #[test]
    fn lifecycle_current_state_uses_manifest_runtime_profile() {
        let targets = lifecycle_targets();
        let (sleep_animations, sleep_playback) = manifest_only_profile_playback(
            "future_sleep_current",
            NativePetAnimationRenderProfile::Sleep,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );
        assert_eq!(
            super::native_pet_animation_for_lifecycle(
                &targets,
                NativePetLifecycleAnimationInput {
                    pointer_hovered: false,
                    is_dragging: false,
                    is_inertia_active: false,
                    requested: requested_state("working"),
                    current: NativePetCurrentAnimationState::from_playback(
                        &sleep_animations,
                        sleep_playback,
                    ),
                    idle_elapsed_ms: 0,
                    idle_presence_schedule_seed: 0,
                },
            )
            .animation_target(),
            targets.wake()
        );

        let (working_animations, working_playback) = manifest_only_profile_playback(
            "future_working_current",
            NativePetAnimationRenderProfile::Working,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );
        assert_eq!(
            super::native_pet_animation_for_lifecycle(
                &targets,
                NativePetLifecycleAnimationInput {
                    pointer_hovered: false,
                    is_dragging: false,
                    is_inertia_active: false,
                    requested: NativePetRequestedAnimationState::from(targets.idle()),
                    current: NativePetCurrentAnimationState::from_playback(
                        &working_animations,
                        working_playback,
                    ),
                    idle_elapsed_ms: 0,
                    idle_presence_schedule_seed: 0,
                },
            )
            .animation_target(),
            targets.celebrate()
        );

        let (sad_animations, sad_playback) = manifest_only_profile_playback(
            "future_sad_current",
            NativePetAnimationRenderProfile::Sad,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );
        assert_eq!(
            super::native_pet_animation_for_lifecycle(
                &targets,
                NativePetLifecycleAnimationInput {
                    pointer_hovered: false,
                    is_dragging: false,
                    is_inertia_active: false,
                    requested: NativePetRequestedAnimationState::from(targets.idle()),
                    current: NativePetCurrentAnimationState::from_playback(
                        &sad_animations,
                        sad_playback,
                    ),
                    idle_elapsed_ms: 0,
                    idle_presence_schedule_seed: 0,
                },
            )
            .animation_target(),
            targets.reassure()
        );
    }

    #[test]
    fn control_messages_do_not_interrupt_scripted_action_states() {
        assert!(native_pet_should_keep_fallen_waiting(interaction_state(
            "fallen_idle_left"
        )));
        assert!(native_pet_should_keep_fallen_waiting(interaction_state(
            "fallen_idle_right"
        )));
        assert!(!native_pet_should_keep_fallen_waiting(interaction_state(
            "trip_fall_left"
        )));
        assert!(!native_pet_should_keep_fallen_waiting(interaction_state(
            "idle"
        )));
        assert!(native_pet_should_keep_scripted_action_playing(
            interaction_state("trip_fall_left")
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            interaction_state("fallen_idle_right")
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            interaction_state("fallen_get_up_left")
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            interaction_state("stumble_recover_right")
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            interaction_state("celebrate")
        ));
        assert!(!native_pet_should_keep_scripted_action_playing(
            interaction_state("explain")
        ));
    }

    #[test]
    fn scripted_action_blocks_drag_until_fallen_waiting_can_be_clicked() {
        assert!(native_pet_should_block_pointer_interaction(
            interaction_state("trip_fall_left")
        ));
        assert!(native_pet_should_block_pointer_interaction(
            interaction_state("fallen_get_up_right")
        ));
        assert!(native_pet_should_block_pointer_interaction(
            interaction_state("stumble_recover_left")
        ));
        assert!(native_pet_should_block_pointer_interaction(
            interaction_state("celebrate")
        ));
        assert!(!native_pet_should_block_pointer_interaction(
            interaction_state("fallen_idle_left")
        ));
        assert!(!native_pet_should_block_pointer_interaction(
            interaction_state("explain")
        ));
        assert!(!native_pet_should_block_pointer_interaction(
            interaction_state("idle")
        ));
    }

    #[test]
    fn keeps_directional_inertia_animation_after_fast_drag_release() {
        let targets = movement_targets();

        assert_eq!(
            native_pet_animation_after_drag_release(
                &targets,
                true,
                Some(NativePetLogicalVelocity { x: 120.0, y: 0.0 }),
                NativePetFacing::Left,
            ),
            targets.run_right()
        );
    }

    #[test]
    fn finite_control_actions_return_requested_state_to_idle_without_rewriting_run() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let idle_target = animations.animation_target_for_test_key("idle");
        let run_right_target = animations.animation_target_for_test_key("run_right");

        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                &animations,
                animations.animation_target_for_test_key("trip_fall_left"),
                idle_target,
            )
            .animation_target(),
            idle_target
        );
        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                &animations,
                animations.animation_target_for_test_key("stumble_recover_right",),
                idle_target,
            )
            .animation_target(),
            idle_target
        );
        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                &animations,
                animations.animation_target_for_test_key("wake"),
                idle_target,
            )
            .animation_target(),
            idle_target
        );
        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                &animations,
                run_right_target,
                idle_target,
            )
            .animation_target(),
            run_right_target
        );
    }

    #[test]
    fn finite_manifest_control_action_returns_requested_state_to_idle_by_runtime_profile() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future scripted action",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": "future_scripted_action",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future scripted action");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_scripted_action".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::TripFall,
                local_interaction_profile:
                    NativePetAnimationLocalInteractionProfile::FiniteScriptedAction,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Idle,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future scripted action loads");
        let key = NativePetAnimationKey::parse("future_scripted_action").expect("valid key");
        let target = animations
            .animation_target_for_key(&key)
            .expect("future scripted action target exists");

        let requested = native_pet_requested_animation_for_control_animation(
            &animations,
            target,
            animations.animation_target_for_test_key("idle"),
        );

        assert_eq!(
            requested.animation_target(),
            animations.animation_target_for_test_key("idle")
        );
    }

    #[test]
    fn lifecycle_sleep_uses_resolved_action_target() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future sleep action",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_sleep_action",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future sleep action");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_sleep_action".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Sleep,
                local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future sleep action loads");
        let key = NativePetAnimationKey::parse("future_sleep_action").expect("valid key");
        let sleep_target = animations
            .animation_target_for_key(&key)
            .expect("future sleep target exists");
        let bundled_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle targets resolve from registry");
        let targets = bundled_targets.with_sleep_target(sleep_target);

        let decision = super::native_pet_animation_for_lifecycle(
            &targets,
            NativePetLifecycleAnimationInput {
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: NativePetRequestedAnimationState::from(sleep_target),
                current: NativePetCurrentAnimationState::from_playback(
                    &animations,
                    animations.playback_for_test_key("idle"),
                ),
                idle_elapsed_ms: 0,
                idle_presence_schedule_seed: 0,
            },
        );

        assert_eq!(decision.animation_target(), sleep_target);
        assert!(matches!(
            decision.animation_target(),
            NativePetAnimationTarget::ManifestHandle(_)
        ));
    }

    #[test]
    fn uses_hover_animation_only_when_no_higher_priority_animation_is_active() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_idle_state(),
                "idle",
            )
            .animation_target(),
            targets.hover()
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                false,
                false,
                false,
                requested_idle_state(),
                "hover",
            )
            .animation_target(),
            targets.idle()
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                true,
                false,
                requested_state("working"),
                "working",
            )
            .animation_target(),
            test_target("working")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                true,
                requested_state("working"),
                "working",
            )
            .animation_target(),
            test_target("working")
        );
    }

    #[test]
    fn hover_does_not_dilute_task_and_status_feedback() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("working"),
                "working",
            )
            .animation_target(),
            test_target("working")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("approval"),
                "approval",
            )
            .animation_target(),
            test_target("approval")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("sad"),
                "sad",
            )
            .animation_target(),
            test_target("sad")
        );
    }

    #[test]
    fn hover_wakes_sleeping_pet_without_skipping_the_wake_transition() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_idle_state(),
                "sleep",
            )
            .animation_target(),
            targets.wake()
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                false,
                false,
                false,
                requested_idle_state(),
                "sleep",
            )
            .animation_target(),
            targets.sleep()
        );
    }

    #[test]
    fn pointer_interaction_clears_sleep_request_without_clearing_task_requests() {
        let targets = lifecycle_targets();
        let requested = native_pet_requested_animation_after_pointer_interaction(
            NativePetRequestedAnimationState::from(targets.sleep()),
            targets.sleep(),
            targets.idle(),
        );
        assert_eq!(requested.animation_target(), targets.idle());
        assert_eq!(
            native_pet_animation_for_lifecycle(false, false, false, requested, "wake", 0, 0,)
                .animation_target(),
            targets.idle()
        );
        assert_eq!(
            native_pet_requested_animation_after_pointer_interaction(
                requested_state("working"),
                test_target("sleep"),
                test_target("idle"),
            )
            .animation_target(),
            test_target("working")
        );
    }

    #[test]
    fn pointer_interaction_clears_registry_manifest_sleep_request() {
        let (_animations, playback) = manifest_only_profile_playback(
            "future_sleep_request",
            NativePetAnimationRenderProfile::Sleep,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );

        let requested = native_pet_requested_animation_after_pointer_interaction(
            NativePetRequestedAnimationState::from(playback.animation_target()),
            playback.animation_target(),
            test_target("idle"),
        );

        assert_eq!(requested.animation_target(), test_target("idle"));
    }

    #[test]
    fn hover_does_not_interrupt_one_shot_reaction_animations() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("idle"),
                "tap",
            )
            .animation_target(),
            test_target("tap")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("idle"),
                "curious",
            )
            .animation_target(),
            test_target("curious")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("idle"),
                "trip_fall_left",
            )
            .animation_target(),
            test_target("trip_fall_left")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("idle"),
                "fallen_idle_right",
            )
            .animation_target(),
            test_target("fallen_idle_right")
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                requested_state("idle"),
                "stumble_recover_left",
            )
            .animation_target(),
            test_target("stumble_recover_left")
        );
    }

    #[test]
    fn lifecycle_sleeps_after_long_idle_and_wakes_on_hover() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "idle",
                45_000,
                0,
            )
            .animation_target(),
            test_target("sleep_enter")
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                true,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "sleep",
                45_000,
                0,
            )
            .animation_target(),
            targets.wake()
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                requested_state("working"),
                "working",
                45_000,
                0,
            )
            .animation_target(),
            test_target("working")
        );
    }

    #[test]
    fn lifecycle_wakes_from_sleep_before_non_idle_requested_animation() {
        let targets = lifecycle_targets();
        let decision: NativePetLifecycleAnimationDecision = native_pet_animation_for_lifecycle(
            false,
            false,
            false,
            requested_state("working"),
            "sleep",
            0,
            0,
        );
        assert_eq!(decision.animation_target(), targets.wake());
    }

    #[test]
    fn lifecycle_keeps_explicit_sleep_request_instead_of_waking_again() {
        let targets = lifecycle_targets();
        let decision = native_pet_animation_for_lifecycle(
            false,
            false,
            false,
            NativePetRequestedAnimationState::from(targets.sleep()),
            "sleep",
            0,
            0,
        );

        assert_eq!(decision.animation_target(), targets.sleep());
    }

    #[test]
    fn lifecycle_preserves_manifest_only_requested_animation_target() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future looping clip",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": true,
                "name": "future_loop",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future loop");
        let animations = NativePetAnimationSet::from_manifest(manifest)
            .expect("manifest with future loop loads");
        let key = NativePetAnimationKey::parse("future_loop").expect("valid animation key");
        let target = animations
            .animation_target_for_key(&key)
            .expect("future loop has playback target");
        let requested = NativePetRequestedAnimationState::from(target);
        let decision =
            native_pet_animation_for_lifecycle(false, false, false, requested, "idle", 45_000, 0);

        assert_eq!(
            animations.manifest_key_for_target(decision.animation_target()),
            "future_loop"
        );
        assert!(!native_pet_should_apply_lifecycle_animation(
            &animations,
            NativePetAnimationPlayback::from_manifest_handle(
                animations
                    .animation_handle_for_key(&key)
                    .expect("future loop animation exists")
            ),
            decision,
        ));
    }

    #[test]
    fn lifecycle_uses_reassure_recovery_when_error_status_clears() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "sad",
                0,
                0,
            )
            .animation_target(),
            targets.reassure()
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "reassure",
                0,
                0,
            )
            .animation_target(),
            targets.idle()
        );
    }

    #[test]
    fn lifecycle_uses_celebrate_when_working_completes() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "working",
                0,
                0,
            )
            .animation_target(),
            targets.celebrate()
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(targets.idle()),
                "celebrate",
                0,
                0,
            )
            .animation_target(),
            targets.idle()
        );
    }

    #[test]
    fn lifecycle_elapsed_only_accumulates_for_plain_idle() {
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: requested_state("idle"),
                current: current_state("idle"),
                idle_target: test_target("idle"),
            }),
            1_016
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: true,
                is_dragging: false,
                is_inertia_active: false,
                requested: requested_state("idle"),
                current: current_state("idle"),
                idle_target: test_target("idle"),
            }),
            0
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: requested_state("working"),
                current: current_state("working"),
                idle_target: test_target("idle"),
            }),
            0
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: requested_state("idle"),
                current: current_state("wake"),
                idle_target: test_target("idle"),
            }),
            0
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: requested_state("idle"),
                current: current_state("sleep"),
                idle_target: test_target("idle"),
            }),
            0
        );
    }

    #[test]
    fn lifecycle_elapsed_treats_registry_manifest_target_as_idle() {
        let (animations, playback) = manifest_only_profile_playback(
            "future_idle_lifecycle",
            NativePetAnimationRenderProfile::Idle,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );
        let idle_target = playback.animation_target();
        let current = NativePetCurrentAnimationState::from_playback(&animations, playback);

        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
                current_elapsed_ms: 1_000,
                elapsed_ms: 16,
                pointer_hovered: false,
                is_dragging: false,
                is_inertia_active: false,
                requested: NativePetRequestedAnimationState::from(idle_target),
                current,
                idle_target,
            }),
            1_016
        );
    }

    #[test]
    fn task_presence_elapsed_accumulates_only_for_uninterrupted_task_states() {
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                requested_state("working"),
            ),
            1_016
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                requested_state("thinking"),
            ),
            1_016
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                true,
                false,
                false,
                requested_state("working"),
            ),
            0
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                requested_state("approval"),
            ),
            1_016
        );
    }

    #[test]
    fn task_presence_elapsed_accumulates_for_registry_manifest_task_profile() {
        let (animations, playback) = manifest_only_profile_playback(
            "future_working_presence",
            NativePetAnimationRenderProfile::Working,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );

        assert_eq!(
            super::native_pet_task_presence_elapsed_ms(
                &animations,
                1_000,
                16,
                false,
                false,
                false,
                NativePetRequestedAnimationState::from(playback.animation_target()),
            ),
            1_016
        );
    }

    #[test]
    fn task_presence_inserts_low_frequency_variation_without_interrupting_priority_states() {
        let targets = lifecycle_targets();

        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                requested_state("working"),
                "working",
                21_999,
            ),
            None
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                requested_state("working"),
                "working",
                22_000,
            )
            .map(|decision| decision.animation_target()),
            Some(targets.curious())
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                requested_state("working"),
                "curious",
                22_000,
            ),
            None
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                requested_state("approval"),
                "approval",
                22_000,
            )
            .map(|decision| decision.animation_target()),
            Some(targets.hover())
        );
        assert_eq!(
            native_pet_task_presence_animation(
                true,
                false,
                false,
                requested_state("thinking"),
                "thinking",
                22_000,
            ),
            None
        );
    }

    #[test]
    fn task_presence_reaction_waits_until_current_matches_registry_manifest_task_target() {
        let (animations, requested_playback, current_playback) =
            manifest_only_profile_playback_pair(
                "future_working_presence_reaction",
                "alternate_working_presence_reaction",
                NativePetAnimationRenderProfile::Working,
            );

        assert_eq!(
            super::native_pet_task_presence_animation(
                &lifecycle_targets(),
                &animations,
                NativePetTaskPresenceAnimationInput {
                    pointer_hovered: false,
                    is_dragging: false,
                    is_inertia_active: false,
                    requested: NativePetRequestedAnimationState::from(
                        requested_playback.animation_target(),
                    ),
                    current: NativePetCurrentAnimationState::from_playback(
                        &animations,
                        current_playback,
                    ),
                    task_presence_elapsed_ms: 22_000,
                },
            ),
            None
        );
    }

    #[test]
    fn task_presence_reaction_uses_registry_manifest_task_profile() {
        let targets = lifecycle_targets();
        let (animations, playback) = manifest_only_profile_playback(
            "future_working_presence_reaction_target",
            NativePetAnimationRenderProfile::Working,
            NativePetAnimationLocalInteractionProfile::None,
            NativePetAnimationCompletionFallbackProfile::Default,
            true,
        );

        assert_eq!(
            super::native_pet_task_presence_animation(
                &lifecycle_targets(),
                &animations,
                NativePetTaskPresenceAnimationInput {
                    pointer_hovered: false,
                    is_dragging: false,
                    is_inertia_active: false,
                    requested: NativePetRequestedAnimationState::from(playback.animation_target()),
                    current: NativePetCurrentAnimationState::from_playback(&animations, playback),
                    task_presence_elapsed_ms: 22_000,
                },
            )
            .map(|decision| decision.animation_target()),
            Some(targets.curious())
        );
    }

    #[test]
    fn lifecycle_does_not_interrupt_one_shot_wake_transition() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");

        assert!(native_pet_should_apply_lifecycle_animation(
            &animations,
            animations.playback_for_test_key("sleep"),
            lifecycle_decision("wake"),
        ));
        assert!(!native_pet_should_apply_lifecycle_animation(
            &animations,
            animations.playback_for_test_key("wake"),
            lifecycle_decision("hover"),
        ));
    }
}
