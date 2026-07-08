use super::super::time::format_unix_seconds_utc;

pub(super) fn codex_model_from_result_value(value: &serde_json::Value) -> Option<String> {
    codex_model_from_value_fields(value)
        .or_else(|| value.get("data").and_then(codex_model_from_value_fields))
        .or_else(|| value.get("result").and_then(codex_model_from_value_fields))
        .or_else(|| {
            value
                .get("response")
                .and_then(codex_model_from_value_fields)
        })
}

pub(super) fn codex_model_from_value_fields(value: &serde_json::Value) -> Option<String> {
    non_empty_value_string(value.get("model"))
        .or_else(|| non_empty_value_string(value.get("model_name")))
        .or_else(|| {
            value
                .get("metadata")
                .and_then(|metadata| non_empty_value_string(metadata.get("model")))
        })
}

fn non_empty_value_string(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(serde_json::Value::as_str).and_then(|text| {
        let text = text.trim();
        (!text.is_empty()).then(|| text.to_owned())
    })
}

pub(super) fn codex_timestamp_from_result_value(value: &serde_json::Value) -> Option<String> {
    codex_timestamp_from_value_fields(value)
        .or_else(|| {
            value
                .get("data")
                .and_then(codex_timestamp_from_value_fields)
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(codex_timestamp_from_value_fields)
        })
        .or_else(|| {
            value
                .get("response")
                .and_then(codex_timestamp_from_value_fields)
        })
}

fn codex_timestamp_from_value_fields(value: &serde_json::Value) -> Option<String> {
    codex_timestamp_from_value(value.get("timestamp"))
        .or_else(|| codex_timestamp_from_value(value.get("created_at")))
        .or_else(|| codex_timestamp_from_value(value.get("createdAt")))
}

pub(super) fn codex_timestamp_from_value(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return (!text.is_empty()).then(|| text.to_owned());
    }

    let raw = value.as_u64()?;
    let seconds = if raw > 10_000_000_000 {
        raw.checked_div(1_000)?
    } else {
        raw
    };
    format_unix_seconds_utc(seconds)
}
