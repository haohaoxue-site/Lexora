use std::cell::Cell;

use super::{
    animation::{
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationPlayback, NativePetAnimationSet, NativePetRequestedAnimationState,
    },
    lifecycle::{
        native_pet_animation_for_lifecycle, native_pet_idle_lifecycle_elapsed_ms,
        native_pet_next_idle_presence_schedule_seed, native_pet_should_apply_lifecycle_animation,
        native_pet_should_rotate_idle_presence_schedule, native_pet_task_presence_animation,
        native_pet_task_presence_elapsed_ms, NativePetCurrentAnimationState,
        NativePetIdleLifecycleElapsedInput, NativePetLifecycleActionTargets,
        NativePetLifecycleAnimationInput, NativePetTaskPresenceAnimationInput,
    },
};

pub(super) struct NativePetLifecycleTickState<'a> {
    pub(super) playback: &'a mut NativePetAnimationPlayback,
    pub(super) pet_animations: &'a NativePetAnimationSet,
    pub(super) lifecycle_action_targets: &'a NativePetLifecycleActionTargets,
    pub(super) requested_animation: &'a Cell<NativePetRequestedAnimationState>,
    pub(super) pointer_hovered: &'a Cell<bool>,
    pub(super) idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    pub(super) idle_presence_schedule_seed: &'a Cell<u64>,
    pub(super) task_presence_elapsed_ms: &'a Cell<u64>,
    pub(super) elapsed_ms: u64,
    pub(super) is_dragging: bool,
    pub(super) is_inertia_active: bool,
    pub(super) is_edge_runout_active: bool,
    pub(super) is_scripted_walk_active: bool,
}

