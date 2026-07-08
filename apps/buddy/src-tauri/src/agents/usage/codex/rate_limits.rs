use super::super::read_u64_field;
use super::{CodexRateLimitWindow, CodexRateLimits};

pub(super) fn parse_codex_rate_limits(value: &serde_json::Value) -> Option<CodexRateLimits> {
    let primary = value.get("primary").and_then(parse_codex_rate_limit_window);
    let secondary = value
        .get("secondary")
        .and_then(parse_codex_rate_limit_window);

    (primary.is_some() || secondary.is_some()).then_some(CodexRateLimits { primary, secondary })
}

fn parse_codex_rate_limit_window(value: &serde_json::Value) -> Option<CodexRateLimitWindow> {
    Some(CodexRateLimitWindow {
        resets_at_unix_seconds: read_u64_field(value, "resets_at"),
        used_percent: value
            .get("used_percent")
            .and_then(serde_json::Value::as_f64),
    })
}
