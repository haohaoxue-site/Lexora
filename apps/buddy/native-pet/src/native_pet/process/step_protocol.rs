#![allow(dead_code)]

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::{BuddyError, BuddyResult};

pub(crate) const SIDECAR_PROTOCOL_VERSION: u16 = 1;
const SIDECAR_MOTION_TIMEOUT_MESSAGE: &str = "native pet motion did not settle before timeout";
const SIDECAR_INTERRUPT_REJECTED_MESSAGE: &str =
    "native pet step rejected interrupt due to interrupt policy";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SidecarStepErrorCode {
    InvalidStepProtocol,
    InvalidExecuteStep,
    UnsupportedStepCapability,
    MotionTimeout,
    TargetUnavailable,
    InterruptRejected,
}

impl SidecarStepErrorCode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::InvalidStepProtocol => "invalidStepProtocol",
            Self::InvalidExecuteStep => "invalidExecuteStep",
            Self::UnsupportedStepCapability => "unsupportedStepCapability",
            Self::MotionTimeout => "motionTimeout",
            Self::TargetUnavailable => "targetUnavailable",
            Self::InterruptRejected => "interruptRejected",
        }
    }

    fn parse(value: &str) -> BuddyResult<Self> {
        match value.trim() {
            "invalidStepProtocol" => Ok(Self::InvalidStepProtocol),
            "invalidExecuteStep" => Ok(Self::InvalidExecuteStep),
            "unsupportedStepCapability" => Ok(Self::UnsupportedStepCapability),
            "motionTimeout" => Ok(Self::MotionTimeout),
            "targetUnavailable" => Ok(Self::TargetUnavailable),
            "interruptRejected" => Ok(Self::InterruptRejected),
            value => Err(BuddyError::Validation(format!(
                "unsupported sidecar step error code: {value}"
            ))),
        }
    }
}

impl Serialize for SidecarStepErrorCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl std::fmt::Display for SidecarStepErrorCode {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SidecarInterruptPolicy {
    Interruptible,
    FinishStep,
    UninterruptibleShort,
}

impl SidecarInterruptPolicy {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Interruptible => "interruptible",
            Self::FinishStep => "finishStep",
            Self::UninterruptibleShort => "uninterruptibleShort",
        }
    }

    pub(crate) fn parse(value: &str) -> BuddyResult<Self> {
        match value.trim() {
            "interruptible" => Ok(Self::Interruptible),
            "finishStep" => Ok(Self::FinishStep),
            "uninterruptibleShort" => Ok(Self::UninterruptibleShort),
            value => Err(BuddyError::Validation(format!(
                "unsupported sidecar interrupt policy: {value}"
            ))),
        }
    }

    pub(crate) fn accepts_interrupt(self) -> bool {
        matches!(self, Self::Interruptible)
    }
}

impl Serialize for SidecarInterruptPolicy {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for SidecarInterruptPolicy {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(value.as_str()).map_err(serde::de::Error::custom)
    }
}

impl std::fmt::Display for SidecarInterruptPolicy {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SidecarPlayActionCompletionBehavior {
    #[default]
    RestoreIdle,
    HoldLastFrame,
    FollowAnimationFallback,
}

impl SidecarPlayActionCompletionBehavior {
    pub(crate) fn is_restore_idle(&self) -> bool {
        matches!(self, Self::RestoreIdle)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SidecarInterruptReasonCode {
    AdmissionPreemptedByHigherPriorityPlan,
}

impl SidecarInterruptReasonCode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::AdmissionPreemptedByHigherPriorityPlan => {
                "admission.preemptedByHigherPriorityPlan"
            }
        }
    }

    pub(crate) fn parse(value: &str) -> BuddyResult<Self> {
        match value.trim() {
            "admission.preemptedByHigherPriorityPlan" => {
                Ok(Self::AdmissionPreemptedByHigherPriorityPlan)
            }
            value => Err(BuddyError::Validation(format!(
                "unsupported sidecar interrupt reason code: {value}"
            ))),
        }
    }
}

impl Serialize for SidecarInterruptReasonCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for SidecarInterruptReasonCode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(value.as_str()).map_err(serde::de::Error::custom)
    }
}

