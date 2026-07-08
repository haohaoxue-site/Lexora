use std::fs;

use super::*;
use crate::{
    agents::codex, app_paths::BuddyAppPaths,
    commands::attachment::create_buddy_clipboard_file_from_path, state::BuddyAppState,
};

#[test]
fn materializes_registered_text_attachment_from_storage() {
    let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
    let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
        .expect("initialize state");
    let path = dir.join("note.txt");
    fs::write(&path, "hello from registry").expect("write text");
    let payload = create_buddy_clipboard_file_from_path(&state, &path, "file-picker")
        .expect("create payload")
        .expect("payload");
    let attachment_id = payload.attachment_id.expect("attachment id");

    let attachments = materialize_buddy_chat_attachments(
        &state,
        vec![BuddyChatAttachment {
            attachment_id: Some(attachment_id),
            data_url: Some("data:text/plain;base64,ZmFrZQ==".to_owned()),
            kind: "binary".to_owned(),
            mime_type: "application/octet-stream".to_owned(),
            name: "forged.bin".to_owned(),
            preview_path: Some("/tmp/forged.txt".to_owned()),
            size_bytes: 999,
            text: None,
        }],
    )
    .expect("materialize attachments");
    let runtime_content = compose_buddy_chat_runtime_content("总结 [File #1]", &attachments, &[]);

    assert_eq!(attachments[0].kind, "text");
    assert_eq!(attachments[0].name, "note.txt");
    assert_eq!(attachments[0].text.as_deref(), Some("hello from registry"));
    assert!(runtime_content.contains("Uploaded text file: note.txt"));
    assert!(runtime_content.contains("hello from registry"));
    assert!(!runtime_content.contains("forged"));

    fs::remove_dir_all(&dir).expect("cleanup temp dir");
}

#[test]
fn appends_trusted_skill_to_codex_inputs() {
    let input = compose_buddy_chat_codex_inputs(
        "写一篇文章",
        Vec::new(),
        &[],
        Some(TrustedCodexSkillInput {
            name: "lexora-buddy-host".to_owned(),
            path: "/home/user/.local/share/lexora-buddy/host-skills/lexora-buddy-host/SKILL.md"
                .to_owned(),
        }),
    )
    .expect("compose inputs");

    assert!(input.iter().any(|item| matches!(
            item,
            codex::CodexUserInput::Skill { name, path }
                if name == "lexora-buddy-host"
                    && path == "/home/user/.local/share/lexora-buddy/host-skills/lexora-buddy-host/SKILL.md"
        )));
}

#[test]
fn sanitizes_frontend_supplied_codex_inputs_before_runtime_execution() {
    let input = compose_buddy_chat_codex_inputs(
        "真实 runtime 内容",
        vec![
            codex::CodexUserInput::Text {
                text: "前端原始内容".to_owned(),
                text_elements: vec![codex::CodexTextElement {
                    byte_range: codex::CodexByteRange { start: 0, end: 12 },
                    placeholder: Some("[File #1]".to_owned()),
                }],
            },
            codex::CodexUserInput::LocalImage {
                detail: Some("high".to_owned()),
                path: "/home/user/secret.png".to_owned(),
            },
            codex::CodexUserInput::Skill {
                name: "external".to_owned(),
                path: "/home/user/.codex/skills/external/SKILL.md".to_owned(),
            },
            codex::CodexUserInput::Mention {
                name: "secret".to_owned(),
                path: "/home/user/secret.md".to_owned(),
            },
            codex::CodexUserInput::Image {
                detail: None,
                url: "data:image/png;base64,cG5n".to_owned(),
            },
        ],
        &[],
        None,
    )
    .expect("compose inputs");

    assert!(input.iter().any(|item| matches!(
        item,
        codex::CodexUserInput::Text { text, text_elements }
            if text == "真实 runtime 内容" && text_elements.is_empty()
    )));
    assert!(input
            .iter()
            .any(|item| matches!(item, codex::CodexUserInput::Image { url, .. } if url == "data:image/png;base64,cG5n")));
    assert!(!input.iter().any(|item| matches!(
        item,
        codex::CodexUserInput::LocalImage { .. }
            | codex::CodexUserInput::Skill { .. }
            | codex::CodexUserInput::Mention { .. }
    )));
}

