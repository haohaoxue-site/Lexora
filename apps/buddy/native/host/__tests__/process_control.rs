use std::collections::{HashMap, HashSet};

use serde_json::json;

use super::{policy::*, *};

#[test]
fn request_rejects_ambiguous_selectors_and_unapproved_execution_shapes() {
    for input in [
        json!({"operation":"resolve", "selector":{"pid":42,"name":"sample"}, "protectedPids":[]}),
        json!({"operation":"resolve", "selector":{"pid":0}, "protectedPids":[]}),
        json!({"operation":"read", "pid":4294967296u64, "protectedPids":[]}),
        json!({"operation":"execute", "pid":42, "action":"kill-process", "protectedPids":[]}),
        json!({"operation":"execute", "pid":42,"instanceId":"1","executable":"C:\\sample.exe","action":"stop-service","protectedPids":[]}),
        json!({"operation":"read", "pid":42,"command":"whoami","protectedPids":[]}),
        json!({"operation":"read", "pid":42,"protectedPids":vec![42;65]}),
    ] {
        let mut output = Vec::new();
        assert_eq!(
            run(serde_json::to_vec(&input).unwrap().as_slice(), &mut output),
            Err(ProcessError::Invalid),
            "{input}"
        );
        assert!(output.is_empty());
    }
}

#[test]
fn names_are_literal_executable_names_not_paths_or_patterns() {
    for name in [
        "",
        " ",
        "*",
        "sam?le",
        "[sample]",
        "C:\\sample.exe",
        "foo/bar",
        ".exe",
        "foo\0bar",
    ] {
        let input = json!({"operation":"resolve","selector":{"name":name},"protectedPids":[]});
        assert_eq!(
            read_request(serde_json::to_vec(&input).unwrap().as_slice()).unwrap_err(),
            ProcessError::Invalid,
            "{name}"
        );
    }
    let input = json!({"operation":"resolve","selector":{"name":"示例.EXE"},"protectedPids":[42]});
    assert!(read_request(serde_json::to_vec(&input).unwrap().as_slice()).is_ok());
    assert_eq!(process_name("示例.EXE"), "示例");
}

#[test]
fn oversized_requests_fail_without_output() {
    let mut output = Vec::new();
    assert_eq!(
        run(vec![b' '; 64 * 1024 + 1].as_slice(), &mut output),
        Err(ProcessError::Invalid)
    );
    assert!(output.is_empty());
}

#[test]
fn protected_roots_include_ancestors_and_cycles_terminate() {
    let parents = HashMap::from([(30, 20), (20, 10), (10, 20), (50, 40)]);
    assert_eq!(
        protected_processes(&parents, &[30, 50]),
        HashSet::from([30, 20, 10, 50, 40])
    );
}

#[test]
fn actions_require_same_owner_noncritical_process_and_window_for_graceful_exit() {
    assert_eq!(
        allowed_actions(false, true, false, true),
        [Action::Terminate, Action::Kill]
    );
    assert_eq!(allowed_actions(false, true, false, false), [Action::Kill]);
    for (protected, same_owner, critical) in [
        (true, true, false),
        (false, false, false),
        (false, true, true),
    ] {
        assert!(allowed_actions(protected, same_owner, critical, true).is_empty());
    }
}

fn target() -> Target {
    Target {
        kind: "process",
        pid: 42,
        executable: "C:\\sample.exe".into(),
        instance_id: "133700000000000001".into(),
        started_at: "2026-09-08T00:00:00.0000001Z".into(),
        display_name: "sample".into(),
        interruption: "application",
        allowed_actions: vec![Action::Kill],
    }
}

#[test]
fn execution_rechecks_all_identity_fields_and_fresh_actions() {
    let target = target();
    assert!(
        validate_execution(
            &target,
            42,
            &target.instance_id,
            &target.executable,
            Action::Kill
        )
        .is_ok()
    );
    for (pid, instance, executable) in [
        (43, target.instance_id.as_str(), target.executable.as_str()),
        (42, "133700000000000002", target.executable.as_str()),
        (42, target.instance_id.as_str(), "C:\\other.exe"),
    ] {
        assert_eq!(
            validate_execution(&target, pid, instance, executable, Action::Kill),
            Err(ProcessError::TargetChanged)
        );
    }
    assert_eq!(
        validate_execution(
            &target,
            42,
            &target.instance_id,
            &target.executable,
            Action::Terminate
        ),
        Err(ProcessError::NotAllowed)
    );
}

#[test]
fn target_serialization_preserves_large_identity_without_json_number_rounding() {
    assert_eq!(
        serde_json::to_value([target()]).unwrap(),
        json!([{
            "kind":"process","pid":42,"executable":"C:\\sample.exe","instanceId":"133700000000000001",
            "startedAt":"2026-09-08T00:00:00.0000001Z","displayName":"sample","interruption":"application","allowedActions":["kill-process"]
        }])
    );
}
