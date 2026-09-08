use crate::native_pet::step_protocol::{
    motion_timeout_step_failed_response, step_completed_response, step_interrupted_response,
    ExecuteStepPayload, ExecuteStepPlayback, ExecuteStepRequest, SidecarInterruptPolicy,
    SidecarInterruptReasonCode, SidecarPlayActionCompletionBehavior, SidecarStepResponse,
};

use super::{
    native_pet_active_play_action_completion_behavior, native_pet_active_step_is_play_action,
    native_pet_advance_active_step, native_pet_complete_active_step,
    native_pet_interrupt_active_step, native_pet_interrupt_active_step_for_local_interaction,
    native_pet_play_action_completion_behavior_for_response,
    native_pet_start_active_step_for_execute_step, NativePetActiveStepState,
};

#[test]
fn timed_active_step_completes_after_declared_duration() {
    let mut active_step = Some(NativePetActiveStepState::timed(
        "step_019f5000-0000-7000-8000-000000000001",
        300,
    ));

    assert_eq!(native_pet_advance_active_step(&mut active_step, 120), None);
    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 180),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5000-0000-7000-8000-000000000001",
            300,
        )))
    );
    assert_eq!(active_step, None);
}

#[test]
fn signaled_active_step_completes_with_accumulated_elapsed() {
    let mut active_step = Some(NativePetActiveStepState::signaled(
        "step_019f5000-0000-7000-8000-000000000002",
    ));

    assert_eq!(native_pet_advance_active_step(&mut active_step, 240), None);
    assert_eq!(
        native_pet_complete_active_step(&mut active_step),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5000-0000-7000-8000-000000000002",
            240,
        )))
    );
    assert_eq!(active_step, None);
}

#[test]
fn interrupt_active_step_returns_reason_and_elapsed() {
    let mut active_step = Some(NativePetActiveStepState::signaled(
        "step_019f5000-0000-7000-8000-000000000003",
    ));
    assert_eq!(native_pet_advance_active_step(&mut active_step, 90), None);

    assert_eq!(
        native_pet_interrupt_active_step(
            &mut active_step,
            "step_019f5000-0000-7000-8000-000000000003",
            SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
        ),
        Some(SidecarStepResponse::StepInterrupted(
            step_interrupted_response(
                "step_019f5000-0000-7000-8000-000000000003",
                SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
                Some(90),
            ),
        ))
    );
    assert_eq!(active_step, None);
}

#[test]
fn local_interaction_preempts_an_agent_finish_step() {
    let request: ExecuteStepRequest = serde_json::from_value(serde_json::json!({
        "protocolVersion": 1,
        "messageId": "message_019f5000-0000-7000-8000-000000000103",
        "type": "executeStep",
        "stepId": "step_019f5000-0000-7000-8000-000000000103",
        "step": {
            "kind": "playAction",
            "animation": "celebrate",
            "playback": { "kind": "once", "durationMs": 300 },
            "interruptPolicy": "finishStep",
            "timeoutMs": 500
        }
    }))
    .expect("deserialize finishStep request");
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));
    assert_eq!(native_pet_advance_active_step(&mut active_step, 80), None);

    assert_eq!(
        native_pet_interrupt_active_step_for_local_interaction(&mut active_step),
        Some(SidecarStepResponse::StepInterrupted(
            step_interrupted_response(
                "step_019f5000-0000-7000-8000-000000000103",
                SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
                Some(80),
            ),
        )),
    );
    assert_eq!(active_step, None);
}

#[test]
fn uninterruptible_short_active_step_rejects_interrupt_without_clearing_active_step() {
    let request: ExecuteStepRequest = serde_json::from_value(serde_json::json!({
        "protocolVersion": 1,
        "messageId": "message_019f5000-0000-7000-8000-000000000010",
        "type": "executeStep",
        "stepId": "step_019f5000-0000-7000-8000-000000000010",
        "step": {
            "kind": "playAction",
            "animation": "grab_start",
            "playback": {
                "kind": "once",
                "durationMs": 240
            },
            "interruptPolicy": "uninterruptibleShort",
            "timeoutMs": 500
        }
    }))
    .expect("deserialize uninterruptibleShort executeStep request");
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));
    assert_eq!(native_pet_advance_active_step(&mut active_step, 90), None);

    let interrupt_response = native_pet_interrupt_active_step(
        &mut active_step,
        "step_019f5000-0000-7000-8000-000000000010",
        SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
    )
    .expect("uninterruptibleShort step should return a rejection response");

    let SidecarStepResponse::StepFailed(interrupt_response) = interrupt_response else {
        panic!("uninterruptibleShort interrupt should return stepFailed");
    };
    assert_eq!(
        serde_json::to_value(interrupt_response).expect("serialize interrupt response"),
        serde_json::json!({
            "protocolVersion": 1,
            "correlationId": "message_019f5000-0000-7000-8000-000000000010",
            "type": "stepFailed",
            "stepId": "step_019f5000-0000-7000-8000-000000000010",
            "code": "interruptRejected",
            "message": "native pet step rejected interrupt due to interrupt policy",
            "elapsedMs": 90
        })
    );
    assert!(active_step.is_some());
    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 150),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5000-0000-7000-8000-000000000010",
            240,
        )))
    );
}

