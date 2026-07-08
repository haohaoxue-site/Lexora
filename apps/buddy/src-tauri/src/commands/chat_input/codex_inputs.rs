use std::fs;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

use crate::{agents::codex, error::BuddyResult};

use super::{BuddyChatAttachment, TrustedCodexSkillInput};

pub(in crate::commands) fn compose_buddy_chat_codex_inputs(
    runtime_content: &str,
    requested_inputs: Vec<codex::CodexUserInput>,
    attachments: &[BuddyChatAttachment],
    builtin_skill: Option<TrustedCodexSkillInput>,
) -> BuddyResult<Vec<codex::CodexUserInput>> {
    let mut inputs = Vec::new();
    let mut replaced_text = false;

    for input in requested_inputs {
        match input {
            codex::CodexUserInput::Text { .. } if !replaced_text => {
                if !runtime_content.trim().is_empty() {
                    inputs.push(codex::CodexUserInput::Text {
                        text: runtime_content.trim().to_owned(),
                        text_elements: Vec::new(),
                    });
                }
                replaced_text = true;
            }
            codex::CodexUserInput::Text { text, .. } => {
                let text = text.trim();
                if !text.is_empty() {
                    inputs.push(codex::CodexUserInput::Text {
                        text: text.to_owned(),
                        text_elements: Vec::new(),
                    });
                }
            }
            codex::CodexUserInput::Image { detail, url } if is_safe_buddy_codex_image_url(&url) => {
                inputs.push(codex::CodexUserInput::Image { detail, url });
            }
            codex::CodexUserInput::Image { .. }
            | codex::CodexUserInput::LocalImage { .. }
            | codex::CodexUserInput::Skill { .. }
            | codex::CodexUserInput::Mention { .. } => {}
        }
    }

    if !replaced_text && !runtime_content.trim().is_empty() {
        let mut text_inputs = create_text_codex_input(runtime_content);
        text_inputs.extend(inputs);
        inputs = text_inputs;
    }

    inputs.extend(collect_buddy_chat_image_inputs(attachments)?);
    append_unique_codex_skill_input(&mut inputs, builtin_skill);
    Ok(inputs)
}

pub(in crate::commands) fn create_text_codex_input(content: &str) -> Vec<codex::CodexUserInput> {
    let content = content.trim();
    if content.is_empty() {
        return Vec::new();
    }

    vec![codex::CodexUserInput::Text {
        text: content.to_owned(),
        text_elements: Vec::new(),
    }]
}

fn is_safe_buddy_codex_image_url(url: &str) -> bool {
    let url = url.trim();
    url.starts_with("data:image/") && url.contains(";base64,")
}

fn append_unique_codex_skill_input(
    inputs: &mut Vec<codex::CodexUserInput>,
    skill: Option<TrustedCodexSkillInput>,
) {
    let Some(TrustedCodexSkillInput { name, path }) = skill else {
        return;
    };

    let already_present = inputs.iter().any(|input| {
        matches!(
            input,
            codex::CodexUserInput::Skill {
                name: existing_name,
                path: existing_path,
            } if existing_name == &name || existing_path == &path
        )
    });
    if !already_present {
        inputs.push(codex::CodexUserInput::Skill { name, path });
    }
}

fn collect_buddy_chat_image_inputs(
    attachments: &[BuddyChatAttachment],
) -> BuddyResult<Vec<codex::CodexUserInput>> {
    let mut inputs = Vec::new();
    for attachment in attachments
        .iter()
        .filter(|attachment| attachment.kind == "image")
    {
        let Some(url) = create_buddy_chat_image_input_url(attachment)? else {
            continue;
        };

        inputs.push(codex::CodexUserInput::Image {
            detail: Some("auto".to_owned()),
            url,
        });
    }

    Ok(inputs)
}

fn create_buddy_chat_image_input_url(
    attachment: &BuddyChatAttachment,
) -> BuddyResult<Option<String>> {
    if let Some(data_url) = attachment.data_url.as_deref().map(str::trim) {
        if !data_url.is_empty() {
            return Ok(Some(data_url.to_owned()));
        }
    }

    let Some(preview_path) = attachment.preview_path.as_deref().map(str::trim) else {
        return Ok(None);
    };
    if preview_path.is_empty() {
        return Ok(None);
    }

    let bytes = fs::read(preview_path)?;
    Ok(Some(format!(
        "data:{};base64,{}",
        attachment.mime_type,
        BASE64_STANDARD.encode(bytes)
    )))
}
