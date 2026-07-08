use std::path::Path;

use super::*;

fn create_test_text_input(text: &str) -> Vec<CodexUserInput> {
    vec![CodexUserInput::Text {
        text: text.to_owned(),
        text_elements: Vec::new(),
    }]
}

#[test]
#[cfg(unix)]
fn codex_app_server_smoke_initializes_and_starts_thread_without_turn() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-smoke-{}",
        uuid::Uuid::new_v4()
    ));
    let project_dir = temp_dir.join("project");
    fs::create_dir_all(&project_dir).expect("create project dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-smoke"}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    check_codex_app_server_smoke_with_program_and_cwd(&script_path, &project_dir)
        .expect("app-server smoke should pass");

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn cleans_up_app_server_child_when_thread_start_response_is_invalid() {
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        thread,
        time::{Duration, Instant},
    };

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let pid_path = temp_dir.join("child.pid");
    let script = format!(
        r#"#!/bin/sh
echo $$ > '{}'
IFS= read -r line
printf '%s\n' '{{"id":0,"result":{{}}}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{{"id":1,"result":{{}}}}'
sleep 30
"#,
        pid_path.display()
    );
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let result = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |_| Ok(()),
    );
    let pid = fs::read_to_string(&pid_path).expect("read fake app-server pid");

    assert!(result.is_err());
    assert_process_exits(pid.trim(), Duration::from_secs(1));

    let _ = fs::remove_dir_all(temp_dir);

    fn assert_process_exits(pid: &str, timeout: Duration) {
        let proc_path = Path::new("/proc").join(pid);
        let deadline = Instant::now() + timeout;
        while proc_path.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }

        assert!(
            !proc_path.exists(),
            "fake codex app-server process was not cleaned up"
        );
    }
}

