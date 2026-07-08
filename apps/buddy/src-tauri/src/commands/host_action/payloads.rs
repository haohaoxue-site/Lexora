use std::collections::BTreeSet;

use crate::storage::BuddyRunEvent;

use super::super::{read_json_string_field, runtime_events::CodexRuntimeOutput};

const BUDDY_ANIMATION_INTENT_START_TAG: &str = "<lexora_buddy_animation_intent>";
const BUDDY_ANIMATION_INTENT_END_TAG: &str = "</lexora_buddy_animation_intent>";
const BUDDY_HOST_ACTION_START_TAG: &str = "<lexora_buddy_host_action>";
const BUDDY_HOST_ACTION_END_TAG: &str = "</lexora_buddy_host_action>";
const BUDDY_HOST_ACTION_SOURCE: &str = "buddy_builtin_host_skill";

pub(super) fn collect_buddy_host_action_payloads(
    runtime_output: &CodexRuntimeOutput,
    events: &[BuddyRunEvent],
) -> Vec<serde_json::Value> {
    let mut seen = BTreeSet::new();
    let mut payloads = Vec::new();
    let mut streamed_message = String::new();

    for event in events {
        if event.event_type != "message.delta" {
            continue;
        }
        if let Some(delta) = read_json_string_field(&event.payload, "delta") {
            streamed_message.push_str(&delta);
        }
    }

    for content in [&streamed_message, runtime_output.final_message.as_str()] {
        for payload in extract_buddy_host_action_payloads(content) {
            let key = serde_json::to_string(&payload).unwrap_or_default();
            if seen.insert(key) {
                payloads.push(payload);
            }
        }
    }

    payloads
}

fn extract_buddy_host_action_payloads(content: &str) -> Vec<serde_json::Value> {
    let host_actions = extract_buddy_json_tag_payloads(
        content,
        BUDDY_HOST_ACTION_START_TAG,
        BUDDY_HOST_ACTION_END_TAG,
    )
    .into_iter()
    .filter_map(normalize_buddy_host_action_payload);

    let legacy_intents = extract_buddy_json_tag_payloads(
        content,
        BUDDY_ANIMATION_INTENT_START_TAG,
        BUDDY_ANIMATION_INTENT_END_TAG,
    )
    .into_iter()
    .filter_map(normalize_buddy_legacy_animation_intent_payload);

    host_actions.chain(legacy_intents).collect()
}

fn extract_buddy_json_tag_payloads(
    content: &str,
    start_tag: &str,
    end_tag: &str,
) -> Vec<serde_json::Value> {
    let mut payloads = Vec::new();
    let mut remaining = content;

    while let Some(start_index) = remaining.find(start_tag) {
        let body_start = start_index + start_tag.len();
        let Some(end_offset) = remaining[body_start..].find(end_tag) else {
            break;
        };
        let body_end = body_start + end_offset;
        let body = remaining[body_start..body_end].trim();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
            payloads.push(value);
        }
        let after_end = body_end + end_tag.len();
        remaining = &remaining[after_end..];
    }

    payloads
}

fn normalize_buddy_host_action_payload(value: serde_json::Value) -> Option<serde_json::Value> {
    let object = value.as_object()?;

    match read_buddy_json_trimmed_string(object, "action")? {
        "animation" => normalize_buddy_host_animation_action_payload(object),
        "move" => normalize_buddy_host_move_action_payload(object),
        "sequence" => normalize_buddy_host_sequence_action_payload(object),
        _ => None,
    }
}

fn normalize_buddy_host_animation_action_payload(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    let animation = read_buddy_json_trimmed_string(object, "animation")?;
    if !is_buddy_host_animation_name(animation) {
        return None;
    }

    let mut payload = serde_json::json!({
        "version": 1,
        "action": "animation",
        "animation": animation,
        "source": BUDDY_HOST_ACTION_SOURCE,
    });
    append_buddy_host_animation_fields(&mut payload, object)?;
    Some(payload)
}

fn normalize_buddy_host_move_action_payload(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    let target = normalize_buddy_host_move_target(object.get("target")?)?;
    let mut payload = serde_json::json!({
        "version": 1,
        "action": "move",
        "target": target,
        "source": BUDDY_HOST_ACTION_SOURCE,
    });
    append_buddy_host_move_fields(&mut payload, object)?;
    Some(payload)
}

