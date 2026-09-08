use super::*;
use crate::native_pet::process::step_protocol::{
    protocol_error_response_with_code, ExecuteStepPayload, ExecuteStepPlayback, ExecuteStepRequest,
    InterruptStepRequest, SidecarInterruptPolicy, SidecarInterruptReasonCode, SidecarStepErrorCode,
    SidecarStepResponse,
};

fn key(animation: &str) -> NativePetAnimationKey {
    NativePetAnimationKey::parse(animation).expect("valid manifest key")
}

#[test]
fn parses_native_pet_animation_control_message() {
    assert_eq!(
        parse_native_pet_control_message("animation:working"),
        Some(NativePetControlMessage::SetAnimation(key("working")))
    );
    assert_eq!(
        parse_native_pet_control_message("animation:unknown"),
        Some(NativePetControlMessage::SetAnimation(
            NativePetAnimationKey::parse("unknown").expect("valid manifest key")
        ))
    );
    assert_eq!(parse_native_pet_control_message("unknown"), None);
}

#[test]
fn parses_native_pet_animation_control_message_as_manifest_key() {
    assert_eq!(
        parse_native_pet_control_message("animation:future_clip"),
        Some(NativePetControlMessage::SetAnimation(
            NativePetAnimationKey::parse("future_clip").expect("valid manifest key")
        ))
    );
}

#[test]
fn compile_execute_step_control_message_preserves_manifest_animation_key() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000120".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000120".to_owned(),
        step: ExecuteStepPayload::PlayAction {
            animation: "future_clip".to_owned(),
            playback: ExecuteStepPlayback::Once { duration_ms: 1_720 },
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            completion_behavior:
                crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
            timeout_ms: 5_000,
        },
    };

    assert_eq!(
        compile_execute_step_control_message(&request).expect("compile playAction"),
        NativePetControlMessage::SetAnimation(
            NativePetAnimationKey::parse("future_clip").expect("valid manifest key")
        )
    );
}

#[test]
fn parses_native_pet_scripted_walk_control_messages() {
    assert_eq!(
        parse_native_pet_control_message("walk_to_edge:left:celebrate"),
        Some(NativePetControlMessage::WalkToEdge {
            edge: NativePetWalkEdge::Left,
            after: Some(key("celebrate"))
        })
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to_edge:right"),
        Some(NativePetControlMessage::WalkToEdge {
            edge: NativePetWalkEdge::Right,
            after: None
        })
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to:120:-40:curious"),
        Some(NativePetControlMessage::WalkToPosition {
            x: 120,
            y: -40,
            after: Some(key("curious"))
        })
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to_x:320:explain"),
        Some(NativePetControlMessage::WalkToX {
            x: 320,
            after: Some(key("explain"))
        })
    );

    assert_eq!(
        parse_native_pet_control_message("walk_to_edge:top:celebrate"),
        Some(NativePetControlMessage::WalkToEdge {
            edge: NativePetWalkEdge::Top,
            after: Some(key("celebrate"))
        })
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to_edge:bottom"),
        Some(NativePetControlMessage::WalkToEdge {
            edge: NativePetWalkEdge::Bottom,
            after: None
        })
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to_edge:diagonal:celebrate"),
        None
    );
    assert_eq!(
        parse_native_pet_control_message("walk_to_x:left:celebrate"),
        None
    );
}

#[test]
fn parses_native_pet_json_control_queries_and_targets() {
    assert_eq!(
        parse_native_pet_control_request_kind(r#"{"type":"reload_config"}"#),
        Some(NativePetControlRequestKind::ReloadConfig)
    );
    assert_eq!(
        parse_native_pet_control_request_kind(r#"{"type":"state"}"#),
        Some(NativePetControlRequestKind::QueryState)
    );
    assert_eq!(
        parse_native_pet_control_request_kind(r#"{"type":"capabilities"}"#),
        Some(NativePetControlRequestKind::QueryCapabilities)
    );
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"type":"move","target":{"kind":"center"},"after":"celebrate"}"#
        ),
        Some(NativePetControlRequestKind::Command(
            NativePetControlMessage::WalkToTarget {
                target: NativePetWalkTarget::Center,
                after: Some(key("celebrate")),
            }
        ))
    );
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"type":"move","target":{"kind":"edge","edge":"left"},"after":"sleep"}"#
        ),
        Some(NativePetControlRequestKind::Command(
            NativePetControlMessage::WalkToTarget {
                target: NativePetWalkTarget::Edge(NativePetWalkEdge::Left),
                after: Some(key("sleep")),
            }
        ))
    );
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"type":"move","target":{"kind":"position","x":120,"y":640}}"#
        ),
        Some(NativePetControlRequestKind::Command(
            NativePetControlMessage::WalkToTarget {
                target: NativePetWalkTarget::Position { x: 120, y: 640 },
                after: None,
            }
        ))
    );
}