#[test]
#[cfg(unix)]
fn streams_projected_events_from_app_server_turn() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-stream-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/reasoning/textDelta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"reasoning-1","delta":"thinking"}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"hi"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let mut event_types = Vec::new();
    let output = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |event| {
            event_types.push(event.event_type);

            Ok(())
        },
    )
    .expect("run fake app-server");

    assert_eq!(output.final_message, "hi");
    assert_eq!(output.thread_id, "thread-1");
    assert_eq!(output.turn_id.as_deref(), Some("turn-1"));
    assert_eq!(
        event_types,
        vec!["reasoning.delta", "message.delta", "turn.completed"]
    );

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn keeps_final_agent_memory_citation_out_of_final_text() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-citation-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[{"id":"message-1","type":"agentMessage","text":"done","memoryCitation":{"entries":[{"path":"MEMORY.md","lineStart":23,"lineEnd":27,"note":"used Buddy transcript event model"}],"threadIds":["thread-memory"]}}],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let output = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |_| Ok(()),
    )
    .expect("run fake app-server");

    assert_eq!(output.final_message, "done");
    assert_eq!(
        output
            .final_memory_citation
            .as_ref()
            .expect("memory citation")["entries"][0]["path"],
        "MEMORY.md"
    );

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn prefers_completed_agent_message_over_streamed_delta_text() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-final-message-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-draft","delta":"draft <lexora_buddy_animation_intent>{\"intent\":\"celebrate\"}</lexora_buddy_animation_intent>"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[{"id":"message-final","type":"agentMessage","phase":"final_answer","text":"clean final"},{"id":"message-commentary","type":"agentMessage","phase":"commentary","text":"ignored commentary"}],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let mut events = Vec::new();
    let output = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |event| {
            events.push((event.event_type, event.payload.clone()));

            Ok(())
        },
    )
    .expect("run fake app-server");
    let turn_completed = events
        .iter()
        .find(|(event_type, _)| *event_type == "turn.completed")
        .expect("turn.completed event");

    assert_eq!(output.final_message, "clean final");
    assert_eq!(
        turn_completed.1["finalAgentMessage"]["itemId"],
        "message-final"
    );
    assert_eq!(
        turn_completed.1["finalAgentMessage"]["phase"],
        "final_answer"
    );
    assert_eq!(turn_completed.1["finalAgentMessage"]["text"], "clean final");

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn coalesces_adjacent_app_server_delta_events() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-coalesced-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"hello"}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":" "}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"world"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let mut events = Vec::new();
    let output = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |event| {
            events.push((event.event_type, event.payload.clone()));

            Ok(())
        },
    )
    .expect("run fake app-server");

    let event_types = events
        .iter()
        .map(|(event_type, _)| *event_type)
        .collect::<Vec<_>>();
    assert_eq!(output.final_message, "hello world");
    assert_eq!(event_types, vec!["message.delta", "turn.completed"]);
    assert_eq!(events[0].1["delta"], "hello world");

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn resumes_existing_app_server_thread_before_starting_turn() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-resume-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let request_log_path = temp_dir.join("requests.jsonl");
    let script = format!(
        r#"#!/bin/sh
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":0,"result":{{}}}}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":1,"result":{{"thread":{{"id":"thread-existing"}}}}}}'
IFS= read -r line
printf '%s\n' "$line" >> '{request_log}'
printf '%s\n' '{{"id":2,"result":{{"turn":{{"id":"turn-1"}}}}}}'
printf '%s\n' '{{"method":"item/agentMessage/delta","params":{{"threadId":"thread-existing","turnId":"turn-1","itemId":"message-1","delta":"resumed"}}}}'
printf '%s\n' '{{"method":"turn/completed","params":{{"threadId":"thread-existing","turn":{{"id":"turn-1","items":[],"itemsView":{{"type":"complete"}},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}}}}'
"#,
        request_log = request_log_path.display(),
    );
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let output = run_codex_app_server_turn_with_program_cancellation_and_approval_handler(
        &script_path,
        CodexAppServerTurnRequest {
            input: &create_test_text_input("hello again"),
            cwd: "/tmp",
            existing_thread_id: Some("thread-existing"),
            client_user_message_id: "message-2",
            context_pack: None,
            model_selection: None,
            cancellation: None,
        },
        |_| Ok(()),
        |_| Ok(CodexAppServerApprovalDecision::Accept),
    )
    .expect("run fake app-server");
    let requests = fs::read_to_string(&request_log_path).expect("read request log");

    assert_eq!(output.thread_id, "thread-existing");
    assert_eq!(output.final_message, "resumed");
    assert!(requests.contains(r#""method":"thread/resume""#));
    assert!(requests.contains(r#""threadId":"thread-existing""#));
    assert!(!requests.contains(r#""method":"thread/start""#));

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn streams_modern_app_server_notifications_without_losing_unknown_methods() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-modern-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/plan/updated","params":{"threadId":"thread-1","turnId":"turn-1","explanation":"先拆协议","plan":[{"step":"检查 Codex 事件","status":"completed"},{"step":"补 Buddy 投影","status":"inProgress"}]}}'
printf '%s\n' '{"method":"item/plan/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"plan-1","delta":"检查事件"}}'
printf '%s\n' '{"method":"turn/diff/updated","params":{"threadId":"thread-1","turnId":"turn-1","diff":"diff --git a/a b/a"}}'
printf '%s\n' '{"method":"item/fileChange/patchUpdated","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"patch-1","changes":[{"path":"/tmp/a","type":"modify"}]}}'
printf '%s\n' '{"method":"item/mcpToolCall/progress","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"mcp-1","message":"reading resource"}}'
printf '%s\n' '{"id":41,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","startedAtMs":1,"command":"pnpm test","cwd":"/tmp"}}'
IFS= read -r approval_response
printf '%s\n' '{"method":"item/tool/requestUserInput","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"input-1","questions":[{"id":"mode","header":"Mode","question":"Pick one","options":[]}]}}'
printf '%s\n' '{"method":"mcpServer/startupStatus/updated","params":{"server":"docs","status":{"type":"started"}}}'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"done"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let mut events = Vec::new();
    run_codex_app_server_turn_with_program_and_approval_handler(
        &script_path,
        CodexAppServerTurnRequest {
            input: &create_test_text_input("hello"),
            cwd: "/tmp",
            existing_thread_id: None,
            client_user_message_id: "message-1",
            context_pack: None,
            model_selection: None,
            cancellation: None,
        },
        |event| {
            events.push((event.event_type, event.payload.clone()));

            Ok(())
        },
        |_| Ok(CodexAppServerApprovalDecision::Accept),
    )
    .expect("run fake app-server");

    let event_types = events
        .iter()
        .map(|(event_type, _)| *event_type)
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "plan.updated",
            "plan.delta",
            "turn.diff.updated",
            "tool.patch_updated",
            "tool.progress",
            "approval.requested",
            "user_input.requested",
            "codex.notification",
            "message.delta",
            "turn.completed",
        ]
    );
    assert_eq!(
        events[7].1["method"],
        serde_json::Value::String("mcpServer/startupStatus/updated".to_owned())
    );
    assert_eq!(events[2].1["filePaths"], serde_json::json!(["a"]));
    assert_eq!(events[2].1.get("diff"), None);
    assert_eq!(events[3].1["filePaths"], serde_json::json!(["/tmp/a"]));
    assert_eq!(events[3].1.get("changes"), None);

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn responds_to_supported_app_server_approval_requests() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-approval-request-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let response_path = temp_dir.join("approval-response.json");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"id":41,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","command":"pnpm test","cwd":"/tmp"}}'
IFS= read -r approval_response
printf '%s\n' "$approval_response" > '__RESPONSE_PATH__'
printf '%s\n' '{"method":"item/agentMessage/delta","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"approved"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#
        .replace("__RESPONSE_PATH__", &response_path.to_string_lossy());
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let mut events = Vec::new();
    let mut requests = Vec::new();
    let output = run_codex_app_server_turn_with_program_and_approval_handler(
        &script_path,
        CodexAppServerTurnRequest {
            input: &create_test_text_input("hello"),
            cwd: "/tmp",
            existing_thread_id: None,
            client_user_message_id: "message-1",
            context_pack: None,
            model_selection: None,
            cancellation: None,
        },
        |event| {
            events.push((event.event_type, event.payload.clone()));

            Ok(())
        },
        |request| {
            requests.push((
                request.method.clone(),
                request.request_id,
                request.params.clone(),
            ));

            Ok(CodexAppServerApprovalDecision::Accept)
        },
    )
    .expect("run fake app-server");
    let response: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&response_path).expect("read approval response"))
            .expect("parse approval response");

    assert_eq!(output.final_message, "approved");
    assert_eq!(response["id"], 41);
    assert_eq!(response["result"]["decision"], "accept");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].0, "item/commandExecution/requestApproval");
    assert_eq!(requests[0].1, 41);
    assert_eq!(requests[0].2["command"], "pnpm test");
    assert_eq!(
        events
            .iter()
            .map(|(event_type, _)| *event_type)
            .collect::<Vec<_>>(),
        vec!["approval.requested", "message.delta", "turn.completed"]
    );
    assert_eq!(events[0].0, "approval.requested");
    assert_eq!(events[0].1["requestId"], 41);

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn rejects_app_server_approval_requests_without_request_id() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-missing-approval-id-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-1","turnId":"turn-1","itemId":"cmd-1","command":"pnpm test","cwd":"/tmp"}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"completed","error":null,"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let error = run_codex_app_server_turn_with_program_and_approval_handler(
        &script_path,
        CodexAppServerTurnRequest {
            input: &create_test_text_input("hello"),
            cwd: "/tmp",
            existing_thread_id: None,
            client_user_message_id: "message-1",
            context_pack: None,
            model_selection: None,
            cancellation: None,
        },
        |_| Ok(()),
        |_| Ok(CodexAppServerApprovalDecision::Decline),
    )
    .expect_err("approval request without request id should fail");

    assert!(error
        .to_string()
        .contains("approval request missing request id"));

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
fn extracts_thread_id_from_known_app_server_thread_start_shapes() {
    assert_eq!(
        extract_thread_id(&serde_json::json!({"thread": {"id": "thread-a"}})).expect("thread.id"),
        "thread-a"
    );
    assert_eq!(
        extract_thread_id(&serde_json::json!({"thread": {"sessionId": "thread-b"}}))
            .expect("thread.sessionId"),
        "thread-b"
    );
    assert_eq!(
        extract_thread_id(&serde_json::json!({"sessionId": "thread-c"})).expect("result.sessionId"),
        "thread-c"
    );
    assert_eq!(
        extract_thread_id(&serde_json::json!({"threadId": "thread-d"})).expect("result.threadId"),
        "thread-d"
    );
}

