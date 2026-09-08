use std::{
    cell::{Cell, RefCell},
    time::Duration,
};

use serde_json::json;

use super::{
    execution::{self, Service, State, Target},
    *,
};

#[test]
fn request_preserves_unicode_service_identity() {
    let request = read_request(
        br#"{"operation":"execute","serviceId":"Example-Service","action":"restart-service"}"#
            .as_slice(),
    )
    .unwrap();
    assert_eq!(
        (request.operation, request.action),
        (Operation::Execute, Some(Action::Restart))
    );
    let bytes =
        serde_json::to_vec(&json!({"operation":"resolve", "serviceId":"示例服务"})).unwrap();
    assert_eq!(
        read_request(bytes.as_slice()).unwrap().service_id,
        "示例服务"
    );
}

#[test]
fn rejects_invalid_operations_actions_and_unknown_fields_without_output() {
    for request in [
        json!({"operation":"shell", "serviceId":"sample"}),
        json!({"operation":"execute", "serviceId":"sample"}),
        json!({"operation":"execute", "serviceId":"sample", "action":"kill-process"}),
        json!({"operation":"read", "serviceId":"sample", "action":"stop-service"}),
        json!({"operation":"resolve", "serviceId":"sample", "scope":"user"}),
        json!({"operation":"resolve", "serviceId":"sample", "command":"whoami"}),
    ] {
        let mut output = Vec::new();
        let input = serde_json::to_vec(&request).unwrap();
        assert_eq!(
            run(input.as_slice(), &mut output),
            Err(ServiceError::Invalid),
            "{request}"
        );
        assert!(output.is_empty());
    }
}

#[test]
fn rejects_invalid_service_names_and_oversized_input() {
    for name in [
        "".to_owned(),
        " ".to_owned(),
        "sample\0suffix".to_owned(),
        "foo/bar".to_owned(),
        "foo\\bar".to_owned(),
        "\nservice".to_owned(),
        "a".repeat(257),
        "😀".repeat(129),
    ] {
        let input = serde_json::to_vec(&json!({"operation":"read", "serviceId":name})).unwrap();
        assert_eq!(
            read_request(input.as_slice()).unwrap_err(),
            ServiceError::Invalid
        );
    }
    assert_eq!(
        read_request(vec![b' '; 16 * 1024 + 1].as_slice()).unwrap_err(),
        ServiceError::Invalid
    );
}

#[test]
fn target_serialization_matches_the_system_host_contract() {
    let target = Target::new("SampleService", "示例服务", State::Running, true);
    assert_eq!(
        serde_json::to_value([target]).unwrap(),
        json!([{
            "kind":"service", "scope":"system", "serviceId":"SampleService", "displayId":"SampleService",
            "displayName":"示例服务", "activeState":"active", "interruption":"service",
            "allowedActions":["stop-service", "restart-service"]
        }])
    );
}

#[test]
fn service_actions_follow_current_state_and_stop_support() {
    for (state, can_stop, actions) in [
        (State::Stopped, false, json!(["start-service"])),
        (State::Running, false, json!([])),
        (
            State::Running,
            true,
            json!(["stop-service", "restart-service"]),
        ),
        (State::Transitioning, true, json!([])),
    ] {
        let target =
            serde_json::to_value(Target::new("sample", "sample", state, can_stop)).unwrap();
        assert_eq!(target["allowedActions"], actions);
    }
}

#[test]
fn core_windows_and_buddy_services_never_offer_actions() {
    for name in [
        "RpcSs",
        "DCOMLaunch",
        "sAmSs",
        "Winmgmt",
        "LexoraBuddy",
        "Lexora-Buddy-Helper",
        "lexora_buddy",
        "Lexora.Buddy",
        "Lexora Buddy",
    ] {
        for state in [State::Running, State::Stopped] {
            let target = serde_json::to_value(Target::new(name, name, state, true)).unwrap();
            assert_eq!(target["allowedActions"], json!([]), "{name}");
        }
    }
    assert!(!execution::is_protected("SampleService"));
}

struct SampleService {
    state: Cell<State>,
    stop_completes: bool,
    start_fails: bool,
    transitions: RefCell<Vec<State>>,
}

impl SampleService {
    fn running() -> Self {
        Self {
            state: Cell::new(State::Running),
            stop_completes: true,
            start_fails: false,
            transitions: RefCell::new(Vec::new()),
        }
    }

