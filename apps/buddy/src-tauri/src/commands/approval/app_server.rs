use std::{
    path::{Component, Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

use crate::{
    agents::codex,
    domain::{
        BuddyApprovalStatus, BuddyApprovalTerminalStatus, BuddyRuntime, BuddyRuntimeProtocol,
    },
    error::BuddyError,
    storage::{BuddyStorage, CreateBuddyApprovalRequest, CODEX_APP_SERVER_REQUEST_APPROVAL_KIND},
};

use super::super::{
    read_json_string_field,
    run_state::{is_buddy_run_cancelled, BuddyRunCancellationToken},
};

const CODEX_APP_SERVER_APPROVAL_POLL_INTERVAL_MS: u64 = 250;
const CODEX_APP_SERVER_APPROVAL_WAIT_TIMEOUT_MS: u64 = 30 * 60 * 1000;
const CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED: &str = "auto_denied";
const CODEX_APPROVAL_SCOPE_DECISION_REQUIRES_USER_REVIEW: &str = "requires_user_review";
const CODEX_APPROVAL_SCOPE_STATUS_AUTHORIZED: &str = "authorized";
const CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH: &str = "invalid_path";
const CODEX_APPROVAL_SCOPE_STATUS_OUTSIDE_AUTHORIZED_PROJECT: &str = "outside_authorized_project";
const CODEX_APPROVAL_SCOPE_STATUS_UNSUPPORTED_REQUEST: &str = "unsupported_request";

#[derive(Clone, Debug, PartialEq, Eq)]
struct CodexAppServerApprovalScope {
    authorization_root: String,
    cwd: String,
    decision: &'static str,
    reason: Option<&'static str>,
    status: &'static str,
    target_root: Option<String>,
}

pub(in crate::commands) fn wait_for_codex_app_server_approval(
    storage: &BuddyStorage,
    run_id: &str,
    runtime_cwd: &str,
    request: &codex::CodexAppServerApprovalRequest,
    cancellation: Option<&BuddyRunCancellationToken>,
) -> Result<codex::CodexAppServerApprovalDecision, BuddyError> {
    let scope = create_codex_app_server_approval_scope(runtime_cwd, request);
    let approval = storage.create_approval(CreateBuddyApprovalRequest {
        kind: CODEX_APP_SERVER_REQUEST_APPROVAL_KIND.to_owned(),
        payload: serde_json::json!({
            "authorizationRoot": scope.authorization_root,
            "runtime": BuddyRuntime::Codex.as_str(),
            "cwd": scope.cwd,
            "itemId": request.item_id.clone(),
            "method": request.method.clone(),
            "mode": "codexAppServerRequest",
            "params": request.params.clone(),
            "promptPreview": create_codex_app_server_approval_preview(request),
            "protocol": BuddyRuntimeProtocol::CodexAppServer.as_str(),
            "requestedBy": "codexAppServer",
            "requestId": request.request_id,
            "scopeDecision": scope.decision,
            "scopeReason": scope.reason,
            "scopeStatus": scope.status,
            "targetRoot": scope.target_root,
            "threadId": request.thread_id.clone(),
            "turnId": request.turn_id.clone(),
        }),
        run_id: Some(run_id.to_owned()),
    })?;
    if scope.decision == CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED {
        storage.resolve_codex_app_server_request_approval(
            approval.id.clone(),
            BuddyApprovalTerminalStatus::Denied,
        )?;
        return Ok(codex::CodexAppServerApprovalDecision::Decline);
    }

    let deadline =
        Instant::now() + Duration::from_millis(CODEX_APP_SERVER_APPROVAL_WAIT_TIMEOUT_MS);

    loop {
        if is_buddy_run_cancelled(cancellation) {
            let _ = storage.resolve_codex_app_server_request_approval(
                approval.id.clone(),
                BuddyApprovalTerminalStatus::Cancelled,
            );
            return Err(BuddyError::Runtime("run cancelled".to_owned()));
        }

        let current = storage.find_approval(approval.id.clone())?;
        match current.status.as_str() {
            status if status == BuddyApprovalStatus::Approved.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Accept);
            }
            status if status == BuddyApprovalStatus::Denied.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Decline);
            }
            status if status == BuddyApprovalStatus::Cancelled.as_str() => {
                return Ok(codex::CodexAppServerApprovalDecision::Cancel);
            }
            status if status == BuddyApprovalStatus::Pending.as_str() => {}
            _ => {
                return Err(BuddyError::Validation(format!(
                    "approval status is invalid: {}",
                    current.status
                )));
            }
        }

        if Instant::now() >= deadline {
            let _ = storage.resolve_codex_app_server_request_approval(
                approval.id.clone(),
                BuddyApprovalTerminalStatus::Cancelled,
            );
            return Ok(codex::CodexAppServerApprovalDecision::Cancel);
        }

        thread::sleep(Duration::from_millis(
            CODEX_APP_SERVER_APPROVAL_POLL_INTERVAL_MS,
        ));
    }
}