#[test]
#[cfg(unix)]
fn failed_turn_completion_returns_error() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-failed-turn-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
IFS= read -r line
printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1"}}}'
printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","items":[],"itemsView":{"type":"complete"},"status":"failed","error":{"message":"server overloaded","codexErrorInfo":"serverOverloaded"},"startedAt":1,"completedAt":2,"durationMs":1000}}}'
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let error = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |_| Ok(()),
    )
    .expect_err("failed turn should fail the run");

    assert!(error
        .to_string()
        .contains("codex app-server turn failed: server overloaded"));

    let _ = fs::remove_dir_all(temp_dir);
}

#[test]
#[cfg(unix)]
fn includes_redacted_stderr_tail_when_app_server_closes_transport() {
    use std::{fs, os::unix::fs::PermissionsExt};

    let temp_dir = std::env::temp_dir().join(format!(
        "lexora-buddy-codex-app-server-stderr-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");
    let script_path = temp_dir.join("codex-app-server");
    let script = r#"#!/bin/sh
printf '%s\n' 'auth failed: OPENAI_API_KEY=sk-test-secret' >&2
printf '%s\n' 'Authorization: Bearer live-token' >&2
IFS= read -r line
printf '%s\n' '{"id":0,"result":{}}'
IFS= read -r line
IFS= read -r line
exit 1
"#;
    fs::write(&script_path, script).expect("write fake app-server");
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
        .expect("make fake app-server executable");

    let error = run_codex_app_server_turn_with_program(
        &script_path,
        &create_test_text_input("hello"),
        "/tmp",
        "message-1",
        None,
        None,
        |_| Ok(()),
    )
    .expect_err("closed transport should fail");
    let message = error.to_string();

    assert!(message.contains("codex app-server closed the transport"));
    assert!(message.contains("stderr tail:"));
    assert!(message.contains("OPENAI_API_KEY=[redacted]"));
    assert!(message.contains("Authorization: Bearer [redacted]"));
    assert!(!message.contains("sk-test-secret"));
    assert!(!message.contains("live-token"));

    let _ = fs::remove_dir_all(temp_dir);
}
