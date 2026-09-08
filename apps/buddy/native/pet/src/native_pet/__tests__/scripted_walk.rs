use super::*;
use crate::native_pet::animation::{
    NativePetAnimationKey, NativePetAnimationSet, NativePetManifest,
};
use crate::native_pet::assets::load_default_pet_animation_set;
use crate::native_pet::lifecycle::NativePetMovementActionTargets;
use crate::native_pet::process::NativePetWindowAnchorEdge;

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../packages/assets/buddy/pets/default/manifest.json");

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

fn animations_with_manifest_only_target(
    animation_name: &str,
) -> (NativePetAnimationSet, NativePetAnimationTarget) {
    let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest parses");
    manifest_json["animations"]
        .as_array_mut()
        .expect("manifest animations are an array")
        .push(serde_json::json!({
            "description": "Fixture manifest-only animation",
            "frames": [{ "index": 0, "durationMs": 120 }],
            "loop": false,
            "name": animation_name,
            "row": 0,
        }));
    let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
        .expect("native pet animation manifest value parses");
    let animations =
        NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
    let target = animation_target(&animations, animation_name);

    (animations, target)
}

#[test]
fn advances_toward_target_with_directional_run_animation() {
    let animations = default_animations();
    let movement_targets = movement_targets(&animations);
    let step = native_pet_step_scripted_walk(
        &movement_targets,
        NativePetPosition { x: 400, y: 700 },
        NativePetPosition { x: 0, y: 700 },
        100,
    );

    assert_eq!(step.animation, movement_targets.run_left());
    assert!(!step.finished);
    assert!(step.position.x < 400);
    assert_eq!(step.position.y, 700);
    assert!(step.movement_dx < 0.0);
}

#[test]
fn scripted_walk_uses_resolved_directional_run_target() {
    let (animations, run_left) = animations_with_manifest_only_target("future_run_left");
    let bundled_targets = movement_targets(&animations);
    let movement_targets = bundled_targets.with_run_targets(run_left, bundled_targets.run_right());

    let step = native_pet_step_scripted_walk(
        &movement_targets,
        NativePetPosition { x: 400, y: 700 },
        NativePetPosition { x: 0, y: 700 },
        100,
    );

    assert_eq!(step.animation, run_left);
}

#[test]
fn finishes_when_next_step_reaches_target() {
    let animations = default_animations();
    let movement_targets = movement_targets(&animations);
    let step = native_pet_step_scripted_walk(
        &movement_targets,
        NativePetPosition { x: 0, y: 700 },
        NativePetPosition { x: 24, y: 700 },
        100,
    );

    assert_eq!(step.animation, movement_targets.run_right());
    assert!(step.finished);
    assert_eq!(step.position, NativePetPosition { x: 24, y: 700 });
}

#[test]
fn scripted_walk_resets_requested_animation_to_registry_target() {
    let (animations, reset_animation) = animations_with_manifest_only_target("future_idle_reset");
    let inertia_state = RefCell::new(None);
    let edge_runout_state = Cell::new(None);
    let idle_lifecycle_elapsed_ms = Cell::new(25);
    let task_presence_elapsed_ms = Cell::new(25);
    let requested_animation = Cell::new(NativePetRequestedAnimationState::from(animation_target(
        &animations,
        "celebrate",
    )));
    let scripted_walk_state = RefCell::new(None);

    native_pet_reset_scripted_walk_runtime_state(&NativePetScriptedWalkRuntimeState {
        inertia_state: &inertia_state,
        edge_runout_state: &edge_runout_state,
        idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
        task_presence_elapsed_ms: &task_presence_elapsed_ms,
        requested_animation: &requested_animation,
        requested_reset_animation: reset_animation,
        scripted_walk_state: &scripted_walk_state,
    });

    assert_eq!(
        requested_animation.get().animation_target(),
        reset_animation
    );
    assert_eq!(idle_lifecycle_elapsed_ms.get(), 0);
    assert_eq!(task_presence_elapsed_ms.get(), 0);
}

