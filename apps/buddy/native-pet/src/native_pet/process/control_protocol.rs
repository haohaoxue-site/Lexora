#![allow(dead_code)]

use crate::{
    error::{BuddyError, BuddyResult},
    native_pet::{
        animation_key::NativePetAnimationKey,
        step_protocol::{
            parse_step_protocol_request, protocol_error_response_with_code_for_correlation,
            ExecuteStepPayload, ExecuteStepRequest, InterruptStepRequest, QueryStateRequest,
            SidecarStepErrorCode, SidecarStepResponse, StepProtocolRequest,
        },
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetWalkEdge {
    Left,
    Right,
    Top,
    Bottom,
}

impl NativePetWalkEdge {
    fn from_key(value: &str) -> Option<Self> {
        match value {
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "top" => Some(Self::Top),
            "bottom" => Some(Self::Bottom),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetWalkTarget {
    Center,
    Home,
    Edge(NativePetWalkEdge),
    EdgeAnchor {
        edge: NativePetWalkEdge,
        reveal: NativePetAnchorReveal,
        duration_ms: u64,
    },
    Position {
        x: i32,
        y: i32,
    },
    X {
        x: i32,
    },
    WindowAnchor {
        selector: NativePetWindowAnchorSelector,
        edge: NativePetWindowAnchorEdge,
        reveal: NativePetAnchorReveal,
        duration_ms: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::native_pet) struct NativePetWindowAnchorSelector {
    kind: NativePetWindowAnchorSelectorKind,
}

impl NativePetWindowAnchorSelector {
    #[cfg(test)]
    pub(in crate::native_pet) fn active_window() -> Self {
        Self {
            kind: NativePetWindowAnchorSelectorKind::ActiveWindow,
        }
    }

    pub(in crate::native_pet) fn kind(self) -> NativePetWindowAnchorSelectorKind {
        self.kind
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::native_pet) enum NativePetWindowAnchorSelectorKind {
    ActiveWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetWindowAnchorEdge {
    Auto,
    Left,
    Right,
    Top,
    Bottom,
}

impl NativePetWindowAnchorEdge {
    fn from_key(value: &str) -> Option<Self> {
        match value {
            "auto" => Some(Self::Auto),
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "top" => Some(Self::Top),
            "bottom" => Some(Self::Bottom),
            _ => None,
        }
    }
}

pub(in crate::native_pet) type NativePetWindowAnchorReveal = NativePetAnchorReveal;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::native_pet) enum NativePetAnchorReveal {
    Head,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetControlMessage {
    SetAnimation(NativePetAnimationKey),
    WalkToEdge {
        edge: NativePetWalkEdge,
        after: Option<NativePetAnimationKey>,
    },
    WalkToPosition {
        x: i32,
        y: i32,
        after: Option<NativePetAnimationKey>,
    },
    WalkToX {
        x: i32,
        after: Option<NativePetAnimationKey>,
    },
    WalkToTarget {
        target: NativePetWalkTarget,
        after: Option<NativePetAnimationKey>,
    },
    WalkByPath {
        path: Vec<NativePetWalkTarget>,
        after: Option<NativePetAnimationKey>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetControlRequestKind {
    Command(NativePetControlMessage),
    ReloadConfig,
    QueryState,
    QueryCapabilities,
    QueryStateSnapshot(QueryStateRequest),
    ExecuteStep(ExecuteStepRequest),
    InterruptStep(InterruptStepRequest),
    ParentDisconnected,
}

pub(in crate::native_pet) fn compile_execute_step_control_message(
    request: &ExecuteStepRequest,
) -> BuddyResult<NativePetControlMessage> {
    match &request.step {
        ExecuteStepPayload::PlayAction { animation, .. } => NativePetAnimationKey::parse(animation)
            .map(NativePetControlMessage::SetAnimation)
            .ok_or_else(|| {
                BuddyError::Validation(format!(
                    "invalid native pet executeStep animation key: {animation}"
                ))
            }),
        ExecuteStepPayload::MoveTo { target, after, .. } => {
            let target = parse_native_pet_json_walk_target_value(target).ok_or_else(|| {
                BuddyError::Validation("invalid native pet executeStep move target".to_owned())
            })?;
            let after =
                parse_native_pet_optional_after_animation(after.as_deref()).ok_or_else(|| {
                    BuddyError::Validation(
                        "invalid native pet executeStep after animation".to_owned(),
                    )
                })?;
            Ok(NativePetControlMessage::WalkToTarget { target, after })
        }
        ExecuteStepPayload::MoveByPath { path, after, .. } => {
            let path = parse_native_pet_json_walk_target_values(path).ok_or_else(|| {
                BuddyError::Validation("invalid native pet executeStep move path".to_owned())
            })?;
            let after =
                parse_native_pet_optional_after_animation(after.as_deref()).ok_or_else(|| {
                    BuddyError::Validation(
                        "invalid native pet executeStep after animation".to_owned(),
                    )
                })?;
            Ok(NativePetControlMessage::WalkByPath { path, after })
        }
    }
}

pub(in crate::native_pet) fn parse_native_pet_control_message(
    line: &str,
) -> Option<NativePetControlMessage> {
    let line = line.trim();
    if let Some(value) = line.strip_prefix("animation:") {
        return NativePetAnimationKey::parse(value).map(NativePetControlMessage::SetAnimation);
    }

    if let Some(value) = line.strip_prefix("walk_to_edge:") {
        let mut parts = value.split(':');
        let edge = NativePetWalkEdge::from_key(parts.next()?)?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToEdge { edge, after });
    }

    if let Some(value) = line.strip_prefix("walk_to_x:") {
        let mut parts = value.split(':');
        let x = parts.next()?.parse().ok()?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToX { x, after });
    }

    if let Some(value) = line.strip_prefix("walk_to:") {
        let mut parts = value.split(':');
        let x = parts.next()?.parse().ok()?;
        let y = parts.next()?.parse().ok()?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToPosition { x, y, after });
    }

    None
}

pub(in crate::native_pet) fn parse_native_pet_control_request_kind(
    line: &str,
) -> Option<NativePetControlRequestKind> {
    let line = line.trim();
    if line.starts_with('{') {
        return parse_native_pet_json_control_request_kind(line);
    }

    parse_native_pet_control_message(line).map(NativePetControlRequestKind::Command)
}

pub(in crate::native_pet) fn parse_native_pet_stdin_control_request_kind(
    line: &str,
) -> Result<Option<NativePetControlRequestKind>, Box<SidecarStepResponse>> {
    let line = line.trim();
    if line.starts_with('{') {
        match parse_step_protocol_request(line) {
            Ok(Some(request)) => {
                return Ok(Some(native_pet_step_protocol_request_to_control_kind(
                    request,
                )));
            }
            Err(error) if native_pet_json_line_declares_step_protocol(line) => {
                let correlation_id = native_pet_json_line_message_id(line);
                let step_id = native_pet_json_line_step_id(line);
                return Err(Box::new(SidecarStepResponse::ProtocolError(
                    protocol_error_response_with_code_for_correlation(
                        correlation_id.as_deref(),
                        step_id.as_deref(),
                        SidecarStepErrorCode::InvalidStepProtocol,
                        error.to_string(),
                    ),
                )));
            }
            _ => {}
        }
    }

    Ok(parse_native_pet_control_request_kind(line))
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum NativePetJsonControlRequest {
    #[serde(rename = "reload_config")]
    ReloadConfig,
    #[serde(rename = "state")]
    State,
    #[serde(rename = "capabilities")]
    Capabilities,
    #[serde(rename = "animation")]
    Animation { animation: String },
    #[serde(rename = "move")]
    Move {
        target: NativePetJsonWalkTarget,
        after: Option<String>,
    },
    #[serde(rename = "move_path")]
    MovePath {
        path: Vec<NativePetJsonWalkTarget>,
        after: Option<String>,
    },
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NativePetJsonWalkTarget {
    Center,
    Home,
    Edge {
        edge: String,
    },
    #[serde(rename = "edgeAnchor")]
    EdgeAnchor {
        edge: String,
        reveal: NativePetAnchorReveal,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
    Position {
        x: i32,
        y: i32,
    },
    X {
        x: i32,
    },
    #[serde(rename = "windowAnchor")]
    WindowAnchor {
        selector: NativePetWindowAnchorSelector,
        edge: String,
        reveal: NativePetWindowAnchorReveal,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
}

pub(super) fn parse_native_pet_json_control_request_kind(
    line: &str,
) -> Option<NativePetControlRequestKind> {
    if let Ok(Some(request)) = parse_step_protocol_request(line) {
        return Some(native_pet_step_protocol_request_to_control_kind(request));
    }

    let request = serde_json::from_str::<NativePetJsonControlRequest>(line).ok()?;
    match request {
        NativePetJsonControlRequest::ReloadConfig => {
            Some(NativePetControlRequestKind::ReloadConfig)
        }
        NativePetJsonControlRequest::State => Some(NativePetControlRequestKind::QueryState),
        NativePetJsonControlRequest::Capabilities => {
            Some(NativePetControlRequestKind::QueryCapabilities)
        }
        NativePetJsonControlRequest::Animation { animation } => {
            NativePetAnimationKey::parse(&animation)
                .map(NativePetControlMessage::SetAnimation)
                .map(NativePetControlRequestKind::Command)
        }
        NativePetJsonControlRequest::Move { target, after } => {
            let target = parse_native_pet_json_walk_target(target)?;
            let after = parse_native_pet_optional_after_animation(after.as_deref())?;
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkToTarget { target, after },
            ))
        }
        NativePetJsonControlRequest::MovePath { path, after } => {
            let path = parse_native_pet_json_walk_targets(path)?;
            let after = parse_native_pet_optional_after_animation(after.as_deref())?;
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkByPath { path, after },
            ))
        }
    }
}

fn native_pet_step_protocol_request_to_control_kind(
    request: StepProtocolRequest,
) -> NativePetControlRequestKind {
    match request {
        StepProtocolRequest::ExecuteStep(request) => {
            NativePetControlRequestKind::ExecuteStep(request)
        }
        StepProtocolRequest::InterruptStep(request) => {
            NativePetControlRequestKind::InterruptStep(request)
        }
        StepProtocolRequest::QueryState(request) => {
            NativePetControlRequestKind::QueryStateSnapshot(request)
        }
    }
}

fn native_pet_json_line_declares_step_protocol(line: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .map(|value| crate::native_pet::step_protocol::value_declares_step_protocol(&value))
        .unwrap_or(false)
}

fn native_pet_json_line_message_id(line: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|value| {
            value
                .get("messageId")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|message_id| !message_id.is_empty())
                .map(str::to_owned)
        })
}

fn native_pet_json_line_step_id(line: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|value| {
            value
                .get("stepId")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|step_id| !step_id.is_empty())
                .map(str::to_owned)
        })
}

fn parse_native_pet_json_walk_target(
    target: NativePetJsonWalkTarget,
) -> Option<NativePetWalkTarget> {
    match target {
        NativePetJsonWalkTarget::Center => Some(NativePetWalkTarget::Center),
        NativePetJsonWalkTarget::Home => Some(NativePetWalkTarget::Home),
        NativePetJsonWalkTarget::Edge { edge } => {
            NativePetWalkEdge::from_key(&edge).map(NativePetWalkTarget::Edge)
        }
        NativePetJsonWalkTarget::EdgeAnchor {
            edge,
            reveal,
            duration_ms,
        } => NativePetWalkEdge::from_key(&edge).map(|edge| NativePetWalkTarget::EdgeAnchor {
            edge,
            reveal,
            duration_ms,
        }),
        NativePetJsonWalkTarget::Position { x, y } => Some(NativePetWalkTarget::Position { x, y }),
        NativePetJsonWalkTarget::X { x } => Some(NativePetWalkTarget::X { x }),
        NativePetJsonWalkTarget::WindowAnchor {
            selector,
            edge,
            reveal,
            duration_ms,
        } => NativePetWindowAnchorEdge::from_key(&edge).map(|edge| {
            NativePetWalkTarget::WindowAnchor {
                selector,
                edge,
                reveal,
                duration_ms,
            }
        }),
    }
}

fn parse_native_pet_json_walk_target_value(
    target: &serde_json::Value,
) -> Option<NativePetWalkTarget> {
    serde_json::from_value(target.clone())
        .ok()
        .and_then(parse_native_pet_json_walk_target)
}

fn parse_native_pet_json_walk_targets(
    targets: Vec<NativePetJsonWalkTarget>,
) -> Option<Vec<NativePetWalkTarget>> {
    if targets.is_empty() {
        return None;
    }

    targets
        .into_iter()
        .map(parse_native_pet_json_walk_target)
        .collect()
}

fn parse_native_pet_json_walk_target_values(
    targets: &[serde_json::Value],
) -> Option<Vec<NativePetWalkTarget>> {
    if targets.is_empty() {
        return None;
    }

    targets
        .iter()
        .map(parse_native_pet_json_walk_target_value)
        .collect()
}

fn parse_native_pet_optional_after_animation(
    value: Option<&str>,
) -> Option<Option<NativePetAnimationKey>> {
    let Some(value) = value else {
        return Some(None);
    };
    if value.is_empty() {
        return Some(None);
    }

    NativePetAnimationKey::parse(value).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::process::step_protocol::{
        protocol_error_response_with_code, ExecuteStepPayload, ExecuteStepPlayback,
        ExecuteStepRequest, InterruptStepRequest, SidecarInterruptPolicy,
        SidecarInterruptReasonCode, SidecarStepErrorCode, SidecarStepResponse,
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
                completion_behavior: crate::native_pet::step_protocol::SidecarPlayActionCompletionBehavior::RestoreIdle,
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
    fn compile_execute_step_control_message_rejects_invalid_window_anchor_before_capability_check()
    {
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
}