    fn transition(&self, state: State) {
        self.state.set(state);
        self.transitions.borrow_mut().push(state);
    }
}

impl Service for SampleService {
    fn target(&self) -> Result<Target, ServiceError> {
        Ok(Target::new("sample", "sample", self.state.get(), true))
    }

    fn stop(&self) -> Result<(), ServiceError> {
        self.transition(State::Transitioning);
        Ok(())
    }

    fn start(&self) -> Result<(), ServiceError> {
        assert_eq!(
            self.state.get(),
            State::Stopped,
            "Must observe stopped before starting"
        );
        if self.start_fails {
            return Err(ServiceError::Failed);
        }
        self.transition(State::Running);
        Ok(())
    }

    fn wait_for(&self, state: State) -> Result<(), ServiceError> {
        if state == State::Stopped && self.stop_completes {
            self.transition(State::Stopped);
        }
        execution::wait_for_state(|| Ok(self.state.get()), state, Duration::ZERO)
    }
}

#[test]
fn restart_waits_for_stopped_then_running() {
    let service = SampleService::running();
    execution::execute(&service, Action::Restart).unwrap();
    assert_eq!(
        *service.transitions.borrow(),
        [State::Transitioning, State::Stopped, State::Running]
    );
}

#[test]
fn restart_timeout_does_not_proceed_to_start() {
    let service = SampleService {
        stop_completes: false,
        ..SampleService::running()
    };
    assert_eq!(
        execution::execute(&service, Action::Restart).unwrap_err(),
        ServiceError::Timeout
    );
    assert_eq!(*service.transitions.borrow(), [State::Transitioning]);
}

#[test]
fn failed_restart_start_keeps_the_observed_stopped_state() {
    let service = SampleService {
        start_fails: true,
        ..SampleService::running()
    };
    assert_eq!(
        execution::execute(&service, Action::Restart).unwrap_err(),
        ServiceError::Failed
    );
    assert_eq!(
        *service.transitions.borrow(),
        [State::Transitioning, State::Stopped]
    );
}

#[test]
fn rejects_actions_not_supported_by_the_fresh_state() {
    let service = SampleService::running();
    service.state.set(State::Stopped);
    assert_eq!(
        execution::execute(&service, Action::Restart).unwrap_err(),
        ServiceError::NotAllowed
    );
    assert!(service.transitions.borrow().is_empty());
}

#[test]
fn stop_never_restarts_and_start_never_stops() {
    let service = SampleService::running();
    execution::execute(&service, Action::Stop).unwrap();
    assert_eq!(
        *service.transitions.borrow(),
        [State::Transitioning, State::Stopped]
    );
    service.transitions.borrow_mut().clear();
    execution::execute(&service, Action::Start).unwrap();
    assert_eq!(*service.transitions.borrow(), [State::Running]);
}

#[test]
fn polling_does_not_hide_query_failures() {
    assert_eq!(
        execution::wait_for_state(
            || Err(ServiceError::Failed),
            State::Running,
            Duration::from_secs(8)
        ),
        Err(ServiceError::Failed)
    );
}

#[cfg(windows)]
#[test]
fn reads_real_scm_service_and_preserves_canonical_name() {
    let mut output = Vec::new();
    run(
        br#"{"operation":"resolve","serviceId":"rpcss"}"#.as_slice(),
        &mut output,
    )
    .unwrap();
    let targets: serde_json::Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(targets[0]["serviceId"], "RpcSs");
    assert_eq!(targets[0]["activeState"], "active");
    assert_eq!(targets[0]["allowedActions"], json!([]));
}

#[cfg(windows)]
#[test]
fn real_scm_missing_service_differs_from_disallowed_operation() {
    let mut output = Vec::new();
    run(
        br#"{"operation":"read","serviceId":"LexoraNonexistentContractTestService"}"#.as_slice(),
        &mut output,
    )
    .unwrap();
    assert_eq!(output, b"[]");
    output.clear();
    assert_eq!(run(br#"{"operation":"execute","serviceId":"LexoraNonexistentContractTestService","action":"start-service"}"#.as_slice(), &mut output), Err(ServiceError::TargetChanged));
    assert_eq!(
        run(
            br#"{"operation":"execute","serviceId":"RpcSs","action":"stop-service"}"#.as_slice(),
            &mut output
        ),
        Err(ServiceError::NotAllowed)
    );
    assert!(output.is_empty());
}
