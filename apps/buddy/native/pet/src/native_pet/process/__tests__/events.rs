use super::{format_native_pet_sidecar_event, NativePetPresetBehaviorEvent, NativePetSidecarEvent};
use crate::native_pet::step_protocol::{
    protocol_error_response_for_correlation, state_snapshot_response_for_correlation,
    step_completed_response_for_correlation, SidecarStepErrorCode, SidecarStepResponse,
};

#[test]
fn formats_ready_and_open_chat_events() {
    assert_eq!(
        format_native_pet_sidecar_event(&NativePetSidecarEvent::Ready).unwrap(),
        "event:ready"
    );
    assert_eq!(
        format_native_pet_sidecar_event(&NativePetSidecarEvent::OpenChat).unwrap(),
        "event:open_chat"
    );
}

#[test]
fn formats_preset_behavior_event_with_stable_fields() {
    let event = NativePetSidecarEvent::PresetBehavior(NativePetPresetBehaviorEvent {
        preset_behavior_id: "throw_after_drag".to_owned(),
        interaction_id: Some("interaction_1".to_owned()),
        outcome: "fall".to_owned(),
        animation: "trip_fall_left".to_owned(),
    });
    assert_eq!(
        format_native_pet_sidecar_event(&event).unwrap(),
        r#"event:preset_behavior:{"presetBehaviorId":"throw_after_drag","interactionId":"interaction_1","outcome":"fall","animation":"trip_fall_left"}"#
    );
}

#[test]
fn formats_step_response_with_matching_correlation() {
    let event = NativePetSidecarEvent::StepResponse(SidecarStepResponse::StepCompleted(
        step_completed_response_for_correlation("message_1", "step_1", 1720),
    ));
    let value: serde_json::Value =
        serde_json::from_str(&format_native_pet_sidecar_event(&event).unwrap()).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "protocolVersion": 1, "correlationId": "message_1", "type": "stepCompleted",
            "stepId": "step_1", "elapsedMs": 1720,
        })
    );
}

#[test]
fn formats_state_snapshot_with_signed_coordinates() {
    let event = NativePetSidecarEvent::StateSnapshot(state_snapshot_response_for_correlation(
        "message_1",
        "state_1",
        -120,
        640,
    ));
    let value: serde_json::Value =
        serde_json::from_str(&format_native_pet_sidecar_event(&event).unwrap()).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "protocolVersion": 1, "correlationId": "message_1", "type": "stateSnapshot",
            "requestId": "state_1", "position": { "x": -120, "y": 640 },
        })
    );
}

#[test]
fn formats_protocol_errors_without_inventing_request_identifiers() {
    let event = NativePetSidecarEvent::StepResponse(SidecarStepResponse::ProtocolError(
        protocol_error_response_for_correlation(
            None,
            None,
            SidecarStepErrorCode::InvalidStepProtocol,
            "invalid request",
        ),
    ));
    let value: serde_json::Value =
        serde_json::from_str(&format_native_pet_sidecar_event(&event).unwrap()).unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "protocolVersion": 1, "correlationId": null, "type": "protocolError",
            "stepId": null, "code": "invalidStepProtocol", "message": "invalid request",
        })
    );
}
