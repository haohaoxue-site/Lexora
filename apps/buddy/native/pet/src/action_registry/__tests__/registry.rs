use std::collections::HashSet;

use serde_json::json;

use super::{
    ActionRegistry, ActionRegistryDocument, RuntimeManifest, DEFAULT_ACTION_REGISTRY,
    DEFAULT_PET_MANIFEST,
};
use crate::action_registry::affective_types::{
    AffectiveContext, AffectiveContextSource, AffectiveEnergy, AffectiveMood, ResolveContext,
};

#[test]
fn resolve_play_action_selects_alias_candidate_from_affective_context() {
    let registry = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "selector-test",
            "actions": [
                action_entry(
                    "move.run",
                    "run_right",
                    vec!["move"],
                    vec!["happy"],
                    vec!["high"],
                    20,
                ),
                action_entry(
                    "move.walk",
                    "sad",
                    vec!["move"],
                    vec!["sad"],
                    vec!["low"],
                    10,
                )
            ]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 2 },
            "animations": [
                {
                    "name": "run_right",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": true
                },
                {
                    "name": "sad",
                    "fps": 5,
                    "frames": [2],
                    "loop": true
                }
            ]
        })
        .to_string(),
    )
    .expect("load selector registry");

    let happy_resolution = registry
        .resolve_play_action(
            "move",
            &resolve_context(AffectiveMood::Happy, AffectiveEnergy::High),
        )
        .expect("resolve happy move");
    let sad_resolution = registry
        .resolve_play_action(
            "move",
            &resolve_context(AffectiveMood::Sad, AffectiveEnergy::Low),
        )
        .expect("resolve sad move");

    assert_eq!(happy_resolution.action_id, "move.run");
    assert_eq!(happy_resolution.animation_ref, "run_right");
    assert_eq!(sad_resolution.action_id, "move.walk");
    assert_eq!(sad_resolution.animation_ref, "sad");
}

#[test]
fn resolve_play_action_uses_registry_fallback_chain_for_unsupported_capability() {
    let mut cast_entry = one_shot_action_entry("cast", "explain", true);
    cast_entry["requiredCapabilities"] = json!(["particleEffects"]);
    cast_entry["fallbackChain"] = json!(["celebrate"]);

    let registry = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "registry-fallback-test",
            "actions": [
                cast_entry,
                one_shot_action_entry("celebrate", "celebrate", true)
            ]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 2 },
            "animations": [
                {
                    "name": "explain",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": false
                },
                {
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [2, 3],
                    "loop": false
                }
            ]
        })
        .to_string(),
    )
    .expect("load registry fallback test registry");
    let resolve_context = resolve_context(AffectiveMood::Neutral, AffectiveEnergy::Medium)
        .with_unsupported_capability("particleEffects");

    let resolution = registry
        .resolve_play_action("cast", &resolve_context)
        .expect("resolve through registry fallback");

    assert_eq!(resolution.action_id, "celebrate");
    assert_eq!(
        serde_json::to_value(&resolution.fallback).expect("serialize fallback"),
        json!({
            "requestedActionId": "cast",
            "fallbackActionId": "celebrate",
            "reasonCode": "fallback.registrySelected",
            "unsupportedCapability": "particleEffects"
        })
    );
}

#[test]
fn bundled_action_registry_covers_every_runtime_animation() {
    let registry = serde_json::from_str::<ActionRegistryDocument>(DEFAULT_ACTION_REGISTRY)
        .expect("parse bundled action registry");
    let manifest = serde_json::from_str::<RuntimeManifest>(DEFAULT_PET_MANIFEST)
        .expect("parse bundled runtime manifest");
    let registered_animation_refs = registry
        .actions
        .iter()
        .map(|action| action.animation_ref.as_str())
        .collect::<HashSet<_>>();
    let missing_animation_refs = manifest
        .animations
        .iter()
        .filter_map(|animation| {
            (!registered_animation_refs.contains(animation.name.as_str()))
                .then_some(animation.name.as_str())
        })
        .collect::<Vec<_>>();

    assert!(
        missing_animation_refs.is_empty(),
        "action registry is missing runtime animation refs: {missing_animation_refs:?}"
    );
}