#[test]
fn play_action_execute_step_uses_playback_duration_for_timed_completion() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000004".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000004".to_owned(),
        step: ExecuteStepPayload::PlayAction {
            animation: "celebrate".to_owned(),
            playback: ExecuteStepPlayback::LoopForDuration {
                duration_ms: 10_000,
                clip_duration_ms: 1_720,
            },
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            completion_behavior:
                crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
            timeout_ms: 11_000,
        },
    };
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert!(native_pet_active_step_is_play_action(&active_step));

    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 9_999),
        None
    );
    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 1),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5000-0000-7000-8000-000000000004",
            10_000,
        )))
    );
}

#[test]
fn play_action_active_step_preserves_requested_completion_behavior() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000014".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000014".to_owned(),
        step: ExecuteStepPayload::PlayAction {
            animation: "celebrate".to_owned(),
            playback: ExecuteStepPlayback::Once { duration_ms: 1_720 },
            interrupt_policy: SidecarInterruptPolicy::FinishStep,
            completion_behavior: SidecarPlayActionCompletionBehavior::HoldLastFrame,
            timeout_ms: 5_000,
        },
    };
    let active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert_eq!(
        native_pet_active_play_action_completion_behavior(&active_step),
        Some(SidecarPlayActionCompletionBehavior::HoldLastFrame)
    );
}

#[test]
fn play_action_terminal_response_only_holds_after_success() {
    let completed = SidecarStepResponse::StepCompleted(step_completed_response(
        "step_019f5000-0000-7000-8000-000000000015",
        1_720,
    ));
    let failed = SidecarStepResponse::StepFailed(motion_timeout_step_failed_response(
        "step_019f5000-0000-7000-8000-000000000015",
        Some(5_000),
    ));

    assert_eq!(
        native_pet_play_action_completion_behavior_for_response(
            Some(SidecarPlayActionCompletionBehavior::HoldLastFrame),
            &completed,
        ),
        Some(SidecarPlayActionCompletionBehavior::HoldLastFrame)
    );
    assert_eq!(
        native_pet_play_action_completion_behavior_for_response(
            Some(SidecarPlayActionCompletionBehavior::HoldLastFrame),
            &failed,
        ),
        Some(SidecarPlayActionCompletionBehavior::RestoreIdle)
    );
    assert_eq!(
        native_pet_play_action_completion_behavior_for_response(None, &completed),
        None
    );
}

#[test]
fn move_to_execute_step_waits_for_runtime_completion_signal() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000005".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000005".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({ "kind": "home" }),
            after: Some("sleep".to_owned()),
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 15_000,
        },
    };
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert!(!native_pet_active_step_is_play_action(&active_step));

    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 14_999),
        None
    );
    assert_eq!(
        native_pet_complete_active_step(&mut active_step),
        Some(SidecarStepResponse::StepCompleted(step_completed_response(
            "step_019f5000-0000-7000-8000-000000000005",
            14_999,
        )))
    );
}

#[test]
fn move_to_execute_step_fails_when_runtime_signal_exceeds_timeout() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000006".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000006".to_owned(),
        step: ExecuteStepPayload::MoveTo {
            target: serde_json::json!({ "kind": "home" }),
            after: Some("sleep".to_owned()),
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 15_000,
        },
    };
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 15_000),
        Some(SidecarStepResponse::StepFailed(
            motion_timeout_step_failed_response(
                "step_019f5000-0000-7000-8000-000000000006",
                Some(15_000),
            ),
        ))
    );
    assert_eq!(active_step, None);
}

#[test]
fn move_by_path_execute_step_fails_when_runtime_signal_exceeds_timeout() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000007".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000007".to_owned(),
        step: ExecuteStepPayload::MoveByPath {
            path: vec![
                serde_json::json!({ "kind": "edge", "edge": "left" }),
                serde_json::json!({ "kind": "center" }),
            ],
            after: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            timeout_ms: 30_000,
        },
    };
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 30_000),
        Some(SidecarStepResponse::StepFailed(
            motion_timeout_step_failed_response(
                "step_019f5000-0000-7000-8000-000000000007",
                Some(30_000),
            ),
        ))
    );
}

#[test]
fn play_action_execute_step_fails_when_playback_exceeds_timeout() {
    let request = ExecuteStepRequest {
        protocol_version: 1,
        message_id: "message_019f5000-0000-7000-8000-000000000008".to_owned(),
        message_type: "executeStep".to_owned(),
        step_id: "step_019f5000-0000-7000-8000-000000000008".to_owned(),
        step: ExecuteStepPayload::PlayAction {
            animation: "celebrate".to_owned(),
            playback: ExecuteStepPlayback::LoopForDuration {
                duration_ms: 10_000,
                clip_duration_ms: 1_720,
            },
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            completion_behavior:
                crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
            timeout_ms: 5_000,
        },
    };
    let mut active_step = Some(native_pet_start_active_step_for_execute_step(&request));

    assert_eq!(
        native_pet_advance_active_step(&mut active_step, 5_000),
        Some(SidecarStepResponse::StepFailed(
            motion_timeout_step_failed_response(
                "step_019f5000-0000-7000-8000-000000000008",
                Some(5_000),
            ),
        ))
    );
}
