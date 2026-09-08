use super::*;

#[test]
fn state_response_accepts_manifest_key_for_requested_animation() {
    let snapshot = NativePetControlStateSnapshot {
        current_position: NativePetPosition { x: 12, y: 34 },
        current_monitor_index: None,
        window_size: NativePetLogicalSize::new(192, 208),
        current_animation: "future_clip".to_owned(),
        requested_animation: "future_clip".to_owned(),
        scripted_walk_state: None,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_local_interaction_active: false,
    };
    let response =
        native_pet_control_state_response_with_monitor(snapshot, serde_json::Value::Null);

    assert_eq!(response["animation"]["requested"], "future_clip");
}

#[test]
fn state_response_reports_local_interaction_active() {
    let snapshot = NativePetControlStateSnapshot {
        current_position: NativePetPosition { x: 12, y: 34 },
        current_monitor_index: None,
        window_size: NativePetLogicalSize::new(192, 208),
        current_animation: "fallen_idle_left".to_owned(),
        requested_animation: "idle".to_owned(),
        scripted_walk_state: None,
        is_dragging: false,
        is_inertia_active: false,
        is_edge_runout_active: false,
        is_local_interaction_active: true,
    };
    let response =
        native_pet_control_state_response_with_monitor(snapshot, serde_json::Value::Null);

    assert_eq!(response["interaction"]["active"], true);
}