fn create_codex_app_server_approval_scope(
    runtime_cwd: &str,
    request: &codex::CodexAppServerApprovalRequest,
) -> CodexAppServerApprovalScope {
    let authorization_root_path = normalize_absolute_scope_path(runtime_cwd);
    let authorization_root = authorization_root_path
        .as_ref()
        .map(|path| path_to_lossy_string(path))
        .unwrap_or_else(|| runtime_cwd.to_owned());
    let cwd_candidate =
        read_json_string_field(&request.params, "cwd").unwrap_or_else(|| runtime_cwd.to_owned());
    let cwd_path = normalize_absolute_scope_path(&cwd_candidate);
    let cwd = cwd_path
        .as_ref()
        .map(|path| path_to_lossy_string(path))
        .unwrap_or(cwd_candidate);
    let target_candidate = match request.method.as_str() {
        "item/fileChange/requestApproval" => {
            read_json_string_field(&request.params, "grantRoot").unwrap_or_else(|| cwd.clone())
        }
        _ => cwd.clone(),
    };
    let target_path = normalize_absolute_scope_path(&target_candidate);
    let target_root = target_path.as_ref().map(|path| path_to_lossy_string(path));

    if !is_supported_codex_app_server_approval_method(&request.method) {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request method is not supported by Buddy"),
            status: CODEX_APPROVAL_SCOPE_STATUS_UNSUPPORTED_REQUEST,
            target_root,
        };
    }

    let Some(authorization_root_path) = authorization_root_path else {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("authorized project path is invalid"),
            status: CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH,
            target_root,
        };
    };
    let (Some(cwd_path), Some(target_path)) = (cwd_path, target_path) else {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request path is invalid"),
            status: CODEX_APPROVAL_SCOPE_STATUS_INVALID_PATH,
            target_root,
        };
    };
    if !cwd_path.starts_with(&authorization_root_path)
        || !target_path.starts_with(&authorization_root_path)
    {
        return CodexAppServerApprovalScope {
            authorization_root,
            cwd,
            decision: CODEX_APPROVAL_SCOPE_DECISION_AUTO_DENIED,
            reason: Some("approval request path is outside the authorized project"),
            status: CODEX_APPROVAL_SCOPE_STATUS_OUTSIDE_AUTHORIZED_PROJECT,
            target_root,
        };
    }
    CodexAppServerApprovalScope {
        authorization_root,
        cwd,
        decision: CODEX_APPROVAL_SCOPE_DECISION_REQUIRES_USER_REVIEW,
        reason: None,
        status: CODEX_APPROVAL_SCOPE_STATUS_AUTHORIZED,
        target_root,
    }
}

fn is_supported_codex_app_server_approval_method(method: &str) -> bool {
    matches!(
        method,
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
    )
}

fn normalize_absolute_scope_path(path: &str) -> Option<PathBuf> {
    let path = Path::new(path.trim());
    normalize_absolute_scope_path_buf(path)
}