fn normalize_buddy_host_sequence_action_payload(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    let steps = object.get("steps")?.as_array()?;
    if steps.is_empty() || steps.len() > 8 {
        return None;
    }

    let normalized_steps = steps
        .iter()
        .map(normalize_buddy_host_sequence_step)
        .collect::<Option<Vec<_>>>()?;

    let mut payload = serde_json::json!({
        "version": 1,
        "action": "sequence",
        "steps": normalized_steps,
        "source": BUDDY_HOST_ACTION_SOURCE,
    });
    append_buddy_host_common_fields(&mut payload, object)?;
    Some(payload)
}

fn normalize_buddy_host_sequence_step(value: &serde_json::Value) -> Option<serde_json::Value> {
    let object = value.as_object()?;
    match read_buddy_json_trimmed_string(object, "type")
        .or_else(|| read_buddy_json_trimmed_string(object, "action"))?
    {
        "animation" => {
            let animation = read_buddy_json_trimmed_string(object, "animation")?;
            if !is_buddy_host_animation_name(animation) {
                return None;
            }
            let mut payload = serde_json::json!({
                "type": "animation",
                "animation": animation,
            });
            append_buddy_host_animation_fields(&mut payload, object)?;
            Some(payload)
        }
        "move" => {
            let target = normalize_buddy_host_move_target(object.get("target")?)?;
            let mut payload = serde_json::json!({
                "type": "move",
                "target": target,
            });
            append_buddy_host_move_fields(&mut payload, object)?;
            Some(payload)
        }
        _ => None,
    }
}

fn normalize_buddy_host_move_target(value: &serde_json::Value) -> Option<serde_json::Value> {
    if let Some(target) = value.as_str().map(str::trim) {
        return match target {
            "center" | "home" => Some(serde_json::json!({ "kind": target })),
            _ => None,
        };
    }

    let object = value.as_object()?;
    match read_buddy_json_trimmed_string(object, "kind")? {
        "center" => Some(serde_json::json!({ "kind": "center" })),
        "home" => Some(serde_json::json!({ "kind": "home" })),
        "edge" => {
            let edge = read_buddy_json_trimmed_string(object, "edge")?;
            if !matches!(edge, "left" | "right" | "top" | "bottom") {
                return None;
            }
            Some(serde_json::json!({ "kind": "edge", "edge": edge }))
        }
        "position" => {
            let x = read_buddy_json_i32_field(object, "x")?;
            let y = read_buddy_json_i32_field(object, "y")?;
            Some(serde_json::json!({ "kind": "position", "x": x, "y": y }))
        }
        "x" => {
            let x = read_buddy_json_i32_field(object, "x")?;
            Some(serde_json::json!({ "kind": "x", "x": x }))
        }
        _ => None,
    }
}

fn normalize_buddy_legacy_animation_intent_payload(
    value: serde_json::Value,
) -> Option<serde_json::Value> {
    let object = value.as_object()?;
    let intent = read_buddy_json_trimmed_string(object, "intent")?;
    let animation = map_buddy_legacy_animation_intent_name(intent)?;

    let mut payload = serde_json::json!({
        "version": 1,
        "action": "animation",
        "animation": animation,
        "source": BUDDY_HOST_ACTION_SOURCE,
    });
    append_buddy_host_animation_fields(&mut payload, object)?;
    Some(payload)
}

fn append_buddy_host_animation_fields(
    payload: &mut serde_json::Value,
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<()> {
    append_buddy_host_common_fields(payload, object)?;
    if let Some(duration_ms) = object
        .get("durationMs")
        .and_then(serde_json::Value::as_u64)
        .filter(|duration_ms| (100..=30_000).contains(duration_ms))
    {
        payload["durationMs"] = serde_json::json!(duration_ms);
    }
    Some(())
}

fn append_buddy_host_move_fields(
    payload: &mut serde_json::Value,
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<()> {
    append_buddy_host_common_fields(payload, object)?;
    if let Some(after) = object
        .get("after")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|after| !after.is_empty())
    {
        if !is_buddy_host_animation_name(after) {
            return None;
        }
        payload["after"] = serde_json::json!(after);
    }
    Some(())
}

fn append_buddy_host_common_fields(
    payload: &mut serde_json::Value,
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<()> {
    if let Some(priority) = object
        .get("priority")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|priority| !priority.is_empty())
    {
        if !is_buddy_host_action_priority(priority) {
            return None;
        }
        payload["priority"] = serde_json::json!(priority);
    }
    if let Some(reason) = object
        .get("reason")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
    {
        payload["reason"] = serde_json::json!(reason.chars().take(120).collect::<String>());
    }
    Some(())
}

fn read_buddy_json_trimmed_string<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<&'a str> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn read_buddy_json_i32_field(
    object: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<i32> {
    object.get(key)?.as_i64()?.try_into().ok()
}

fn map_buddy_legacy_animation_intent_name(value: &str) -> Option<&'static str> {
    Some(match value {
        "focus" => "working",
        "celebrate" => "celebrate",
        "curious" => "curious",
        "explain" => "explain",
        "idle" => "idle",
        "reassure" => "reassure",
        "run_left" => "run_left",
        "run_right" => "run_right",
        "sleep" => "sleep",
        "stumble_recover_left" => "stumble_recover_left",
        "stumble_recover_right" => "stumble_recover_right",
        "trip_fall_left" => "trip_fall_left",
        "trip_fall_right" => "trip_fall_right",
        "wake" => "wake",
        _ => return None,
    })
}