impl std::fmt::Display for SidecarInterruptReasonCode {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::native_pet) enum StepProtocolRequest {
    ExecuteStep(ExecuteStepRequest),
    InterruptStep(InterruptStepRequest),
    QueryState(QueryStateRequest),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct ExecuteStepRequest {
    pub(crate) protocol_version: u16,
    pub(crate) message_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: String,
    pub(crate) step: ExecuteStepPayload,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct InterruptStepRequest {
    pub(crate) protocol_version: u16,
    pub(crate) message_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: String,
    pub(crate) reason_code: SidecarInterruptReasonCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct QueryStateRequest {
    pub(crate) protocol_version: u16,
    pub(crate) message_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) request_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) enum ExecuteStepPayload {
    PlayAction {
        animation: String,
        playback: ExecuteStepPlayback,
        #[serde(rename = "interruptPolicy")]
        interrupt_policy: SidecarInterruptPolicy,
        #[serde(
            rename = "completionBehavior",
            default,
            skip_serializing_if = "SidecarPlayActionCompletionBehavior::is_restore_idle"
        )]
        completion_behavior: SidecarPlayActionCompletionBehavior,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
    },
    MoveTo {
        target: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        after: Option<String>,
        #[serde(rename = "interruptPolicy")]
        interrupt_policy: SidecarInterruptPolicy,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
    },
    MoveByPath {
        path: Vec<serde_json::Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        after: Option<String>,
        #[serde(rename = "interruptPolicy")]
        interrupt_policy: SidecarInterruptPolicy,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) enum ExecuteStepPlayback {
    Once {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    LoopForDuration {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        #[serde(rename = "clipDurationMs")]
        clip_duration_ms: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProtocolErrorResponse {
    pub(crate) protocol_version: u16,
    pub(crate) correlation_id: Option<String>,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: Option<String>,
    pub(crate) code: SidecarStepErrorCode,
    pub(crate) message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StepCompletedResponse {
    pub(crate) protocol_version: u16,
    pub(crate) correlation_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: String,
    pub(crate) elapsed_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StepFailedResponse {
    pub(crate) protocol_version: u16,
    pub(crate) correlation_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: String,
    pub(crate) code: SidecarStepErrorCode,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StepInterruptedResponse {
    pub(crate) protocol_version: u16,
    pub(crate) correlation_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) step_id: String,
    pub(crate) reason_code: SidecarInterruptReasonCode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarStateSnapshotPosition {
    pub(crate) x: i32,
    pub(crate) y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarStateSnapshotResponse {
    pub(crate) protocol_version: u16,
    pub(crate) correlation_id: String,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) request_id: String,
    pub(crate) position: SidecarStateSnapshotPosition,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SidecarStepResponse {
    StepCompleted(StepCompletedResponse),
    StepFailed(StepFailedResponse),
    StepInterrupted(StepInterruptedResponse),
    ProtocolError(ProtocolErrorResponse),
}

pub(in crate::native_pet) fn parse_step_protocol_request(
    line: &str,
) -> BuddyResult<Option<StepProtocolRequest>> {
    let value = serde_json::from_str::<serde_json::Value>(line)?;
    if !value_declares_step_protocol(&value) {
        return Ok(None);
    };

    validate_protocol_version(&value)?;
    let message_type = read_required_string(&value, "type")?;
    validate_message_id(&value)?;

    match message_type.as_str() {
        "executeStep" => Ok(Some(StepProtocolRequest::ExecuteStep(
            serde_json::from_value(value)?,
        ))),
        "interruptStep" => {
            read_required_interrupt_reason_code(&value, "reasonCode")?;
            Ok(Some(StepProtocolRequest::InterruptStep(
                serde_json::from_value(value)?,
            )))
        }
        "queryState" => Ok(Some(StepProtocolRequest::QueryState(
            serde_json::from_value(value)?,
        ))),
        _ => Err(BuddyError::Validation(format!(
            "unsupported sidecar protocol request type: {message_type}"
        ))),
    }
}

pub(crate) fn parse_sidecar_state_snapshot_response(
    line: &str,
) -> BuddyResult<SidecarStateSnapshotResponse> {
    let value = serde_json::from_str::<serde_json::Value>(line)?;
    validate_protocol_version(&value)?;
    let message_type = read_required_string(&value, "type")?;
    if message_type != "stateSnapshot" {
        return Err(BuddyError::Validation(format!(
            "unsupported sidecar state response type: {message_type}"
        )));
    }
    reject_unknown_fields(
        &value,
        "stateSnapshot",
        &[
            "protocolVersion",
            "correlationId",
            "type",
            "requestId",
            "position",
        ],
    )?;
    let position = value
        .get("position")
        .ok_or_else(|| BuddyError::Validation("sidecar response requires position".to_owned()))?;
    reject_unknown_fields(position, "stateSnapshot.position", &["x", "y"])?;

    Ok(state_snapshot_response_for_correlation(
        read_required_string(&value, "correlationId")?,
        read_required_string(&value, "requestId")?,
        read_required_i32(position, "x")?,
        read_required_i32(position, "y")?,
    ))
}

pub(crate) fn parse_sidecar_step_response(line: &str) -> BuddyResult<SidecarStepResponse> {
    let value = serde_json::from_str::<serde_json::Value>(line)?;
    validate_protocol_version(&value)?;
    let message_type = read_required_string(&value, "type")?;
    match message_type.as_str() {
        "stepCompleted" => {
            reject_unknown_fields(
                &value,
                "stepCompleted",
                &[
                    "protocolVersion",
                    "correlationId",
                    "type",
                    "stepId",
                    "elapsedMs",
                ],
            )?;
            Ok(SidecarStepResponse::StepCompleted(
                step_completed_response_for_correlation(
                    read_required_string(&value, "correlationId")?,
                    read_required_string(&value, "stepId")?,
                    read_required_u64(&value, "elapsedMs")?,
                ),
            ))
        }
        "stepFailed" => {
            reject_unknown_fields(
                &value,
                "stepFailed",
                &[
                    "protocolVersion",
                    "correlationId",
                    "type",
                    "stepId",
                    "code",
                    "message",
                    "elapsedMs",
                ],
            )?;
            Ok(SidecarStepResponse::StepFailed(
                step_failed_response_for_correlation(
                    read_required_string(&value, "correlationId")?,
                    read_required_string(&value, "stepId")?,
                    read_required_step_error_code(&value, "code")?,
                    read_required_string(&value, "message")?,
                    read_optional_u64(&value, "elapsedMs")?,
                ),
            ))
        }
        "stepInterrupted" => {
            reject_unknown_fields(
                &value,
                "stepInterrupted",
                &[
                    "protocolVersion",
                    "correlationId",
                    "type",
                    "stepId",
                    "reasonCode",
                    "elapsedMs",
                ],
            )?;
            Ok(SidecarStepResponse::StepInterrupted(
                step_interrupted_response_for_correlation(
                    read_required_string(&value, "correlationId")?,
                    read_required_string(&value, "stepId")?,
                    read_required_interrupt_reason_code(&value, "reasonCode")?,
                    read_optional_u64(&value, "elapsedMs")?,
                ),
            ))
        }
        "protocolError" => {
            reject_unknown_fields(
                &value,
                "protocolError",
                &[
                    "protocolVersion",
                    "correlationId",
                    "type",
                    "stepId",
                    "code",
                    "message",
                ],
            )?;
            Ok(SidecarStepResponse::ProtocolError(
                protocol_error_response_for_correlation(
                    read_optional_string(&value, "correlationId")?.as_deref(),
                    read_optional_string(&value, "stepId")?.as_deref(),
                    read_required_step_error_code(&value, "code")?,
                    read_required_string(&value, "message")?,
                ),
            ))
        }
        message_type => Err(BuddyError::Validation(format!(
            "unsupported sidecar step response type: {message_type}"
        ))),
    }
}

fn reject_unknown_fields(
    value: &serde_json::Value,
    context: &str,
    allowed_fields: &[&str],
) -> BuddyResult<()> {
    let object = value.as_object().ok_or_else(|| {
        BuddyError::Validation(format!("sidecar {context} must be a JSON object"))
    })?;

    if let Some(field) = object
        .keys()
        .find(|field| !allowed_fields.contains(&field.as_str()))
    {
        return Err(BuddyError::Validation(format!(
            "unsupported sidecar {context} field: {field}"
        )));
    }

    Ok(())
}

pub(crate) fn format_sidecar_step_response(response: &SidecarStepResponse) -> BuddyResult<String> {
    match response {
        SidecarStepResponse::StepCompleted(response) => Ok(serde_json::to_string(response)?),
        SidecarStepResponse::StepFailed(response) => Ok(serde_json::to_string(response)?),
        SidecarStepResponse::StepInterrupted(response) => Ok(serde_json::to_string(response)?),
        SidecarStepResponse::ProtocolError(response) => Ok(serde_json::to_string(response)?),
    }
}

pub(crate) fn interrupt_step_request(
    step_id: impl Into<String>,
    reason_code: SidecarInterruptReasonCode,
) -> InterruptStepRequest {
    let step_id = step_id.into();
    InterruptStepRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        message_id: sidecar_message_id_for_target_id(&step_id),
        message_type: "interruptStep".to_owned(),
        step_id,
        reason_code,
    }
}

pub(crate) fn query_state_request(request_id: impl Into<String>) -> QueryStateRequest {
    let request_id = request_id.into();
    QueryStateRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        message_id: sidecar_message_id_for_target_id(&request_id),
        message_type: "queryState".to_owned(),
        request_id,
    }
}

pub(crate) fn protocol_error_response(
    step_id: Option<&str>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
) -> ProtocolErrorResponse {
    let correlation_id = step_id.map(sidecar_message_id_for_target_id);
    protocol_error_response_for_correlation(correlation_id.as_deref(), step_id, code, message)
}

pub(crate) fn protocol_error_response_for_correlation(
    correlation_id: Option<&str>,
    step_id: Option<&str>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
) -> ProtocolErrorResponse {
    ProtocolErrorResponse {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        correlation_id: correlation_id.map(str::to_owned),
        message_type: "protocolError".to_owned(),
        step_id: step_id.map(str::to_owned),
        code,
        message: message.into(),
    }
}

pub(crate) fn protocol_error_response_with_code(
    step_id: Option<&str>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
) -> ProtocolErrorResponse {
    protocol_error_response(step_id, code, message)
}

pub(crate) fn protocol_error_response_with_code_for_correlation(
    correlation_id: Option<&str>,
    step_id: Option<&str>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
) -> ProtocolErrorResponse {
    protocol_error_response_for_correlation(correlation_id, step_id, code, message)
}

#[cfg(test)]
pub(crate) fn step_completed_response(
    step_id: impl Into<String>,
    elapsed_ms: u64,
) -> StepCompletedResponse {
    let step_id = step_id.into();
    step_completed_response_for_correlation(
        sidecar_message_id_for_target_id(&step_id),
        step_id,
        elapsed_ms,
    )
}

pub(crate) fn step_completed_response_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    elapsed_ms: u64,
) -> StepCompletedResponse {
    StepCompletedResponse {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        correlation_id: correlation_id.into(),
        message_type: "stepCompleted".to_owned(),
        step_id: step_id.into(),
        elapsed_ms,
    }
}

pub(crate) fn step_failed_response(
    step_id: impl Into<String>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    let step_id = step_id.into();
    step_failed_response_for_correlation(
        sidecar_message_id_for_target_id(&step_id),
        step_id,
        code,
        message,
        elapsed_ms,
    )
}

pub(crate) fn step_failed_response_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    StepFailedResponse {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        correlation_id: correlation_id.into(),
        message_type: "stepFailed".to_owned(),
        step_id: step_id.into(),
        code,
        message: message.into(),
        elapsed_ms,
    }
}

pub(crate) fn step_failed_response_with_code(
    step_id: impl Into<String>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    step_failed_response(step_id, code, message, elapsed_ms)
}

pub(crate) fn step_failed_response_with_code_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    code: SidecarStepErrorCode,
    message: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    step_failed_response_for_correlation(correlation_id, step_id, code, message, elapsed_ms)
}

#[cfg(test)]
pub(crate) fn motion_timeout_step_failed_response(
    step_id: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    step_failed_response_with_code(
        step_id,
        SidecarStepErrorCode::MotionTimeout,
        SIDECAR_MOTION_TIMEOUT_MESSAGE,
        elapsed_ms,
    )
}

pub(crate) fn motion_timeout_step_failed_response_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    step_failed_response_with_code_for_correlation(
        correlation_id,
        step_id,
        SidecarStepErrorCode::MotionTimeout,
        SIDECAR_MOTION_TIMEOUT_MESSAGE,
        elapsed_ms,
    )
}

pub(crate) fn interrupt_rejected_step_failed_response_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    elapsed_ms: Option<u64>,
) -> StepFailedResponse {
    step_failed_response_with_code_for_correlation(
        correlation_id,
        step_id,
        SidecarStepErrorCode::InterruptRejected,
        SIDECAR_INTERRUPT_REJECTED_MESSAGE,
        elapsed_ms,
    )
}

#[cfg(test)]
pub(crate) fn step_interrupted_response(
    step_id: impl Into<String>,
    reason_code: SidecarInterruptReasonCode,
    elapsed_ms: Option<u64>,
) -> StepInterruptedResponse {
    let step_id = step_id.into();
    step_interrupted_response_for_correlation(
        sidecar_message_id_for_target_id(&step_id),
        step_id,
        reason_code,
        elapsed_ms,
    )
}

pub(crate) fn step_interrupted_response_for_correlation(
    correlation_id: impl Into<String>,
    step_id: impl Into<String>,
    reason_code: SidecarInterruptReasonCode,
    elapsed_ms: Option<u64>,
) -> StepInterruptedResponse {
    StepInterruptedResponse {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        correlation_id: correlation_id.into(),
        message_type: "stepInterrupted".to_owned(),
        step_id: step_id.into(),
        reason_code,
        elapsed_ms,
    }
}

#[cfg(test)]
pub(crate) fn state_snapshot_response(
    request_id: impl Into<String>,
    x: i32,
    y: i32,
) -> SidecarStateSnapshotResponse {
    let request_id = request_id.into();
    state_snapshot_response_for_correlation(
        sidecar_message_id_for_target_id(&request_id),
        request_id,
        x,
        y,
    )
}

pub(crate) fn state_snapshot_response_for_correlation(
    correlation_id: impl Into<String>,
    request_id: impl Into<String>,
    x: i32,
    y: i32,
) -> SidecarStateSnapshotResponse {
    SidecarStateSnapshotResponse {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        correlation_id: correlation_id.into(),
        message_type: "stateSnapshot".to_owned(),
        request_id: request_id.into(),
        position: SidecarStateSnapshotPosition { x, y },
    }
}

pub(crate) fn execute_step_request(
    step_id: impl Into<String>,
    step: ExecuteStepPayload,
) -> ExecuteStepRequest {
    let step_id = step_id.into();
    ExecuteStepRequest {
        protocol_version: SIDECAR_PROTOCOL_VERSION,
        message_id: sidecar_message_id_for_target_id(&step_id),
        message_type: "executeStep".to_owned(),
        step_id,
        step,
    }
}

pub(crate) fn sidecar_message_id_for_target_id(target_id: &str) -> String {
    let suffix = target_id
        .strip_prefix("step_")
        .or_else(|| target_id.strip_prefix("state_"))
        .unwrap_or(target_id);
    format!("message_{suffix}")
}

pub(in crate::native_pet) fn value_declares_step_protocol(value: &serde_json::Value) -> bool {
    value.get("protocolVersion").is_some()
        || value.get("messageId").is_some()
        || value
            .get("type")
            .and_then(serde_json::Value::as_str)
            .map(|message_type| {
                matches!(message_type, "executeStep" | "interruptStep" | "queryState")
            })
            .unwrap_or(false)
}

fn validate_protocol_version(value: &serde_json::Value) -> BuddyResult<()> {
    let protocol_version = read_required_u64(value, "protocolVersion")?;
    if protocol_version == u64::from(SIDECAR_PROTOCOL_VERSION) {
        return Ok(());
    }

    Err(BuddyError::Validation(format!(
        "unsupported sidecar protocol version: {protocol_version}"
    )))
}

fn validate_message_id(value: &serde_json::Value) -> BuddyResult<()> {
    read_required_string(value, "messageId").map(|_| ())
}

fn read_required_string(value: &serde_json::Value, key: &str) -> BuddyResult<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| BuddyError::Validation(format!("sidecar response requires {key}")))
}

