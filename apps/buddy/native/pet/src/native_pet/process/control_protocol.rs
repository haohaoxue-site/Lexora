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
#[path = "__tests__/control_protocol.rs"]
mod tests;