fn is_buddy_host_animation_name(value: &str) -> bool {
    matches!(
        value,
        "idle"
            | "run_left"
            | "run_right"
            | "sleep"
            | "wake"
            | "hover"
            | "tap"
            | "grab_start"
            | "drag"
            | "approval"
            | "thinking"
            | "working"
            | "celebrate"
            | "sad"
            | "reassure"
            | "explain"
            | "curious"
            | "trip_fall_left"
            | "fallen_idle_left"
            | "fallen_get_up_left"
            | "trip_fall_right"
            | "fallen_idle_right"
            | "fallen_get_up_right"
            | "stumble_recover_left"
            | "stumble_recover_right"
    )
}

fn is_buddy_host_action_priority(value: &str) -> bool {
    matches!(value, "background" | "normal" | "high" | "urgent")
}

pub(in crate::commands) fn strip_buddy_host_action_blocks(content: &str) -> String {
    let stripped = strip_buddy_tagged_blocks(
        content,
        BUDDY_HOST_ACTION_START_TAG,
        BUDDY_HOST_ACTION_END_TAG,
    );
    strip_buddy_tagged_blocks(
        &stripped,
        BUDDY_ANIMATION_INTENT_START_TAG,
        BUDDY_ANIMATION_INTENT_END_TAG,
    )
}

fn strip_buddy_tagged_blocks(content: &str, start_tag: &str, end_tag: &str) -> String {
    let mut stripped = String::new();
    let mut remaining = content;

    loop {
        let Some(start_index) = remaining.find(start_tag) else {
            stripped.push_str(remaining);
            break;
        };
        stripped.push_str(&remaining[..start_index]);
        let body_start = start_index + start_tag.len();
        let Some(end_offset) = remaining[body_start..].find(end_tag) else {
            break;
        };
        let body_end = body_start + end_offset;
        let after_end = body_end + end_tag.len();
        remaining = &remaining[after_end..];
    }

    let stripped = stripped
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n");

    collapse_consecutive_newlines(&stripped).trim().to_owned()
}

fn collapse_consecutive_newlines(value: &str) -> String {
    let mut output = String::new();
    let mut previous_was_newline = false;

    for char in value.chars() {
        if char == '\n' {
            if !previous_was_newline {
                output.push(char);
            }
            previous_was_newline = true;
        } else {
            output.push(char);
            previous_was_newline = false;
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::{extract_buddy_host_action_payloads, strip_buddy_host_action_blocks};

    #[test]
    fn extracts_and_strips_buddy_host_action_blocks() {
        let content = r#"我会让桌宠庆祝。
<lexora_buddy_host_action>{"action":"sequence","steps":[{"type":"move","target":"center"},{"type":"animation","animation":"celebrate","durationMs":3000},{"type":"move","target":{"kind":"home"},"after":"sleep"}],"priority":"high","reason":"done"}</lexora_buddy_host_action>
继续保持安静。
<lexora_buddy_animation_intent>{"intent":"unknown","durationMs":3000}</lexora_buddy_animation_intent>"#;

        let payloads = extract_buddy_host_action_payloads(content);
        let stripped = strip_buddy_host_action_blocks(content);

        assert_eq!(payloads.len(), 1);
        assert_eq!(payloads[0]["action"], "sequence");
        assert_eq!(payloads[0]["priority"], "high");
        assert_eq!(payloads[0]["reason"], "done");
        assert_eq!(payloads[0]["source"], "buddy_builtin_host_skill");
        assert_eq!(payloads[0]["steps"][0]["target"]["kind"], "center");
        assert_eq!(payloads[0]["steps"][1]["animation"], "celebrate");
        assert_eq!(payloads[0]["steps"][1]["durationMs"], 3000);
        assert_eq!(payloads[0]["steps"][2]["target"]["kind"], "home");
        assert_eq!(payloads[0]["steps"][2]["after"], "sleep");
        assert_eq!(stripped, "我会让桌宠庆祝。\n继续保持安静。");
    }
}