#[test]
fn parses_execute_step_json_line_as_step_protocol_request() {
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"protocolVersion":1,"messageId":"message_019f4900-0000-7000-8000-000000000001","type":"executeStep","stepId":"step_019f4900-0000-7000-8000-000000000001","step":{"kind":"playAction","animation":"celebrate","playback":{"kind":"once","durationMs":1720},"interruptPolicy":"finishStep","completionBehavior":"restoreIdle","timeoutMs":5000}}"#
        ),
        Some(NativePetControlRequestKind::ExecuteStep(
            ExecuteStepRequest {
                protocol_version: 1,
                message_id: "message_019f4900-0000-7000-8000-000000000001".to_owned(),
                message_type: "executeStep".to_owned(),
                step_id: "step_019f4900-0000-7000-8000-000000000001".to_owned(),
                step: ExecuteStepPayload::PlayAction {
                    animation: "celebrate".to_owned(),
                    playback: ExecuteStepPlayback::Once { duration_ms: 1_720 },
                    interrupt_policy: SidecarInterruptPolicy::FinishStep,
                    completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
                    timeout_ms: 5_000,
                },
            }
        ))
    );
}

#[test]
fn parses_move_by_path_execute_step_json_line_as_step_protocol_request() {
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"protocolVersion":1,"messageId":"message_019f4900-0000-7000-8000-000000000003","type":"executeStep","stepId":"step_019f4900-0000-7000-8000-000000000003","step":{"kind":"moveByPath","path":[{"kind":"edge","edge":"left"},{"kind":"center"},{"kind":"position","x":320,"y":640}],"after":"sleep","interruptPolicy":"interruptible","timeoutMs":30000}}"#
        ),
        Some(NativePetControlRequestKind::ExecuteStep(
            ExecuteStepRequest {
                protocol_version: 1,
                message_id: "message_019f4900-0000-7000-8000-000000000003".to_owned(),
                message_type: "executeStep".to_owned(),
                step_id: "step_019f4900-0000-7000-8000-000000000003".to_owned(),
                step: ExecuteStepPayload::MoveByPath {
                    path: vec![
                        serde_json::json!({ "kind": "edge", "edge": "left" }),
                        serde_json::json!({ "kind": "center" }),
                        serde_json::json!({ "kind": "position", "x": 320, "y": 640 }),
                    ],
                    after: Some("sleep".to_owned()),
                    interrupt_policy: SidecarInterruptPolicy::Interruptible,
                    timeout_ms: 30_000,
                },
            }
        ))
    );
}

#[test]
fn compile_execute_step_control_message_compiles_move_by_path_points() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000004".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000004".to_owned(),
        step: ExecuteStepPayload::MoveByPath {
            path: vec![
                serde_json::json!({ "kind": "edge", "edge": "left" }),
                serde_json::json!({ "kind": "center" }),
            ],
            after: Some("sleep".to_owned()),
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 30_000,
        },
    };

    assert_eq!(
        compile_execute_step_control_message(&request).expect("compile moveByPath"),
        NativePetControlMessage::WalkByPath {
            path: vec![
                NativePetWalkTarget::Edge(NativePetWalkEdge::Left),
                NativePetWalkTarget::Center,
            ],
            after: Some(key("sleep")),
        }
    );
}

#[test]
fn compile_execute_step_control_message_compiles_window_anchor_target() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000005".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000005".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({
                "kind": "windowAnchor",
                "selector": { "kind": "activeWindow" },
                "edge": "left",
                "reveal": "head",
                "durationMs": 3000
            }),
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 18_000,
        },
    };

    assert_eq!(
        compile_execute_step_control_message(&request).expect("compile windowAnchor"),
        NativePetControlMessage::WalkToTarget {
            target: NativePetWalkTarget::WindowAnchor {
                selector: NativePetWindowAnchorSelector {
                    kind: NativePetWindowAnchorSelectorKind::ActiveWindow,
                },
                edge: NativePetWindowAnchorEdge::Left,
                reveal: NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            after: None,
        }
    );
}

#[test]
fn compile_execute_step_control_message_accepts_window_anchor_auto_edge() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000105".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000105".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({
                "kind": "windowAnchor",
                "selector": { "kind": "activeWindow" },
                "edge": "auto",
                "reveal": "head",
                "durationMs": 3000
            }),
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 18_000,
        },
    };

    assert_eq!(
        compile_execute_step_control_message(&request).expect("compile auto windowAnchor"),
        NativePetControlMessage::WalkToTarget {
            target: NativePetWalkTarget::WindowAnchor {
                selector: NativePetWindowAnchorSelector {
                    kind: NativePetWindowAnchorSelectorKind::ActiveWindow,
                },
                edge: NativePetWindowAnchorEdge::Auto,
                reveal: NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            after: None,
        }
    );
}

#[test]
fn compile_execute_step_control_message_compiles_edge_anchor_target() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000008".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000008".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({
                "kind": "edgeAnchor",
                "edge": "left",
                "reveal": "head",
                "durationMs": 1500
            }),
            after: Some("curious".to_owned()),
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 16_500,
        },
    };

    assert!(
        compile_execute_step_control_message(&request).is_ok(),
        "edgeAnchor target should compile through the native sidecar protocol"
    );
}