pub(super) fn native_pet_advance_lifecycle_tick(state: NativePetLifecycleTickState<'_>) {
    let NativePetLifecycleTickState {
        playback,
        pet_animations,
        lifecycle_action_targets,
        requested_animation,
        pointer_hovered,
        idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed,
        task_presence_elapsed_ms,
        elapsed_ms,
        is_dragging,
        is_inertia_active,
        is_edge_runout_active,
        is_scripted_walk_active,
    } = state;

    let requested_animation_state = requested_animation.get();
    let is_position_managed = is_dragging || is_edge_runout_active || is_scripted_walk_active;
    let current_animation_state =
        NativePetCurrentAnimationState::from_playback(pet_animations, *playback);
    let current_idle_lifecycle_elapsed_ms = idle_lifecycle_elapsed_ms.get();
    let next_idle_lifecycle_elapsed_ms =
        native_pet_idle_lifecycle_elapsed_ms(NativePetIdleLifecycleElapsedInput {
            current_elapsed_ms: current_idle_lifecycle_elapsed_ms,
            elapsed_ms,
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: current_animation_state,
            idle_target: lifecycle_action_targets.idle(),
        });
    if native_pet_should_rotate_idle_presence_schedule(
        current_idle_lifecycle_elapsed_ms,
        next_idle_lifecycle_elapsed_ms,
    ) {
        idle_presence_schedule_seed.set(native_pet_next_idle_presence_schedule_seed(
            idle_presence_schedule_seed.get(),
        ));
    }
    idle_lifecycle_elapsed_ms.set(next_idle_lifecycle_elapsed_ms);

    let next_task_presence_elapsed_ms = native_pet_task_presence_elapsed_ms(
        pet_animations,
        task_presence_elapsed_ms.get(),
        elapsed_ms,
        pointer_hovered.get(),
        is_position_managed,
        is_inertia_active,
        requested_animation_state,
    );
    task_presence_elapsed_ms.set(next_task_presence_elapsed_ms);

    let lifecycle_animation = native_pet_animation_for_lifecycle(
        lifecycle_action_targets,
        NativePetLifecycleAnimationInput {
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: current_animation_state,
            idle_elapsed_ms: next_idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: idle_presence_schedule_seed.get(),
        },
    );
    if native_pet_should_apply_lifecycle_animation(pet_animations, *playback, lifecycle_animation) {
        playback.set_lifecycle_animation(lifecycle_animation);
    }
    if let Some(task_presence_animation) = native_pet_task_presence_animation(
        lifecycle_action_targets,
        pet_animations,
        NativePetTaskPresenceAnimationInput {
            pointer_hovered: pointer_hovered.get(),
            is_dragging: is_position_managed,
            is_inertia_active,
            requested: requested_animation_state,
            current: NativePetCurrentAnimationState::from_playback(pet_animations, *playback),
            task_presence_elapsed_ms: next_task_presence_elapsed_ms,
        },
    ) {
        playback.set_lifecycle_animation(task_presence_animation);
    }

    let idle_target = lifecycle_action_targets.idle();
    let default_fallback =
        native_pet_requested_animation_fallback(pet_animations, lifecycle_animation, idle_target);
    let fallback = native_pet_completed_animation_fallback(
        pet_animations,
        *playback,
        default_fallback,
        idle_target,
    );
    playback.advance(pet_animations, elapsed_ms, fallback);
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, collections::HashMap};

    use super::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState};
    use crate::native_pet::{
        animation::{
            NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
            NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
            NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile,
            NativePetAnimationSet, NativePetAnimationTarget, NativePetManifest,
            NativePetRequestedAnimationState,
        },
        assets::load_default_pet_animation_set,
        lifecycle::NativePetLifecycleActionTargets,
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn manifest_only_wake_animation_set() -> (NativePetAnimationSet, NativePetAnimationTarget) {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future wake action",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": "future_wake_action",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future wake action");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_wake_action".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::Wake,
                local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future wake action loads");
        let key = NativePetAnimationKey::parse("future_wake_action").expect("valid key");
        let target = animations
            .animation_target_for_key(&key)
            .expect("future wake target exists");

        (animations, target)
    }

    #[test]
    fn lifecycle_tick_preserves_a_held_bridge_frame() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let mut playback = animations.playback_for_test_key("tap");
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            lifecycle_action_targets.idle(),
        ));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(0);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);

        playback.hold_last_frame(&animations);
        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 16,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(animations.manifest_key_for_playback(playback), "tap");
        assert_eq!(
            playback.frame_phase,
            animations.test_animation("tap").frame_count() - 1
        );
    }

    #[test]
    fn lifecycle_tick_applies_pending_request_after_manifest_only_wake_finishes() {
        let (animations, wake_target) = manifest_only_wake_animation_set();
        let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let mut playback = NativePetAnimationPlayback::from_target(wake_target);
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            animations.animation_target_for_test_key("working"),
        ));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(0);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 120,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(
            playback.animation_target(),
            animations.animation_target_for_test_key("working")
        );
    }

    #[test]
    fn lifecycle_tick_applies_sleep_request_after_manifest_only_wake_finishes() {
        let (animations, wake_target) = manifest_only_wake_animation_set();
        let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let mut playback = NativePetAnimationPlayback::from_target(wake_target);
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            lifecycle_action_targets.sleep(),
        ));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(0);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 120,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(
            playback.animation_target(),
            lifecycle_action_targets.sleep()
        );
    }

    #[test]
    fn lifecycle_tick_resets_idle_timer_after_wake_finishes() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let mut playback = animations.playback_for_test_key("wake");
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            lifecycle_action_targets.idle(),
        ));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(45_000);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 10_000,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });
        assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 16,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(idle_lifecycle_elapsed_ms.get(), 16);
        assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());
    }

    #[test]
    fn lifecycle_tick_finishes_sleep_enter_then_holds_sleep_until_wake_returns_idle() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let lifecycle_action_targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle action targets resolve");
        let mut playback = animations.playback_for_test_key("idle");
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            lifecycle_action_targets.idle(),
        ));
        let pointer_hovered = Cell::new(false);
        let idle_lifecycle_elapsed_ms = Cell::new(45_000);
        let idle_presence_schedule_seed = Cell::new(0);
        let task_presence_elapsed_ms = Cell::new(0);

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 16,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(
            playback.animation_target(),
            lifecycle_action_targets.sleep_enter()
        );
        assert_eq!(animations.frame_index(playback), 40);

        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: animations.test_animation("sleep_enter").total_duration_ms(),
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(
            playback.animation_target(),
            lifecycle_action_targets.sleep()
        );
        assert_eq!(animations.frame_index(playback), 43);

        pointer_hovered.set(true);
        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: 16,
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(playback.animation_target(), lifecycle_action_targets.wake());
        assert_eq!(animations.frame_index(playback), 44);

        pointer_hovered.set(false);
        native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
            playback: &mut playback,
            pet_animations: &animations,
            lifecycle_action_targets: &lifecycle_action_targets,
            requested_animation: &requested_animation,
            pointer_hovered: &pointer_hovered,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            idle_presence_schedule_seed: &idle_presence_schedule_seed,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            elapsed_ms: animations.test_animation("wake").total_duration_ms(),
            is_dragging: false,
            is_inertia_active: false,
            is_edge_runout_active: false,
            is_scripted_walk_active: false,
        });

        assert_eq!(playback.animation_target(), lifecycle_action_targets.idle());
        assert_eq!(animations.frame_index(playback), 0);
    }
}
