use std::{
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;

use super::{Action, ServiceError};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub(super) enum State {
    #[serde(rename = "active")]
    Running,
    #[serde(rename = "inactive")]
    Stopped,
    #[serde(rename = "transitioning")]
    Transitioning,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Target {
    kind: &'static str,
    scope: &'static str,
    service_id: String,
    display_id: String,
    display_name: String,
    active_state: State,
    interruption: &'static str,
    allowed_actions: Vec<Action>,
}

impl Target {
    pub(super) fn new(service_id: &str, display_name: &str, state: State, can_stop: bool) -> Self {
        let allowed_actions = if is_protected(service_id) {
            Vec::new()
        } else {
            match state {
                State::Stopped => vec![Action::Start],
                State::Running if can_stop => vec![Action::Stop, Action::Restart],
                _ => Vec::new(),
            }
        };
        Self {
            kind: "service",
            scope: "system",
            service_id: service_id.to_owned(),
            display_id: service_id.to_owned(),
            display_name: display_name.to_owned(),
            active_state: state,
            interruption: "service",
            allowed_actions,
        }
    }
}

pub(super) fn is_protected(service_id: &str) -> bool {
    let name = service_id.to_ascii_lowercase();
    matches!(name.as_str(), "rpcss" | "dcomlaunch" | "samss" | "winmgmt")
        || [
            "lexorabuddy",
            "lexora-buddy",
            "lexora_buddy",
            "lexora.buddy",
            "lexora buddy",
        ]
        .iter()
        .any(|pattern| name.contains(pattern))
}

pub(super) trait Service {
    fn target(&self) -> Result<Target, ServiceError>;
    fn stop(&self) -> Result<(), ServiceError>;
    fn start(&self) -> Result<(), ServiceError>;
    fn wait_for(&self, state: State) -> Result<(), ServiceError>;
}

pub(super) fn execute(service: &impl Service, action: Action) -> Result<Target, ServiceError> {
    let target = service.target()?;
    if !target.allowed_actions.contains(&action) {
        return Err(ServiceError::NotAllowed);
    }
    if matches!(action, Action::Stop | Action::Restart) {
        service.stop()?;
        service.wait_for(State::Stopped)?;
    }
    if matches!(action, Action::Start | Action::Restart) {
        service.start()?;
        service.wait_for(State::Running)?;
    }
    Ok(target)
}

pub(super) fn wait_for_state(
    mut read: impl FnMut() -> Result<State, ServiceError>,
    expected: State,
    timeout: Duration,
) -> Result<(), ServiceError> {
    let started = Instant::now();
    loop {
        if read()? == expected {
            return Ok(());
        }
        let remaining = timeout.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err(ServiceError::Timeout);
        }
        thread::sleep(remaining.min(Duration::from_millis(200)));
    }
}
