use super::process::step_protocol::{
    interrupt_rejected_step_failed_response_for_correlation,
    motion_timeout_step_failed_response_for_correlation, step_completed_response_for_correlation,
    step_interrupted_response_for_correlation, ExecuteStepPayload, ExecuteStepPlayback,
    ExecuteStepRequest, SidecarInterruptPolicy, SidecarInterruptReasonCode,
    SidecarPlayActionCompletionBehavior, SidecarStepErrorCode, SidecarStepResponse,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetActiveStepState {
    correlation_id: String,
    step_id: String,
    elapsed_ms: u64,
    timeout_ms: Option<u64>,
    interrupt_policy: SidecarInterruptPolicy,
    kind: NativePetActiveStepKind,
    completion: NativePetActiveStepCompletion,
    play_action_completion_behavior: Option<SidecarPlayActionCompletionBehavior>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetActiveStepKind {
    PlayAction,
    Motion,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetActiveStepCompletion {
    Timed { duration_ms: u64 },
    RuntimeSignal,
}

#[cfg_attr(not(test), allow(dead_code))]
impl NativePetActiveStepState {
    pub(super) fn timed(step_id: impl Into<String>, duration_ms: u64) -> Self {
        let step_id = step_id.into();
        Self {
            correlation_id: super::process::step_protocol::sidecar_message_id_for_target_id(
                &step_id,
            ),
            step_id,
            elapsed_ms: 0,
            timeout_ms: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            kind: NativePetActiveStepKind::PlayAction,
            completion: NativePetActiveStepCompletion::Timed { duration_ms },
            play_action_completion_behavior: Some(SidecarPlayActionCompletionBehavior::RestoreIdle),
        }
    }

    pub(super) fn signaled(step_id: impl Into<String>) -> Self {
        let step_id = step_id.into();
        Self {
            correlation_id: super::process::step_protocol::sidecar_message_id_for_target_id(
                &step_id,
            ),
            step_id,
            elapsed_ms: 0,
            timeout_ms: None,
            interrupt_policy: SidecarInterruptPolicy::Interruptible,
            kind: NativePetActiveStepKind::Motion,
            completion: NativePetActiveStepCompletion::RuntimeSignal,
            play_action_completion_behavior: None,
        }
    }

    fn timed_with_timeout(
        correlation_id: impl Into<String>,
        step_id: impl Into<String>,
        duration_ms: u64,
        timeout_ms: u64,
        interrupt_policy: SidecarInterruptPolicy,
        completion_behavior: SidecarPlayActionCompletionBehavior,
    ) -> Self {
        Self {
            correlation_id: correlation_id.into(),
            step_id: step_id.into(),
            elapsed_ms: 0,
            timeout_ms: Some(timeout_ms),
            interrupt_policy,
            kind: NativePetActiveStepKind::PlayAction,
            completion: NativePetActiveStepCompletion::Timed { duration_ms },
            play_action_completion_behavior: Some(completion_behavior),
        }
    }

    fn signaled_with_timeout(
        correlation_id: impl Into<String>,
        step_id: impl Into<String>,
        timeout_ms: u64,
        interrupt_policy: SidecarInterruptPolicy,
    ) -> Self {
        Self {
            correlation_id: correlation_id.into(),
            step_id: step_id.into(),
            elapsed_ms: 0,
            timeout_ms: Some(timeout_ms),
            interrupt_policy,
            kind: NativePetActiveStepKind::Motion,
            completion: NativePetActiveStepCompletion::RuntimeSignal,
            play_action_completion_behavior: None,
        }
    }

    fn advance(&mut self, elapsed_ms: u64) {
        self.elapsed_ms = self.elapsed_ms.saturating_add(elapsed_ms);
    }

    fn terminal_response(&self) -> Option<NativePetActiveStepTerminal> {
        match self.completion {
            NativePetActiveStepCompletion::Timed { duration_ms } => {
                if self.elapsed_ms >= duration_ms
                    && self
                        .timeout_ms
                        .map(|timeout_ms| duration_ms <= timeout_ms)
                        .unwrap_or(true)
                {
                    return Some(NativePetActiveStepTerminal::Completed);
                }
                if self
                    .timeout_ms
                    .map(|timeout_ms| self.elapsed_ms >= timeout_ms)
                    .unwrap_or(false)
                {
                    return Some(NativePetActiveStepTerminal::MotionTimeout);
                }

                None
            }
            NativePetActiveStepCompletion::RuntimeSignal => self
                .timeout_ms
                .filter(|timeout_ms| self.elapsed_ms >= *timeout_ms)
                .map(|_| NativePetActiveStepTerminal::MotionTimeout),
        }
    }

    fn completed_response(self) -> SidecarStepResponse {
        SidecarStepResponse::StepCompleted(step_completed_response_for_correlation(
            self.correlation_id,
            self.step_id,
            self.elapsed_ms,
        ))
    }

    fn interrupted_response(self, reason_code: SidecarInterruptReasonCode) -> SidecarStepResponse {
        SidecarStepResponse::StepInterrupted(step_interrupted_response_for_correlation(
            self.correlation_id,
            self.step_id,
            reason_code,
            Some(self.elapsed_ms),
        ))
    }

    fn motion_timeout_response(self) -> SidecarStepResponse {
        SidecarStepResponse::StepFailed(motion_timeout_step_failed_response_for_correlation(
            self.correlation_id,
            self.step_id,
            Some(self.elapsed_ms),
        ))
    }

    fn interrupt_rejected_response(&self) -> SidecarStepResponse {
        SidecarStepResponse::StepFailed(interrupt_rejected_step_failed_response_for_correlation(
            self.correlation_id.clone(),
            self.step_id.clone(),
            Some(self.elapsed_ms),
        ))
    }
}

pub(super) fn native_pet_active_step_is_play_action(
    active_step: &Option<NativePetActiveStepState>,
) -> bool {
    active_step
        .as_ref()
        .is_some_and(|active| active.kind == NativePetActiveStepKind::PlayAction)
}

pub(super) fn native_pet_active_play_action_completion_behavior(
    active_step: &Option<NativePetActiveStepState>,
) -> Option<SidecarPlayActionCompletionBehavior> {
    active_step
        .as_ref()
        .and_then(|active| active.play_action_completion_behavior)
}

pub(super) fn native_pet_play_action_completion_behavior_for_response(
    requested_behavior: Option<SidecarPlayActionCompletionBehavior>,
    response: &SidecarStepResponse,
) -> Option<SidecarPlayActionCompletionBehavior> {
    requested_behavior.map(|behavior| {
        if matches!(response, SidecarStepResponse::StepCompleted(_)) {
            behavior
        } else {
            SidecarPlayActionCompletionBehavior::RestoreIdle
        }
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetActiveStepTerminal {
    Completed,
    MotionTimeout,
}

pub(super) fn native_pet_advance_active_step(
    active_step: &mut Option<NativePetActiveStepState>,
    elapsed_ms: u64,
) -> Option<SidecarStepResponse> {
    let active = active_step.as_mut()?;
    active.advance(elapsed_ms);
    match active.terminal_response()? {
        NativePetActiveStepTerminal::Completed => active_step
            .take()
            .map(NativePetActiveStepState::completed_response),
        NativePetActiveStepTerminal::MotionTimeout => active_step
            .take()
            .map(NativePetActiveStepState::motion_timeout_response),
    }
}

pub(super) fn native_pet_start_active_step_for_execute_step(
    request: &ExecuteStepRequest,
) -> NativePetActiveStepState {
    match &request.step {
        ExecuteStepPayload::PlayAction {
            playback,
            timeout_ms,
            interrupt_policy,
            completion_behavior,
            ..
        } => NativePetActiveStepState::timed_with_timeout(
            request.message_id.clone(),
            request.step_id.clone(),
            playback.duration_ms(),
            *timeout_ms,
            *interrupt_policy,
            *completion_behavior,
        ),
        ExecuteStepPayload::MoveTo {
            timeout_ms,
            interrupt_policy,
            ..
        }
        | ExecuteStepPayload::MoveByPath {
            timeout_ms,
            interrupt_policy,
            ..
        } => NativePetActiveStepState::signaled_with_timeout(
            request.message_id.clone(),
            request.step_id.clone(),
            *timeout_ms,
            *interrupt_policy,
        ),
    }
}

pub(super) fn native_pet_complete_active_step(
    active_step: &mut Option<NativePetActiveStepState>,
) -> Option<SidecarStepResponse> {
    active_step
        .take()
        .map(NativePetActiveStepState::completed_response)
}

pub(super) fn native_pet_interrupt_active_step(
    active_step: &mut Option<NativePetActiveStepState>,
    step_id: &str,
    reason_code: SidecarInterruptReasonCode,
) -> Option<SidecarStepResponse> {
    let Some(active) = active_step else {
        return None;
    };
    if active.step_id != step_id {
        return None;
    }
    if !active.interrupt_policy.accepts_interrupt() {
        return Some(active.interrupt_rejected_response());
    }

    active_step
        .take()
        .map(|active| active.interrupted_response(reason_code))
}

pub(super) fn native_pet_interrupt_active_step_for_local_interaction(
    active_step: &mut Option<NativePetActiveStepState>,
) -> Option<SidecarStepResponse> {
    active_step.take().map(|active| {
        active.interrupted_response(
            SidecarInterruptReasonCode::AdmissionPreemptedByHigherPriorityPlan,
        )
    })
}

pub(super) fn native_pet_step_response_is_motion_timeout(response: &SidecarStepResponse) -> bool {
    matches!(
        response,
        SidecarStepResponse::StepFailed(response)
            if response.code == SidecarStepErrorCode::MotionTimeout
    )
}

impl ExecuteStepPlayback {
    fn duration_ms(&self) -> u64 {
        match self {
            Self::Once { duration_ms } | Self::LoopForDuration { duration_ms, .. } => *duration_ms,
        }
    }
}

#[cfg(test)]
#[path = "__tests__/step_runtime.rs"]
mod tests;
