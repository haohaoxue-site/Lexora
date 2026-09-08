use super::{create_default_native_pet_drag_replay_samples, replay_native_pet_drag};
use crate::native_pet::{
    animation::{NativePetAnimationKey, NativePetAnimationSet, NativePetManifest},
    assets::load_default_pet_animation_set,
    coordinates::NativePetPosition,
    lifecycle::NativePetLifecycleActionTargets,
};

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

#[test]
fn verifies_bundled_high_refresh_drag_replay() {
    let report =
        super::create_native_pet_drag_replay_check_report().expect("drag replay must pass");
    let report = serde_json::to_value(report).unwrap();
    assert_eq!(report["ok"], true);
    assert_eq!(report["frameCount"], 96);
    assert_eq!(report["positionCommitCount"], 95);
    assert_eq!(report["maxFollowErrorPx"], 0.0);
    println!("{report}");
}

#[test]
fn replays_high_refresh_drag_without_lagging_behind_pointer() {
    let animations = load_default_pet_animation_set().expect("load animations");
    let lifecycle_action_targets =
        NativePetLifecycleActionTargets::load_bundled(&animations).expect("load action targets");
    let samples = create_default_native_pet_drag_replay_samples();
    let result = replay_native_pet_drag(
        &animations,
        NativePetPosition { x: 320, y: 240 },
        &samples,
        animations.animation_target_for_test_key("drag"),
        lifecycle_action_targets.idle(),
    )
    .expect("replay drag");

    assert_eq!(result.frame_count, 96);
    assert_eq!(result.position_commit_count, 95);
    assert!(result.max_follow_error_px <= 0.5);
    assert!(result.drag_animation_frame_changes >= 5);
}

#[test]
fn replay_uses_registry_resolved_fallback_target_when_drag_animation_completes() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    let animations_json = manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array");
    let drag_json = animations_json
        .iter_mut()
        .find(|animation| animation["name"] == "drag")
        .expect("manifest has drag animation");
    drag_json["loop"] = serde_json::Value::Bool(false);
    drag_json["frames"] = serde_json::json!([{ "index": 0, "durationMs": 1 }]);
    animations_json.push(serde_json::json!({
        "description": "Fixture manifest-only idle fallback",
        "frames": [{ "index": 0, "durationMs": 120 }],
        "loop": true,
        "name": "future_idle_replay",
        "row": 0,
    }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with fixture fallback");
    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("fixture animation set loads");
    let fallback_key =
        NativePetAnimationKey::parse("future_idle_replay").expect("valid animation key");
    let fallback_target = animations
        .animation_target_for_key(&fallback_key)
        .expect("fixture fallback target exists");
    let samples = create_default_native_pet_drag_replay_samples();

    let result = replay_native_pet_drag(
        &animations,
        NativePetPosition { x: 320, y: 240 },
        &samples,
        animations.animation_target_for_test_key("drag"),
        fallback_target,
    )
    .expect("replay drag");

    assert_eq!(result.final_animation, fallback_target);
}

#[test]
fn replay_uses_registry_resolved_drag_target_during_drag() {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture manifest-only drag",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": true,
            "name": "future_drag_replay",
            "row": 0,
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest parses with fixture drag");
    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("fixture animation set loads");
    let drag_key = NativePetAnimationKey::parse("future_drag_replay").expect("valid key");
    let drag_target = animations
        .animation_target_for_key(&drag_key)
        .expect("fixture drag target exists");
    let lifecycle_action_targets =
        NativePetLifecycleActionTargets::load_bundled(&animations).expect("load action targets");
    let samples = create_default_native_pet_drag_replay_samples();

    let result = replay_native_pet_drag(
        &animations,
        NativePetPosition { x: 320, y: 240 },
        &samples,
        drag_target,
        lifecycle_action_targets.idle(),
    )
    .expect("replay drag");

    assert_eq!(result.final_animation, drag_target);
}