#[test]
fn edge_targets_keep_pet_fully_visible() {
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: -144, y: 990 };

    assert_eq!(
        native_pet_visible_walk_edge_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkEdge::Left,
            bounds,
            24,
        ),
        NativePetPosition { x: 24, y: 836 }
    );
    assert_eq!(
        native_pet_visible_walk_edge_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkEdge::Right,
            bounds,
            24,
        ),
        NativePetPosition { x: 1656, y: 836 }
    );
    assert_eq!(
        native_pet_visible_walk_edge_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkEdge::Top,
            bounds,
            24,
        ),
        NativePetPosition { x: 24, y: 24 }
    );
    assert_eq!(
        native_pet_visible_walk_edge_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkEdge::Bottom,
            bounds,
            24,
        ),
        NativePetPosition { x: 24, y: 836 }
    );
}

#[test]
fn edge_anchor_targets_leave_only_head_visible_from_screen_edge() {
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 480, y: 520 };

    assert_eq!(
        native_pet_visible_walk_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkTarget::EdgeAnchor {
                edge: NativePetWalkEdge::Left,
                reveal: crate::native_pet::process::NativePetAnchorReveal::Head,
                duration_ms: 1500,
            },
            bounds,
            24,
        ),
        NativePetPosition { x: -144, y: 520 }
    );
    assert_eq!(
        native_pet_visible_walk_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkTarget::EdgeAnchor {
                edge: NativePetWalkEdge::Bottom,
                reveal: crate::native_pet::process::NativePetAnchorReveal::Head,
                duration_ms: 1500,
            },
            bounds,
            24,
        ),
        NativePetPosition { x: 480, y: 944 }
    );
}

#[test]
fn named_targets_resolve_inside_visible_bounds() {
    let bounds = NativePetLogicalRect::new(0, 40, 2560, 1400);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 1200, y: 700 };

    assert_eq!(
        native_pet_visible_walk_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkTarget::Center,
            bounds,
            24,
        ),
        NativePetPosition { x: 1160, y: 650 }
    );
    assert_eq!(
        native_pet_visible_walk_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkTarget::Home,
            bounds,
            24,
        ),
        NativePetPosition { x: 2296, y: 1236 }
    );
    assert_eq!(
        native_pet_visible_walk_target_position_for_bounds(
            current_position,
            window_size,
            NativePetWalkTarget::Position { x: -900, y: 3000 },
            bounds,
            24,
        ),
        NativePetPosition { x: 24, y: 1236 }
    );
}

#[test]
fn window_anchor_targets_resolve_against_active_window_rect() {
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 1200, y: 700 };

    let position = native_pet_visible_walk_target_position_for_bounds_with_active_window(
        current_position,
        window_size,
        NativePetWalkTarget::WindowAnchor {
            selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
            edge: NativePetWindowAnchorEdge::Left,
            reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
            duration_ms: 3000,
        },
        bounds,
        24,
        Some(NativePetLogicalRect::new(400, 200, 800, 600)),
    )
    .expect("resolve window anchor");

    assert_eq!(position, NativePetPosition { x: 320, y: 410 });
}

#[test]
fn window_anchor_rejects_active_window_rect_outside_workarea() {
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 1200, y: 700 };

    let error = native_pet_visible_walk_target_position_for_bounds_with_active_window(
        current_position,
        window_size,
        NativePetWalkTarget::WindowAnchor {
            selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
            edge: NativePetWindowAnchorEdge::Left,
            reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
            duration_ms: 3000,
        },
        bounds,
        24,
        Some(NativePetLogicalRect::new(2200, 200, 800, 600)),
    )
    .unwrap_err();

    assert!(matches!(
        error,
        BuddyError::Runtime(message)
            if message == "native pet active window rect is unavailable"
    ));
}

