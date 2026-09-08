use super::{parse_step_protocol_request, SidecarInterruptPolicy, SidecarStepErrorCode};

#[test]
fn sidecar_step_error_code_exposes_stable_wire_values() {
    assert_eq!(
        SidecarStepErrorCode::InvalidStepProtocol.as_str(),
        "invalidStepProtocol"
    );
    assert_eq!(
        SidecarStepErrorCode::InvalidExecuteStep.as_str(),
        "invalidExecuteStep"
    );
    assert_eq!(
        SidecarStepErrorCode::UnsupportedStepCapability.as_str(),
        "unsupportedStepCapability"
    );
    assert_eq!(
        SidecarStepErrorCode::MotionTimeout.as_str(),
        "motionTimeout"
    );
    assert_eq!(
        SidecarStepErrorCode::TargetUnavailable.as_str(),
        "targetUnavailable"
    );
    assert_eq!(
        SidecarStepErrorCode::InterruptRejected.as_str(),
        "interruptRejected"
    );
}

#[test]
fn sidecar_interrupt_policy_exposes_stable_wire_values() {
    assert_eq!(
        SidecarInterruptPolicy::Interruptible.as_str(),
        "interruptible"
    );
    assert_eq!(SidecarInterruptPolicy::FinishStep.as_str(), "finishStep");
    assert_eq!(
        SidecarInterruptPolicy::UninterruptibleShort.as_str(),
        "uninterruptibleShort"
    );
}

#[test]
fn parse_step_protocol_request_rejects_unknown_fields() {
    let cases = [
        (
            "top-level field",
            r#"{"protocolVersion":1,"messageId":"message_019f5600-0000-7000-8000-000000000001","type":"queryState","requestId":"state_019f5600-0000-7000-8000-000000000001","debug":true}"#,
        ),
        (
            "executeStep field",
            r#"{"protocolVersion":1,"messageId":"message_019f5600-0000-7000-8000-000000000002","type":"executeStep","stepId":"step_019f5600-0000-7000-8000-000000000002","step":{"kind":"playAction","animation":"celebrate","playback":{"kind":"once","durationMs":1720},"interruptPolicy":"finishStep","timeoutMs":5000,"debug":true}}"#,
        ),
    ];

    for (label, request) in cases {
        let Err(error) = parse_step_protocol_request(request) else {
            panic!("unknown {label} should be rejected");
        };

        assert!(
            error.to_string().contains("unknown field `debug`"),
            "unexpected error for {label}: {error}"
        );
    }
}
