use crate::{
    agents::codex::{CodexModelSelection, CodexUserInput},
    error::BuddyResult,
};

use super::CodexAppServerApprovalDecision;

pub(super) fn build_app_server_initialize_request(id: i64) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "initialize",
        "params": {
            "capabilities": {
                "experimentalApi": true,
                "optOutNotificationMethods": [
                    "account/updated",
                    "thread/settings/updated",
                    "thread/tokenUsage/updated",
                ],
            },
            "clientInfo": {
                "name": "lexora_buddy",
                "title": "Lexora",
                "version": env!("CARGO_PKG_VERSION"),
            },
        },
    })
}

pub(super) fn build_app_server_initialized_notification() -> serde_json::Value {
    serde_json::json!({
        "method": "initialized",
    })
}

pub(super) fn build_app_server_request_error_response(id: i64, message: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "error": {
            "code": -32000,
            "message": message,
        },
    })
}

pub(super) fn build_app_server_approval_response(
    id: i64,
    method: &str,
    decision: CodexAppServerApprovalDecision,
) -> BuddyResult<serde_json::Value> {
    match method {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            Ok(serde_json::json!({
                "id": id,
                "result": {
                    "decision": decision.as_protocol_value(),
                },
            }))
        }
        _ => Ok(build_app_server_request_error_response(
            id,
            &format!("codex app-server request denied by Lexora Buddy: {method}"),
        )),
    }
}

pub(super) fn build_app_server_thread_start_request(
    id: i64,
    cwd: &str,
    context_pack: Option<&str>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "thread/start",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "cwd": cwd,
            "ephemeral": false,
            "runtimeWorkspaceRoots": [cwd],
            "sandbox": "workspace-write",
            "sessionStartSource": "startup",
        },
    });

    if let Some(context_pack) = context_pack {
        request["params"]["developerInstructions"] = serde_json::Value::String(context_pack.into());
    }

    request
}

pub(super) fn build_app_server_smoke_thread_start_request(id: i64, cwd: &str) -> serde_json::Value {
    let mut request = build_app_server_thread_start_request(id, cwd, None);
    request["params"]["ephemeral"] = serde_json::Value::Bool(true);

    request
}

pub(super) fn build_app_server_thread_resume_request(
    id: i64,
    thread_id: &str,
    cwd: &str,
    context_pack: Option<&str>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "thread/resume",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "cwd": cwd,
            "excludeTurns": true,
            "runtimeWorkspaceRoots": [cwd],
            "sandbox": "workspace-write",
            "threadId": thread_id,
        },
    });

    if let Some(context_pack) = context_pack {
        request["params"]["developerInstructions"] = serde_json::Value::String(context_pack.into());
    }

    request
}

pub(super) fn build_app_server_skills_list_request(id: i64, cwd: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "skills/list",
        "params": {
            "cwds": [cwd],
            "forceReload": false,
        },
    })
}

pub(super) fn build_app_server_plugin_installed_request(id: i64, cwd: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "plugin/installed",
        "params": {
            "cwds": [cwd],
            "installSuggestionPluginNames": null,
        },
    })
}

pub(super) fn build_app_server_model_list_request(
    id: i64,
    cursor: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "model/list",
        "params": {
            "cursor": cursor,
            "includeHidden": false,
            "limit": 100,
        },
    })
}

pub(super) fn build_app_server_fuzzy_file_search_request(
    id: i64,
    cwd: &str,
    query: &str,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "method": "fuzzyFileSearch",
        "params": {
            "cancellationToken": null,
            "query": query,
            "roots": [cwd],
        },
    })
}