#[test]
fn action_registry_rejects_once_action_for_looping_manifest_animation() {
    let action = one_shot_action_entry("celebrate", "celebrate", true);
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "once-loop-mismatch-test",
            "actions": [action]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 1 },
            "animations": [{
                "name": "celebrate",
                "fps": 10,
                "frames": [0, 1],
                "loop": true
            }]
        })
        .to_string(),
    )
    .expect_err("once action must reject a looping manifest animation");

    assert!(
        error
            .to_string()
            .contains("once action requires a non-looping manifest animation"),
        "unexpected error: {error}"
    );
}

#[test]
fn action_registry_rejects_loop_action_for_non_looping_manifest_animation() {
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "loop-once-mismatch-test",
            "actions": [action_entry(
                "run.right",
                "run_right",
                vec!["run"],
                vec!["neutral"],
                vec!["medium"],
                10,
            )]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 1 },
            "animations": [{
                "name": "run_right",
                "fps": 10,
                "frames": [0, 1],
                "loop": false
            }]
        })
        .to_string(),
    )
    .expect_err("loop action must reject a non-looping manifest animation");

    assert!(
        error
            .to_string()
            .contains("loop action requires a looping manifest animation"),
        "unexpected error: {error}"
    );
}

#[test]
fn action_registry_rejects_finish_step_once_without_finite_runtime_profile() {
    let action = one_shot_action_entry("celebrate", "celebrate", false);
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "once-runtime-profile-test",
            "actions": [action]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 1 },
            "animations": [{
                "name": "celebrate",
                "fps": 10,
                "frames": [0, 1],
                "loop": false
            }]
        })
        .to_string(),
    )
    .expect_err("finishStep once action must require a finite runtime profile");

    assert!(
        error
            .to_string()
            .contains("finishStep once action requires finiteScriptedAction"),
        "unexpected error: {error}"
    );
}

#[test]
fn action_registry_rejects_finite_runtime_profile_without_completion_fallback() {
    let mut action = one_shot_action_entry("celebrate", "celebrate", true);
    action["runtimeProfile"]["completionFallback"] = json!("default");
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "finite-fallback-test",
            "actions": [action]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 2, "rows": 1 },
            "animations": [{
                "name": "celebrate",
                "fps": 10,
                "frames": [0, 1],
                "loop": false
            }]
        })
        .to_string(),
    )
    .expect_err("finite runtime profile must require an explicit completion fallback");

    assert!(
        error
            .to_string()
            .contains("finiteScriptedAction requires an explicit completionFallback"),
        "unexpected error: {error}"
    );
}

#[test]
fn action_registry_rejects_manifest_animation_keys_that_runtime_cannot_address() {
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "invalid-animation-key-test",
            "actions": [
                action_entry(
                    "future.clip",
                    "Future Clip!",
                    vec!["future"],
                    vec!["neutral"],
                    vec!["medium"],
                    10,
                )
            ]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 1, "rows": 1 },
            "animations": [
                {
                    "name": "Future Clip!",
                    "fps": 10,
                    "frames": [0],
                    "loop": false
                }
            ]
        })
        .to_string(),
    )
    .expect_err("registry should reject manifest keys outside control protocol");

    assert_eq!(
        error.to_string(),
        "runtime failed: runtime manifest has invalid animation key: Future Clip!"
    );
}

#[test]
fn action_registry_rejects_unknown_fallback_action_refs() {
    let mut entry = action_entry(
        "cast",
        "explain",
        vec!["magic"],
        vec!["neutral"],
        vec!["medium"],
        20,
    );
    entry["fallbackChain"] = json!(["missing.action"]);

    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "unknown-fallback-test",
            "actions": [entry]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 1, "rows": 1 },
            "animations": [
                {
                    "name": "explain",
                    "fps": 10,
                    "frames": [0],
                    "loop": true
                }
            ]
        })
        .to_string(),
    )
    .expect_err("registry should reject fallback refs that do not resolve to actions");

    assert_eq!(
        error.to_string(),
        "runtime failed: action registry fallbackChain references unknown action: cast -> missing.action"
    );
}