fn read_required_step_error_code(
    value: &serde_json::Value,
    key: &str,
) -> BuddyResult<SidecarStepErrorCode> {
    SidecarStepErrorCode::parse(read_required_string(value, key)?.as_str())
}

fn read_required_interrupt_reason_code(
    value: &serde_json::Value,
    key: &str,
) -> BuddyResult<SidecarInterruptReasonCode> {
    SidecarInterruptReasonCode::parse(read_required_string(value, key)?.as_str())
}

fn read_optional_string(value: &serde_json::Value, key: &str) -> BuddyResult<Option<String>> {
    let Some(value) = value.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }

    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .map(Some)
        .ok_or_else(|| BuddyError::Validation(format!("sidecar response has invalid {key}")))
}

fn read_required_u64(value: &serde_json::Value, key: &str) -> BuddyResult<u64> {
    value
        .get(key)
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| BuddyError::Validation(format!("sidecar response requires {key}")))
}

fn read_required_i32(value: &serde_json::Value, key: &str) -> BuddyResult<i32> {
    let raw = value
        .get(key)
        .and_then(serde_json::Value::as_i64)
        .ok_or_else(|| BuddyError::Validation(format!("sidecar response requires {key}")))?;

    i32::try_from(raw)
        .map_err(|_| BuddyError::Validation(format!("sidecar response {key} is out of range")))
}

fn read_optional_u64(value: &serde_json::Value, key: &str) -> BuddyResult<Option<u64>> {
    let Some(value) = value.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }

    value
        .as_u64()
        .map(Some)
        .ok_or_else(|| BuddyError::Validation(format!("sidecar response has invalid {key}")))
}

#[cfg(test)]
mod tests {
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
}