#[test]
fn window_anchor_rejects_explicit_edge_when_head_reveal_would_be_clamped() {
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 1200, y: 700 };

    let error = native_pet_visible_walk_target_position_for_bounds_with_active_window(
        current_position,
        window_size,
        NativePetWalkTarget::WindowAnchor {
            selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
            edge: NativePetWindowAnchorEdge::Left,
            reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
            duration_ms: 3000,
        },
        bounds,
        24,
        Some(NativePetLogicalRect::new(20, 200, 800, 600)),
    )
    .unwrap_err();

    assert!(matches!(
        error,
        BuddyError::Runtime(message)
            if message == "native pet active window rect is unavailable"
    ));
}

#[test]
fn window_anchor_targets_request_active_window_rect_from_provider() {
    let window_size = NativePetLogicalSize::new(240, 180);
    let current_position = NativePetPosition { x: 1200, y: 700 };
    let mut requested_active_window = false;

    let position = native_pet_visible_walk_target_position_for_bounds_with_window_provider(
        current_position,
        window_size,
        NativePetWalkTarget::WindowAnchor {
            selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
            edge: NativePetWindowAnchorEdge::Left,
            reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
            duration_ms: 3000,
        },
        NativePetLogicalRect::new(0, 0, 1920, 1040),
        24,
        &mut |selector| {
            requested_active_window = selector.kind()
                == crate::native_pet::process::NativePetWindowAnchorSelectorKind::ActiveWindow;
            Ok(Some(NativePetLogicalRect::new(400, 200, 800, 600)))
        },
    )
    .expect("resolve window anchor");

    assert!(requested_active_window);
    assert_eq!(position, NativePetPosition { x: 320, y: 410 });
}

#[test]
fn scripted_walk_path_advances_to_next_target_before_finishing() {
    let animations = default_animations();
    let after_animation = Some(animation_target(&animations, "sleep"));
    let mut state = NativePetScriptedWalkState::path(
        vec![
            NativePetPosition { x: 24, y: 700 },
            NativePetPosition { x: 240, y: 700 },
        ],
        after_animation,
        NativePetScriptedWalkComposition::Default,
    )
    .expect("path state");

    assert_eq!(state.target_position, NativePetPosition { x: 24, y: 700 });
    assert!(state.advance_to_next_target());
    assert_eq!(state.target_position, NativePetPosition { x: 240, y: 700 });
    assert!(!state.advance_to_next_target());
    assert_eq!(state.after_animation, after_animation);
}

#[test]
fn window_anchor_targets_request_behind_active_window_composition() {
    assert_eq!(
        native_pet_walk_target_composition(NativePetWalkTarget::WindowAnchor {
            selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
            edge: NativePetWindowAnchorEdge::Left,
            reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
            duration_ms: 3000,
        }),
        NativePetScriptedWalkComposition::BehindActiveWindow
    );
}

#[test]
fn path_targets_request_behind_active_window_composition_when_any_point_uses_window_anchor() {
    assert_eq!(
        native_pet_walk_path_composition(&[
            NativePetWalkTarget::Center,
            NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Right,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
        ]),
        NativePetScriptedWalkComposition::BehindActiveWindow
    );
}

#[test]
fn window_anchor_duration_holds_scripted_walk_after_arrival() {
    let mut state = NativePetScriptedWalkState::single(
        NativePetPosition { x: 320, y: 410 },
        None,
        NativePetScriptedWalkComposition::BehindActiveWindow,
        3000,
    );

    assert_eq!(
        state.advance_after_arrival(1000),
        NativePetScriptedWalkArrival::Holding
    );
    assert_eq!(
        state.target_position(),
        NativePetPosition { x: 320, y: 410 }
    );
    assert_eq!(
        state.advance_after_arrival(1999),
        NativePetScriptedWalkArrival::Holding
    );
    assert_eq!(
        state.advance_after_arrival(1),
        NativePetScriptedWalkArrival::Finished
    );
}
