use super::{BuddyChatAttachment, BuddyChatPromptContextItem};

pub(in crate::commands) fn compose_buddy_chat_user_message_content(
    content: &str,
    attachments: &[BuddyChatAttachment],
    context_items: &[BuddyChatPromptContextItem],
) -> String {
    let mut sections = Vec::new();
    let display_content = normalize_buddy_visible_content(content, attachments);
    if !display_content.is_empty() {
        sections.push(display_content);
    }

    if !context_items.is_empty() {
        sections.push(format!(
            "上下文：{}",
            context_items
                .iter()
                .map(format_buddy_chat_context_item_inline)
                .collect::<Vec<_>>()
                .join("; ")
        ));
    }

    sections.join("\n\n")
}

pub(in crate::commands) fn compose_buddy_chat_runtime_content(
    content: &str,
    attachments: &[BuddyChatAttachment],
    context_items: &[BuddyChatPromptContextItem],
) -> String {
    let mut sections = Vec::new();
    let content = content.trim();
    if !content.is_empty() {
        sections.push(content.to_owned());
    }

    let context_lines = context_items
        .iter()
        .map(format_buddy_chat_context_item_runtime)
        .collect::<Vec<_>>();
    if !context_lines.is_empty() {
        sections.push(format!(
            "Codex prompt context selected in Lexora:\n{}",
            context_lines.join("\n")
        ));
    }

    let text_attachments = attachments
        .iter()
        .filter(|attachment| attachment.kind == "text")
        .filter_map(|attachment| {
            let text = attachment.text.as_deref()?.trim();
            if text.is_empty() {
                return None;
            }

            Some(format!(
                "Uploaded text file: {}\n```text\n{}\n```",
                attachment.name, text
            ))
        })
        .collect::<Vec<_>>();
    if !text_attachments.is_empty() {
        sections.push(text_attachments.join("\n\n"));
    }

    let binary_attachments = attachments
        .iter()
        .filter(|attachment| attachment.kind == "binary")
        .map(|attachment| format!("{} ({})", attachment.name, attachment.mime_type))
        .collect::<Vec<_>>();
    if !binary_attachments.is_empty() {
        sections.push(format!(
            "Uploaded binary files are available as metadata only in this Lexora turn: {}.",
            binary_attachments.join(", ")
        ));
    }

    sections.join("\n\n")
}

pub(in crate::commands) fn compose_buddy_runtime_instructions(
    context_pack: Option<&str>,
) -> String {
    match context_pack {
        Some(context_pack) if !context_pack.trim().is_empty() => context_pack.trim().to_owned(),
        _ => String::new(),
    }
}

fn normalize_buddy_visible_content(content: &str, attachments: &[BuddyChatAttachment]) -> String {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if attachments.is_empty() {
        return trimmed.to_owned();
    }

    strip_inline_attachment_reference_markers(trimmed)
}

fn strip_inline_attachment_reference_markers(content: &str) -> String {
    let mut output = String::with_capacity(content.len());
    let mut remaining = content;
    while let Some(start) = remaining.find('[') {
        output.push_str(&remaining[..start]);
        let candidate = &remaining[start..];
        if let Some(marker_length) = inline_attachment_reference_marker_length(candidate) {
            remaining = &candidate[marker_length..];
        } else {
            output.push('[');
            remaining = &candidate['['.len_utf8()..];
        }
    }
    output.push_str(remaining);

    output
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

fn inline_attachment_reference_marker_length(candidate: &str) -> Option<usize> {
    let prefix = if candidate.starts_with("[Image #") {
        "[Image #"
    } else if candidate.starts_with("[File #") {
        "[File #"
    } else {
        return None;
    };
    let suffix = &candidate[prefix.len()..];
    let digit_length = suffix
        .chars()
        .take_while(char::is_ascii_digit)
        .map(char::len_utf8)
        .sum::<usize>();
    if digit_length == 0 {
        return None;
    }

    suffix[digit_length..]
        .starts_with(']')
        .then_some(prefix.len() + digit_length + ']'.len_utf8())
}

fn format_buddy_chat_context_item_inline(item: &BuddyChatPromptContextItem) -> String {
    match item.kind.as_str() {
        "slashCommand" => item.value.clone(),
        "skill" => format!("${}", item.label),
        "plugin" | "file" => format!("@{}", item.label),
        _ => item.label.clone(),
    }
}

fn format_buddy_chat_context_item_runtime(item: &BuddyChatPromptContextItem) -> String {
    let description = item
        .description
        .as_deref()
        .filter(|description| !description.trim().is_empty())
        .map(|description| format!(": {}", description.trim()))
        .unwrap_or_default();

    match item.kind.as_str() {
        "slashCommand" => format!("- Slash command {}{}", item.value, description),
        "skill" => format!("- Skill ${}{}", item.value, description),
        "plugin" => format!("- Plugin @{} ({}){}", item.value, item.label, description),
        "file" => format!(
            "- File @{}{}",
            item.path.as_deref().unwrap_or(item.value.as_str()),
            description
        ),
        _ => format!("- {}{}", item.label, description),
    }
}