fn normalize_absolute_scope_path_buf(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(std::path::MAIN_SEPARATOR.to_string()),
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(segment) => normalized.push(segment),
        }
    }

    canonicalize_scope_path(&normalized)
}

fn canonicalize_scope_path(path: &Path) -> Option<PathBuf> {
    if path.exists() {
        return path.canonicalize().ok();
    }

    let mut ancestor = path.parent();
    while let Some(existing_ancestor) = ancestor {
        if existing_ancestor.exists() {
            let canonical_ancestor = existing_ancestor.canonicalize().ok()?;
            let suffix = path.strip_prefix(existing_ancestor).ok()?;

            return Some(canonical_ancestor.join(suffix));
        }

        ancestor = existing_ancestor.parent();
    }

    None
}

fn path_to_lossy_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn create_codex_app_server_approval_preview(
    request: &codex::CodexAppServerApprovalRequest,
) -> String {
    let preview = match request.method.as_str() {
        "item/commandExecution/requestApproval" => {
            read_json_string_field(&request.params, "command")
                .or_else(|| read_json_string_field(&request.params, "reason"))
                .unwrap_or_else(|| "Codex 请求执行命令".to_owned())
        }
        "item/fileChange/requestApproval" => read_json_string_field(&request.params, "reason")
            .or_else(|| {
                read_json_string_field(&request.params, "grantRoot")
                    .map(|root| format!("Codex 请求写入 {root}"))
            })
            .unwrap_or_else(|| "Codex 请求修改文件".to_owned()),
        _ => request.method.clone(),
    };

    preview.chars().take(240).collect()
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use super::{
        create_codex_app_server_approval_scope, wait_for_codex_app_server_approval,
        CodexAppServerApprovalScope,
    };
    use crate::{
        agents::codex,
        storage::{BuddyStorage, CreateBuddyRunRequest, CreateBuddySessionRequest},
    };

    #[test]
    fn keeps_command_approval_inside_authorized_project_for_user_review() {
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "pnpm type-check",
                "cwd": "/tmp/lexora-project/apps/buddy",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_authorized_scope(
            scope,
            "/tmp/lexora-project",
            "/tmp/lexora-project/apps/buddy",
            Some("/tmp/lexora-project/apps/buddy"),
        );
    }

    #[test]
    fn keeps_buddy_animation_script_command_for_user_review() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-approval-animation-script");
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "/usr/bin/zsh -lc \"node agent-skills/lexora-buddy-animation/scripts/lexora-buddy-pet.mjs state\"",
                "cwd": temp_dir.to_string_lossy(),
            }),
        );

        let scope = create_codex_app_server_approval_scope(&temp_dir.to_string_lossy(), &request);

        assert_eq!(scope.decision, "requires_user_review");
        assert_eq!(scope.status, "authorized");
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn auto_denies_command_approval_outside_authorized_project() {
        let storage = create_approval_test_storage();
        let run = create_approval_test_run(&storage);
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "touch /tmp/outside",
                "cwd": "/tmp/other-project",
            }),
        );

        let decision = wait_for_codex_app_server_approval(
            &storage,
            &run.id,
            "/tmp/lexora-project",
            &request,
            None,
        )
        .expect("approval decision");
        let approvals = storage.list_approvals(None, 10).expect("list approvals");
        let events = storage
            .list_run_events(run.id, None, 10)
            .expect("list events");

        assert_eq!(decision, codex::CodexAppServerApprovalDecision::Decline);
        assert_eq!(approvals[0].status, "denied");
        assert_eq!(approvals[0].payload["scopeDecision"], "auto_denied");
        assert_eq!(
            approvals[0].payload["scopeStatus"],
            "outside_authorized_project"
        );
        assert_eq!(approvals[0].payload["targetRoot"], "/tmp/other-project");
        assert_eq!(events[0].event_type, "approval.resolved");
        assert_eq!(events[0].payload["status"], "denied");
    }

    #[test]
    fn auto_denies_file_change_grant_root_outside_authorized_project() {
        let request = create_codex_app_server_approval_request(
            "item/fileChange/requestApproval",
            serde_json::json!({
                "grantRoot": "/tmp/other-project",
                "reason": "need extra write access",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "outside_authorized_project");
        assert_eq!(scope.target_root.as_deref(), Some("/tmp/other-project"));
    }

    #[cfg(unix)]
    #[test]
    fn auto_denies_approval_when_cwd_escapes_authorized_project_through_symlink() {
        let temp_dir = create_buddy_test_dir("lexora-buddy-approval-symlink");
        let project_root = temp_dir.join("project");
        let outside_root = temp_dir.join("outside");
        fs::create_dir_all(&project_root).expect("create project");
        fs::create_dir_all(&outside_root).expect("create outside");
        std::os::unix::fs::symlink(&outside_root, project_root.join("linked-outside"))
            .expect("create symlink");
        let request = create_codex_app_server_approval_request(
            "item/commandExecution/requestApproval",
            serde_json::json!({
                "command": "touch marker",
                "cwd": project_root.join("linked-outside").to_string_lossy(),
            }),
        );

        let scope =
            create_codex_app_server_approval_scope(&project_root.to_string_lossy(), &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "outside_authorized_project");
        fs::remove_dir_all(&temp_dir).expect("cleanup temp dir");
    }

    #[test]
    fn auto_denies_permissions_approval_requests_even_inside_authorized_project() {
        let request = create_codex_app_server_approval_request(
            "item/permissions/requestApproval",
            serde_json::json!({
                "cwd": "/tmp/lexora-project",
                "permissions": {
                    "filesystem": {
                        "read": ["/tmp/lexora-project"],
                        "write": ["/tmp/lexora-project"]
                    }
                },
                "reason": "request broader permission profile",
            }),
        );

        let scope = create_codex_app_server_approval_scope("/tmp/lexora-project", &request);

        assert_eq!(scope.decision, "auto_denied");
        assert_eq!(scope.status, "unsupported_request");
        assert_eq!(scope.cwd, "/tmp/lexora-project");
    }

    fn assert_authorized_scope(
        scope: CodexAppServerApprovalScope,
        authorization_root: &str,
        cwd: &str,
        target_root: Option<&str>,
    ) {
        assert_eq!(scope.decision, "requires_user_review");
        assert_eq!(scope.status, "authorized");
        assert_eq!(scope.cwd, cwd);
        assert_eq!(scope.target_root.as_deref(), target_root);
        assert_eq!(scope.authorization_root, authorization_root);
    }

    fn create_codex_app_server_approval_request(
        method: &str,
        mut params: serde_json::Value,
    ) -> codex::CodexAppServerApprovalRequest {
        let params_object = params.as_object_mut().expect("params object");
        params_object
            .entry("itemId")
            .or_insert_with(|| serde_json::json!("approval-item"));
        params_object
            .entry("threadId")
            .or_insert_with(|| serde_json::json!("thread-1"));
        params_object
            .entry("turnId")
            .or_insert_with(|| serde_json::json!("turn-1"));

        codex::CodexAppServerApprovalRequest {
            item_id: "approval-item".to_owned(),
            method: method.to_owned(),
            params,
            request_id: 41,
            thread_id: "thread-1".to_owned(),
            turn_id: "turn-1".to_owned(),
        }
    }

    fn create_approval_test_storage() -> BuddyStorage {
        BuddyStorage::new_temporary_for_test().expect("create storage")
    }

    fn create_approval_test_run(storage: &BuddyStorage) -> crate::storage::BuddyRun {
        let session = storage
            .create_session(CreateBuddySessionRequest {
                runtime: "codex".to_owned(),
                project_root: None,
                scope: "global".to_owned(),
                title: Some("Codex approval scope".to_owned()),
            })
            .expect("create session");

        storage
            .create_run(CreateBuddyRunRequest {
                runtime: "codex".to_owned(),
                cwd: Some("/tmp/lexora-project".to_owned()),
                external_run_id: None,
                external_thread_id: None,
                session_id: session.id,
            })
            .expect("create run")
    }

    fn create_buddy_test_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }
}