#[test]
fn composes_registered_image_attachment_from_preview_path() {
    let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).expect("create temp dir");
    let image_path = dir.join("registered.png");
    fs::write(&image_path, b"png").expect("write image");
    let attachments = vec![BuddyChatAttachment {
        attachment_id: None,
        data_url: None,
        kind: "image".to_owned(),
        mime_type: "image/png".to_owned(),
        name: "registered.png".to_owned(),
        preview_path: Some(image_path.to_string_lossy().into_owned()),
        size_bytes: 3,
        text: None,
    }];

    let input = compose_buddy_chat_codex_inputs("看图", Vec::new(), &attachments, None)
        .expect("compose inputs");

    assert!(input.iter().any(|item| matches!(
        item,
        codex::CodexUserInput::Image { url, .. }
            if url == "data:image/png;base64,cG5n"
    )));
    fs::remove_dir_all(&dir).expect("cleanup temp dir");
}

#[test]
fn composes_user_and_runtime_content_with_codex_context_items() {
    let context_items = vec![
        BuddyChatPromptContextItem {
            description: Some("先拆计划再执行".to_owned()),
            kind: "slashCommand".to_owned(),
            label: "/plan".to_owned(),
            path: None,
            value: "/plan".to_owned(),
        },
        BuddyChatPromptContextItem {
            description: Some("处理 Lexora 桌面端本地运行时".to_owned()),
            kind: "skill".to_owned(),
            label: "lexora-buddy".to_owned(),
            path: Some("/tmp/lexora-buddy/SKILL.md".to_owned()),
            value: "lexora-buddy".to_owned(),
        },
        BuddyChatPromptContextItem {
            description: Some("Control the in-app browser".to_owned()),
            kind: "plugin".to_owned(),
            label: "Browser".to_owned(),
            path: None,
            value: "browser".to_owned(),
        },
        BuddyChatPromptContextItem {
            description: None,
            kind: "file".to_owned(),
            label: "apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
            path: Some("/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue".to_owned()),
            value: "apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
        },
    ];

    let user_content = compose_buddy_chat_user_message_content("检查输入框", &[], &context_items);
    let runtime_content = compose_buddy_chat_runtime_content("检查输入框", &[], &context_items);

    assert!(user_content.contains(
        "上下文：/plan; $lexora-buddy; @Browser; @apps/buddy/src/chat/BuddyChatComposer.vue"
    ));
    assert!(runtime_content.contains("Codex prompt context selected in Lexora"));
    assert!(runtime_content.contains("- Slash command /plan: 先拆计划再执行"));
    assert!(runtime_content.contains("- Skill $lexora-buddy: 处理 Lexora 桌面端本地运行时"));
    assert!(runtime_content.contains("- Plugin @browser (Browser): Control the in-app browser"));
    assert!(
        runtime_content.contains("- File @/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue")
    );
}

#[test]
fn keeps_user_visible_content_free_of_attachment_echo() {
    let attachments = vec![BuddyChatAttachment {
        attachment_id: None,
        kind: "image".to_owned(),
        name: "ig_098b501d3c0430.png".to_owned(),
        mime_type: "image/png".to_owned(),
        size_bytes: 1_800_000,
        data_url: Some("data:image/png;base64,AA==".to_owned()),
        preview_path: None,
        text: None,
    }];

    let user_content =
        compose_buddy_chat_user_message_content("测试 [Image #1] 行内图片引用", &attachments, &[]);
    let runtime_content =
        compose_buddy_chat_runtime_content("测试 [Image #1] 行内图片引用", &attachments, &[]);

    assert_eq!(user_content, "测试 行内图片引用");
    assert!(!user_content.contains("Image #1"));
    assert!(!user_content.contains("ig_098b501d3c0430.png"));
    assert!(runtime_content.contains("测试 [Image #1] 行内图片引用"));
}

#[test]
fn keeps_user_visible_content_free_of_text_file_attachment_echo() {
    let attachments = vec![BuddyChatAttachment {
        attachment_id: None,
        kind: "text".to_owned(),
        name: "note.txt".to_owned(),
        mime_type: "text/plain".to_owned(),
        size_bytes: 5,
        data_url: None,
        preview_path: None,
        text: Some("hello".to_owned()),
    }];

    let user_content = compose_buddy_chat_user_message_content("总结 [File #1]", &attachments, &[]);
    let runtime_content = compose_buddy_chat_runtime_content("总结 [File #1]", &attachments, &[]);

    assert_eq!(user_content, "总结");
    assert!(runtime_content.contains("总结 [File #1]"));
    assert!(runtime_content.contains("Uploaded text file: note.txt"));
}