pub(super) fn build_app_server_turn_start_request(
    id: i64,
    thread_id: &str,
    client_user_message_id: &str,
    input: &[CodexUserInput],
    cwd: &str,
    model_selection: Option<&CodexModelSelection>,
) -> serde_json::Value {
    let mut request = serde_json::json!({
        "id": id,
        "method": "turn/start",
        "params": {
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "clientUserMessageId": client_user_message_id,
            "cwd": cwd,
            "input": input,
            "runtimeWorkspaceRoots": [cwd],
            "sandboxPolicy": {
                "type": "workspaceWrite",
                "writableRoots": [cwd],
                "networkAccess": false,
                "excludeTmpdirEnvVar": false,
                "excludeSlashTmp": false,
            },
            "threadId": thread_id,
        },
    });

    if let Some(selection) = model_selection {
        if let Some(model) = selection.model.as_deref().filter(|value| !value.is_empty()) {
            request["params"]["model"] = serde_json::Value::String(model.to_owned());
        }
        if let Some(service_tier) = selection
            .service_tier
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            request["params"]["serviceTier"] = serde_json::Value::String(service_tier.to_owned());
        }
        if let Some(effort) = selection
            .effort
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            request["params"]["effort"] = serde_json::Value::String(effort.to_owned());
        }
    }

    request
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_app_server_file_change_approval_response() {
        let response = build_app_server_approval_response(
            42,
            "item/fileChange/requestApproval",
            CodexAppServerApprovalDecision::Decline,
        )
        .expect("build approval response");

        assert_eq!(response["id"], 42);
        assert_eq!(response["result"]["decision"], "decline");
    }

    #[test]
    fn builds_unsupported_approval_request_as_fail_closed_error_response() {
        let response = build_app_server_approval_response(
            43,
            "item/permissions/requestApproval",
            CodexAppServerApprovalDecision::Decline,
        )
        .expect("build approval response");

        assert_eq!(response["id"], 43);
        assert_eq!(response["error"]["code"], -32000);
        assert!(response["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("denied"));
    }

    #[test]
    fn builds_app_server_initialize_request() {
        let request = build_app_server_initialize_request(7);

        assert_eq!(request["id"], 7);
        assert_eq!(request["method"], "initialize");
        assert_eq!(request["params"]["capabilities"]["experimentalApi"], true);
        assert_eq!(
            request["params"]["capabilities"]["optOutNotificationMethods"],
            serde_json::json!([
                "account/updated",
                "thread/settings/updated",
                "thread/tokenUsage/updated"
            ])
        );
        assert_eq!(request["params"]["clientInfo"]["name"], "lexora_buddy");
        assert_eq!(request["params"]["clientInfo"]["title"], "Lexora");
    }

    #[test]
    fn builds_persistent_workspace_write_app_server_thread_start_request() {
        let request =
            build_app_server_thread_start_request(8, "/tmp/lexora-buddy", Some("context pack"));

        assert_eq!(request["id"], 8);
        assert_eq!(request["method"], "thread/start");
        assert_eq!(request["params"]["cwd"], "/tmp/lexora-buddy");
        assert_eq!(request["params"]["developerInstructions"], "context pack");
        assert_eq!(request["params"]["ephemeral"], false);
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(
            request["params"]["runtimeWorkspaceRoots"][0],
            "/tmp/lexora-buddy"
        );
        assert_eq!(request["params"]["sandbox"], "workspace-write");
    }

    #[test]
    fn builds_ephemeral_app_server_smoke_thread_start_request() {
        let request = build_app_server_smoke_thread_start_request(9, "/tmp/lexora-buddy");

        assert_eq!(request["id"], 9);
        assert_eq!(request["method"], "thread/start");
        assert_eq!(request["params"]["ephemeral"], true);
    }

    #[test]
    fn builds_app_server_thread_resume_request_with_workspace_overrides() {
        let request = build_app_server_thread_resume_request(
            10,
            "thread-existing",
            "/tmp/lexora-buddy",
            None,
        );

        assert_eq!(request["id"], 10);
        assert_eq!(request["method"], "thread/resume");
        assert_eq!(request["params"]["threadId"], "thread-existing");
        assert_eq!(request["params"]["cwd"], "/tmp/lexora-buddy");
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(
            request["params"]["runtimeWorkspaceRoots"][0],
            "/tmp/lexora-buddy"
        );
        assert_eq!(request["params"]["sandbox"], "workspace-write");
        assert_eq!(request["params"].get("ephemeral"), None);
    }

    #[test]
    fn builds_app_server_turn_start_request_with_text_input() {
        let input = vec![
            CodexUserInput::Text {
                text: "hello".to_owned(),
                text_elements: Vec::new(),
            },
            CodexUserInput::Skill {
                name: "lexora-buddy".to_owned(),
                path: "/tmp/lexora-buddy/SKILL.md".to_owned(),
            },
            CodexUserInput::Mention {
                name: "BuddyChatComposer.vue".to_owned(),
                path: "/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue".to_owned(),
            },
            CodexUserInput::Image {
                detail: Some("auto".to_owned()),
                url: "data:image/png;base64,abc".to_owned(),
            },
        ];
        let model_selection = CodexModelSelection {
            effort: Some("high".to_owned()),
            model: Some("gpt-test".to_owned()),
            service_tier: Some("flex".to_owned()),
        };
        let request = build_app_server_turn_start_request(
            9,
            "thread-1",
            "message-1",
            &input,
            "/tmp/cwd",
            Some(&model_selection),
        );

        assert_eq!(request["id"], 9);
        assert_eq!(request["method"], "turn/start");
        assert_eq!(request["params"]["threadId"], "thread-1");
        assert_eq!(request["params"]["clientUserMessageId"], "message-1");
        assert_eq!(request["params"]["cwd"], "/tmp/cwd");
        assert_eq!(request["params"]["approvalPolicy"], "on-request");
        assert_eq!(request["params"]["approvalsReviewer"], "user");
        assert_eq!(request["params"]["runtimeWorkspaceRoots"][0], "/tmp/cwd");
        assert_eq!(request["params"]["model"], "gpt-test");
        assert_eq!(request["params"]["serviceTier"], "flex");
        assert_eq!(request["params"]["effort"], "high");
        assert_eq!(request["params"]["sandboxPolicy"]["type"], "workspaceWrite");
        assert_eq!(
            request["params"]["sandboxPolicy"]["writableRoots"][0],
            "/tmp/cwd"
        );
        assert_eq!(request["params"]["sandboxPolicy"]["networkAccess"], false);
        assert_eq!(request["params"]["input"][0]["type"], "text");
        assert_eq!(request["params"]["input"][0]["text"], "hello");
        assert_eq!(request["params"]["input"][1]["type"], "skill");
        assert_eq!(request["params"]["input"][1]["name"], "lexora-buddy");
        assert_eq!(request["params"]["input"][2]["type"], "mention");
        assert_eq!(
            request["params"]["input"][2]["path"],
            "/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue"
        );
        assert_eq!(request["params"]["input"][3]["type"], "image");
        assert_eq!(request["params"]["input"][3]["detail"], "auto");
        assert_eq!(
            request["params"]["input"][3]["url"],
            "data:image/png;base64,abc"
        );
        assert_eq!(
            request["params"]["input"][0]["text_elements"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
    }
}
