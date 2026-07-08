use crate::native_pet::animation::NativePetAnimationName;

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

    fn key(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Top => "top",
            Self::Bottom => "bottom",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetWalkTarget {
    Center,
    Home,
    Edge(NativePetWalkEdge),
    Position { x: i32, y: i32 },
    X { x: i32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetControlMessage {
    SetAnimation(NativePetAnimationName),
    WalkToEdge {
        edge: NativePetWalkEdge,
        after: Option<NativePetAnimationName>,
    },
    WalkToPosition {
        x: i32,
        y: i32,
        after: Option<NativePetAnimationName>,
    },
    WalkToX {
        x: i32,
        after: Option<NativePetAnimationName>,
    },
    WalkToTarget {
        target: NativePetWalkTarget,
        after: Option<NativePetAnimationName>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetControlRequestKind {
    Command(NativePetControlMessage),
    QueryState,
    QueryCapabilities,
}

pub(in crate::native_pet) fn parse_native_pet_control_message(
    line: &str,
) -> Option<NativePetControlMessage> {
    let line = line.trim();
    if let Some(value) = line.strip_prefix("animation:") {
        return NativePetAnimationName::from_manifest_key(value)
            .map(NativePetControlMessage::SetAnimation);
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

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum NativePetJsonControlRequest {
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
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NativePetJsonWalkTarget {
    Center,
    Home,
    Edge { edge: String },
    Position { x: i32, y: i32 },
    X { x: i32 },
}

pub(super) fn parse_native_pet_json_control_request_kind(
    line: &str,
) -> Option<NativePetControlRequestKind> {
    let request = serde_json::from_str::<NativePetJsonControlRequest>(line).ok()?;
    match request {
        NativePetJsonControlRequest::State => Some(NativePetControlRequestKind::QueryState),
        NativePetJsonControlRequest::Capabilities => {
            Some(NativePetControlRequestKind::QueryCapabilities)
        }
        NativePetJsonControlRequest::Animation { animation } => {
            NativePetAnimationName::from_manifest_key(&animation)
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
    }
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
        NativePetJsonWalkTarget::Position { x, y } => Some(NativePetWalkTarget::Position { x, y }),
        NativePetJsonWalkTarget::X { x } => Some(NativePetWalkTarget::X { x }),
    }
}

fn parse_native_pet_optional_after_animation(
    value: Option<&str>,
) -> Option<Option<NativePetAnimationName>> {
    let Some(value) = value else {
        return Some(None);
    };
    if value.is_empty() {
        return Some(None);
    }

    NativePetAnimationName::from_manifest_key(value).map(Some)
}

pub(super) fn format_native_pet_control_message(message: NativePetControlMessage) -> String {
    match message {
        NativePetControlMessage::SetAnimation(animation) => {
            format!("animation:{}", animation.manifest_key())
        }
        NativePetControlMessage::WalkToEdge { edge, after } => {
            format!(
                "walk_to_edge:{}{}",
                edge.key(),
                format_native_pet_after_suffix(after)
            )
        }
        NativePetControlMessage::WalkToPosition { x, y, after } => {
            format!("walk_to:{x}:{y}{}", format_native_pet_after_suffix(after))
        }
        NativePetControlMessage::WalkToX { x, after } => {
            format!("walk_to_x:{x}{}", format_native_pet_after_suffix(after))
        }
        NativePetControlMessage::WalkToTarget { target, after } => {
            let mut request = serde_json::json!({
                "type": "move",
                "target": format_native_pet_walk_target_json(target),
            });
            if let Some(after) = after {
                request["after"] = serde_json::Value::String(after.manifest_key().to_owned());
            }
            serde_json::to_string(&request).expect("native pet control JSON serializes")
        }
    }
}

fn format_native_pet_walk_target_json(target: NativePetWalkTarget) -> serde_json::Value {
    match target {
        NativePetWalkTarget::Center => serde_json::json!({ "kind": "center" }),
        NativePetWalkTarget::Home => serde_json::json!({ "kind": "home" }),
        NativePetWalkTarget::Edge(edge) => {
            serde_json::json!({ "kind": "edge", "edge": edge.key() })
        }
        NativePetWalkTarget::Position { x, y } => {
            serde_json::json!({ "kind": "position", "x": x, "y": y })
        }
        NativePetWalkTarget::X { x } => serde_json::json!({ "kind": "x", "x": x }),
    }
}

fn format_native_pet_after_suffix(after: Option<NativePetAnimationName>) -> String {
    after
        .map(|animation| format!(":{}", animation.manifest_key()))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_native_pet_animation_control_message() {
        assert_eq!(
            parse_native_pet_control_message("animation:working"),
            Some(NativePetControlMessage::SetAnimation(
                NativePetAnimationName::Working
            ))
        );
        assert_eq!(parse_native_pet_control_message("animation:unknown"), None);
        assert_eq!(parse_native_pet_control_message("unknown"), None);
    }

    #[test]
    fn parses_native_pet_scripted_walk_control_messages() {
        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:left:celebrate"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Left,
                after: Some(NativePetAnimationName::Celebrate)
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
                after: Some(NativePetAnimationName::Curious)
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_x:320:explain"),
            Some(NativePetControlMessage::WalkToX {
                x: 320,
                after: Some(NativePetAnimationName::Explain)
            })
        );

        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:top:celebrate"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Top,
                after: Some(NativePetAnimationName::Celebrate)
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
                    after: Some(NativePetAnimationName::Celebrate),
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
                    after: Some(NativePetAnimationName::Sleep),
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
}
