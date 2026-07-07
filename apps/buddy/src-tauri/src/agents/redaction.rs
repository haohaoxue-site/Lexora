pub(crate) fn sanitize_process_stderr_line(line: &str) -> String {
    let line = redact_bearer_token(line);
    [
        "OPENAI_API_KEY=",
        "ANTHROPIC_API_KEY=",
        "CODEX_API_KEY=",
        "API_KEY=",
        "access_token=",
        "refresh_token=",
        "id_token=",
    ]
    .into_iter()
    .fold(line, redact_assignment_value)
}

fn redact_assignment_value(line: String, marker: &str) -> String {
    let Some(start) = line.find(marker) else {
        return line;
    };
    let value_start = start + marker.len();
    let value_end = line[value_start..]
        .char_indices()
        .find_map(|(index, char)| {
            (char.is_whitespace() || char == '"' || char == '\'' || char == ',' || char == ';')
                .then_some(value_start + index)
        })
        .unwrap_or(line.len());

    let mut redacted = String::with_capacity(line.len());
    redacted.push_str(&line[..value_start]);
    redacted.push_str("[redacted]");
    redacted.push_str(&line[value_end..]);
    redacted
}

fn redact_bearer_token(line: &str) -> String {
    let Some(start) = line.find("Bearer ") else {
        return line.to_owned();
    };
    let value_start = start + "Bearer ".len();
    let value_end = line[value_start..]
        .char_indices()
        .find_map(|(index, char)| {
            (char.is_whitespace() || char == '"' || char == '\'' || char == ',' || char == ';')
                .then_some(value_start + index)
        })
        .unwrap_or(line.len());

    let mut redacted = String::with_capacity(line.len());
    redacted.push_str(&line[..value_start]);
    redacted.push_str("[redacted]");
    redacted.push_str(&line[value_end..]);
    redacted
}

#[cfg(test)]
mod tests {
    use super::sanitize_process_stderr_line;

    #[test]
    fn redacts_provider_keys_and_bearer_tokens_in_process_stderr() {
        let line = sanitize_process_stderr_line(
            "auth failed: OPENAI_API_KEY=sk-test-secret Authorization: Bearer live-token",
        );

        assert!(line.contains("OPENAI_API_KEY=[redacted]"));
        assert!(line.contains("Authorization: Bearer [redacted]"));
        assert!(!line.contains("sk-test-secret"));
        assert!(!line.contains("live-token"));
    }
}
