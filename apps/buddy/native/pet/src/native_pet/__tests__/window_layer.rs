use super::*;
use crate::native_pet::coordinates::NativePetPosition;

#[test]
fn keeps_default_layer_without_scripted_window_composition() {
    assert_eq!(
        native_pet_layer_for_scripted_walk(NativePetLayer::AlwaysOnTop, None),
        NativePetLayer::AlwaysOnTop
    );
}

#[test]
fn uses_normal_layer_while_scripted_walk_hides_behind_active_window() {
    let state = NativePetScriptedWalkState::path(
        vec![NativePetPosition { x: 320, y: 410 }],
        None,
        NativePetScriptedWalkComposition::BehindActiveWindow,
    )
    .expect("scripted walk state");

    assert_eq!(
        native_pet_layer_for_scripted_walk(NativePetLayer::AlwaysOnTop, Some(&state)),
        NativePetLayer::Normal
    );
}