#[test]
fn action_registry_rejects_unknown_action_entry_fields() {
    let mut entry = action_entry(
        "celebrate",
        "celebrate",
        vec!["success"],
        vec!["neutral"],
        vec!["medium"],
        10,
    );
    entry["motionStyle"] = json!("big-step");

    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "strict-action-entry-test",
            "actions": [entry]
        })
        .to_string(),
        &json!({
            "sheet": { "columns": 1, "rows": 1 },
            "animations": [
                {
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [0],
                    "loop": false
                }
            ]
        })
        .to_string(),
    )
    .expect_err("registry should reject fields outside the action entry schema");

    assert!(
        error.to_string().contains("unknown field"),
        "unexpected error: {error}"
    );
}

#[test]
fn action_registry_rejects_unknown_runtime_manifest_frame_fields() {
    let error = ActionRegistry::from_documents(
        &json!({
            "registryVersion": "strict-runtime-manifest-test",
            "actions": [
                action_entry(
                    "celebrate",
                    "celebrate",
                    vec!["success"],
                    vec!["neutral"],
                    vec!["medium"],
                    10,
                )
            ]
        })
        .to_string(),
        &json!({
            "id": "test-pet",
            "name": "Test Pet",
            "kind": "sprite-sheet",
            "source": "test",
            "image": "spritesheet.webp",
            "frame": { "width": 192, "height": 208 },
            "sheet": { "columns": 1, "rows": 1 },
            "animations": [
                {
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [
                        { "index": 0, "durationMs": 100, "easing": "easeOut" }
                    ],
                    "loop": false
                }
            ]
        })
        .to_string(),
    )
    .expect_err("registry should reject manifest frame fields outside runtime asset schema");

    assert!(
        error.to_string().contains("data did not match any variant"),
        "unexpected error: {error}"
    );
}

fn resolve_context(mood: AffectiveMood, energy: AffectiveEnergy) -> ResolveContext {
    ResolveContext {
        affective_context: AffectiveContext { mood, energy },
        affective_context_source: AffectiveContextSource::StateFile,
        unsupported_capabilities: Vec::new(),
    }
}

fn action_entry(
    action_id: &str,
    animation_ref: &str,
    aliases: Vec<&str>,
    moods: Vec<&str>,
    energies: Vec<&str>,
    deterministic_sort_weight: i64,
) -> serde_json::Value {
    json!({
        "actionId": action_id,
        "animationRef": animation_ref,
        "aliases": aliases,
        "category": "locomotion",
        "playbackKind": "loopForDuration",
        "placement": "currentPosition",
        "movement": "locomotion",
        "startPose": "idleCompatible",
        "endPose": "idleCompatible",
        "idleCompatible": true,
        "facing": "right",
        "locomotionProfile": { "speed": "test" },
        "interruptPolicy": "interruptible",
        "fallbackChain": [],
        "moodEnergyAffinity": {
            "mood": moods,
            "energy": energies
        },
        "aiVisibility": "macroOnly",
        "presetVisibility": "enabled",
        "requiredCapabilities": [],
        "deterministicSortWeight": deterministic_sort_weight,
        "runtimeProfile": {
            "renderProfile": "runRight",
            "localInteractionProfile": "none",
            "completionFallback": "default"
        }
    })
}

fn one_shot_action_entry(
    action_id: &str,
    animation_ref: &str,
    finite_runtime_profile: bool,
) -> serde_json::Value {
    let mut action = action_entry(
        action_id,
        animation_ref,
        vec!["reaction"],
        vec!["neutral"],
        vec!["medium"],
        10,
    );
    action["category"] = json!("oneShotReaction");
    action["playbackKind"] = json!("once");
    action["movement"] = json!("none");
    action["locomotionProfile"] = serde_json::Value::Null;
    action["interruptPolicy"] = json!("finishStep");
    action["runtimeProfile"] = if finite_runtime_profile {
        json!({
            "renderProfile": "celebrate",
            "localInteractionProfile": "finiteScriptedAction",
            "completionFallback": "idle"
        })
    } else {
        json!({
            "renderProfile": "celebrate",
            "localInteractionProfile": "none"
        })
    };
    action
}
