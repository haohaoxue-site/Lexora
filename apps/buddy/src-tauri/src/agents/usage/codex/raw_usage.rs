use super::super::{read_u64_field, read_u64_field_any};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(super) struct CodexRawUsage {
    pub(super) input_tokens: u64,
    pub(super) cached_input_tokens: u64,
    pub(super) output_tokens: u64,
    pub(super) reasoning_output_tokens: u64,
    pub(super) total_tokens: u64,
}

pub(super) fn parse_codex_raw_usage(value: &serde_json::Value) -> Option<CodexRawUsage> {
    if !value.is_object() {
        return None;
    }

    let input_tokens = read_u64_field_any(value, &["input_tokens", "prompt_tokens", "input"]);
    let output_tokens =
        read_u64_field_any(value, &["output_tokens", "completion_tokens", "output"]);
    let reasoning_output_tokens =
        read_u64_field_any(value, &["reasoning_output_tokens", "reasoning_tokens"]);
    let total_fallback = input_tokens
        .saturating_add(output_tokens)
        .saturating_add(reasoning_output_tokens);
    let total_tokens = read_u64_field(value, "total_tokens")
        .filter(|total| *total > 0 || total_fallback == 0)
        .unwrap_or(total_fallback);

    Some(CodexRawUsage {
        cached_input_tokens: read_u64_field_any(
            value,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cached_tokens",
            ],
        ),
        input_tokens,
        output_tokens,
        reasoning_output_tokens,
        total_tokens,
    })
}

pub(super) fn subtract_codex_raw_usage(
    current: &CodexRawUsage,
    previous: Option<&CodexRawUsage>,
) -> CodexRawUsage {
    CodexRawUsage {
        cached_input_tokens: current
            .cached_input_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.cached_input_tokens)),
        input_tokens: current
            .input_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.input_tokens)),
        output_tokens: current
            .output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.output_tokens)),
        reasoning_output_tokens: current
            .reasoning_output_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.reasoning_output_tokens)),
        total_tokens: current
            .total_tokens
            .saturating_sub(previous.map_or(0, |usage| usage.total_tokens)),
    }
}

pub(super) fn codex_raw_usage_is_empty_for_session(usage: &CodexRawUsage) -> bool {
    usage.input_tokens == 0
        && usage.cached_input_tokens == 0
        && usage.output_tokens == 0
        && usage.reasoning_output_tokens == 0
}

pub(super) fn codex_raw_usage_is_empty_for_headless(usage: &CodexRawUsage) -> bool {
    codex_raw_usage_is_empty_for_session(usage) && usage.total_tokens == 0
}

pub(super) fn codex_usage_from_result_value(value: &serde_json::Value) -> Option<CodexRawUsage> {
    value
        .get("usage")
        .and_then(parse_codex_raw_usage)
        .or_else(|| {
            value
                .get("data")
                .and_then(|data| data.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
        .or_else(|| {
            value
                .get("response")
                .and_then(|response| response.get("usage"))
                .and_then(parse_codex_raw_usage)
        })
}