#[test]
fn compile_execute_step_control_message_rejects_invalid_window_anchor_before_capability_check() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000006".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000006".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({
                "kind": "windowAnchor",
                "selector": { "kind": "activeWindow" },
                "edge": "diagonal",
                "reveal": "head",
                "durationMs": 3000
            }),
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 18_000,
        },
    };

    let error = compile_execute_step_control_message(&request)
        .expect_err("invalid windowAnchor target should fail validation");

    assert_eq!(
        error.to_string(),
        "buddy state validation failed: invalid native pet executeStep move target"
    );
}

#[test]
fn compile_execute_step_control_message_compiles_window_anchor_in_move_by_path() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f4900-0000-7000-8000-000000000007".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f4900-0000-7000-8000-000000000007".to_owned(),
        step: ExecuteStepPayload::MoveByPath {
            path: vec![
                serde_json::json!({ "kind": "center" }),
                serde_json::json!({
                    "kind": "windowAnchor",
                    "selector": { "kind": "activeWindow" },
                    "edge": "left",
                    "reveal": "head",
                    "durationMs": 3000
                }),
            ],
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 30_000,
        },
    };

    assert_eq!(
        compile_execute_step_control_message(&request).expect("compile windowAnchor path"),
        NativePetControlMessage::WalkByPath {
            path: vec![
                NativePetWalkTarget::Center,
                NativePetWalkTarget::WindowAnchor {
                    selector: NativePetWindowAnchorSelector {
                        kind: NativePetWindowAnchorSelectorKind::ActiveWindow,
                    },
                    edge: NativePetWindowAnchorEdge::Left,
                    reveal: NativePetWindowAnchorReveal::Head,
                    duration_ms: 3000,
                },
            ],
            after: None,
        }
    );
}

#[test]
fn parses_interrupt_step_json_line_as_step_protocol_request() {
    assert_eq!(
        parse_native_pet_control_request_kind(
            r#"{"protocolVersion":1,"messageId":"message_019f4900-0000-7000-8000-000000000002","type":"interruptStep","stepId":"step_019f4900-0000-7000-8000-000000000002","reasonCode":"admission.preemptedByHigherPriorityPlan"}"#
        ),
        Some(NativePetControlRequestKind::InterruptStep(
            InterruptStepRequest {
                protocol_version: 1,
                message_id: "message_019f4900-0000-7000-8000-000000000002".to_owned(),
                message_type: "interruptStep".to_owned(),
                step_id: "step_019f4900-0000-7000-8000-000000000002".to_owned(),
                reason_code: SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
            }
        ))
    );
}

#[test]
fn stdin_interrupt_step_with_unknown_reason_code_returns_protocol_error() {
    assert_eq!(
        parse_native_pet_stdin_control_request_kind(
            r#"{"protocolVersion":1,"messageId":"message_019f4900-0000-7000-8000-000000000612","type":"interruptStep","stepId":"step_019f4900-0000-7000-8000-000000000612","reasonCode":"futureInterrupt"}"#
        ),
        Err(Box::new(SidecarStepResponse::ProtocolError(
            protocol_error_response_with_code(
                Some("step_019f4900-0000-7000-8000-000000000612"),
                SidecarStepErrorCode::InvalidStepProtocol,
                "buddy state validation failed: unsupported sidecar interrupt reason code: futureInterrupt",
            )
        )))
    );
}

#[test]
fn stdin_step_protocol_parse_error_returns_protocol_error_with_step_id() {
    assert_eq!(
        parse_native_pet_stdin_control_request_kind(
            r#"{"protocolVersion":999,"messageId":"message_019f4900-0000-7000-8000-000000000602","type":"executeStep","stepId":"step_019f4900-0000-7000-8000-000000000602","step":{"kind":"playAction","animation":"celebrate","playback":{"kind":"once","durationMs":1720},"timeoutMs":5000}}"#
        ),
        Err(Box::new(SidecarStepResponse::ProtocolError(
            protocol_error_response_with_code(
                Some("step_019f4900-0000-7000-8000-000000000602"),
                SidecarStepErrorCode::InvalidStepProtocol,
                "buddy state validation failed: unsupported sidecar protocol version: 999",
            )
        )))
    );
}

#[test]
fn stdin_unknown_step_protocol_type_returns_protocol_error() {
    assert_eq!(
        parse_native_pet_stdin_control_request_kind(
            r#"{"protocolVersion":1,"messageId":"message_019f4900-0000-7000-8000-000000000603","type":"teleportStep","stepId":"step_019f4900-0000-7000-8000-000000000603"}"#
        ),
        Err(Box::new(SidecarStepResponse::ProtocolError(
            protocol_error_response_with_code_for_correlation(
                Some("message_019f4900-0000-7000-8000-000000000603"),
                Some("step_019f4900-0000-7000-8000-000000000603"),
                SidecarStepErrorCode::InvalidStepProtocol,
                "buddy state validation failed: unsupported sidecar protocol request type: teleportStep",
            )
        )))
    );
}
