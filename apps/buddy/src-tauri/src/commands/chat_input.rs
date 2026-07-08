use std::fs;

use crate::{
    error::{BuddyError, BuddyResult},
    state::BuddyAppState,
    storage::BuddyMessageAttachment,
};

mod builtin_skill;
mod codex_inputs;
mod content;

pub(super) use builtin_skill::{create_buddy_builtin_host_skill_input, TrustedCodexSkillInput};
pub(super) use codex_inputs::{compose_buddy_chat_codex_inputs, create_text_codex_input};
pub(super) use content::{
    compose_buddy_chat_runtime_content, compose_buddy_chat_user_message_content,
    compose_buddy_runtime_instructions,
};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuddyChatAttachment {
    pub(crate) attachment_id: Option<String>,
    pub(crate) kind: String,
    pub(crate) name: String,
    pub(crate) mime_type: String,
    pub(crate) size_bytes: u64,
    pub(crate) data_url: Option<String>,
    pub(crate) preview_path: Option<String>,
    pub(crate) text: Option<String>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuddyChatPromptContextItem {
    pub(crate) kind: String,
    pub(crate) label: String,
    pub(crate) value: String,
    pub(crate) path: Option<String>,
    pub(crate) description: Option<String>,
}

pub(super) fn create_buddy_message_attachments(
    attachments: &[BuddyChatAttachment],
) -> Vec<BuddyMessageAttachment> {
    attachments
        .iter()
        .map(|attachment| BuddyMessageAttachment {
            attachment_id: attachment.attachment_id.clone(),
            data_url: if attachment.kind == "image" {
                attachment
                    .preview_path
                    .is_none()
                    .then(|| attachment.data_url.clone())
                    .flatten()
            } else {
                None
            },
            kind: attachment.kind.clone(),
            mime_type: attachment.mime_type.clone(),
            name: attachment.name.clone(),
            preview_path: attachment.preview_path.clone(),
            size_bytes: attachment.size_bytes,
        })
        .collect()
}

pub(super) fn materialize_buddy_chat_attachments(
    state: &BuddyAppState,
    attachments: Vec<BuddyChatAttachment>,
) -> BuddyResult<Vec<BuddyChatAttachment>> {
    attachments
        .into_iter()
        .map(|attachment| materialize_buddy_chat_attachment(state, attachment))
        .collect()
}

fn materialize_buddy_chat_attachment(
    state: &BuddyAppState,
    mut attachment: BuddyChatAttachment,
) -> BuddyResult<BuddyChatAttachment> {
    let Some(attachment_id) = attachment
        .attachment_id
        .as_deref()
        .map(str::trim)
        .filter(|attachment_id| !attachment_id.is_empty())
        .map(str::to_owned)
    else {
        return Ok(attachment);
    };

    let registered = state.find_attachment(&attachment_id)?.ok_or_else(|| {
        BuddyError::Validation(format!("registered attachment not found: {attachment_id}"))
    })?;
    attachment.attachment_id = Some(registered.id);
    attachment.data_url = None;
    attachment.kind = registered.kind;
    attachment.mime_type = registered.mime_type;
    attachment.name = registered.name;
    attachment.preview_path = if attachment.kind == "image" {
        Some(registered.path.clone())
    } else {
        None
    };
    attachment.size_bytes = registered.size_bytes;
    attachment.text = if attachment.kind == "text" {
        Some(fs::read_to_string(&registered.path)?)
    } else {
        None
    };

    Ok(attachment)
}

#[cfg(test)]
mod tests;
