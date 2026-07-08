use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use tauri::{AppHandle, Emitter};

use crate::storage::{BuddyFinishedRun, BuddyRun, BuddyRunEvent};

const BUDDY_RUN_STATE_CHANGED_EVENT: &str = "buddy-run-state-changed";

#[derive(Clone, Default)]
pub struct BuddyRunCancellationRegistry {
    tokens: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl BuddyRunCancellationRegistry {
    pub(super) fn register(&self, run_id: &str) -> BuddyRunCancellationToken {
        let token = Arc::new(AtomicBool::new(false));
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.insert(run_id.to_owned(), Arc::clone(&token));
        }

        token
    }

    pub(super) fn cancel(&self, run_id: &str) -> bool {
        let Some(token) = self.token(run_id) else {
            return false;
        };

        token.store(true, Ordering::SeqCst);
        true
    }

    pub(super) fn remove(&self, run_id: &str) {
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.remove(run_id);
        }
    }

    fn token(&self, run_id: &str) -> Option<BuddyRunCancellationToken> {
        self.tokens
            .lock()
            .ok()
            .and_then(|tokens| tokens.get(run_id).cloned())
    }
}

pub(super) type BuddyRunCancellationToken = Arc<AtomicBool>;

pub(super) fn is_buddy_run_cancelled(cancellation: Option<&BuddyRunCancellationToken>) -> bool {
    cancellation.is_some_and(|token| token.load(Ordering::SeqCst))
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuddyRunStateChangedEvent {
    run_id: String,
    session_id: Option<String>,
    event_id: Option<i64>,
    event_type: Option<String>,
    status: Option<String>,
}

#[derive(Clone)]
pub(super) struct BuddyRunStateEventPublisher {
    app: Option<AppHandle>,
}

impl BuddyRunStateEventPublisher {
    pub(super) fn new(app: AppHandle) -> Self {
        Self { app: Some(app) }
    }

    pub(super) fn disabled() -> Self {
        Self { app: None }
    }

    pub(super) fn emit_event(&self, event: &BuddyRunEvent, session_id: Option<&str>) {
        self.emit(create_buddy_run_state_changed_event_from_event(
            event, session_id, None,
        ));
    }

    pub(super) fn emit_events(&self, events: &[BuddyRunEvent], session_id: Option<&str>) {
        for event in events {
            self.emit_event(event, session_id);
        }
    }

    pub(super) fn emit_run(&self, run: &BuddyRun) {
        self.emit(create_buddy_run_state_changed_event_from_run(run));
    }

    pub(super) fn emit_finished_run(&self, finished_run: &BuddyFinishedRun) {
        self.emit(create_buddy_run_state_changed_event_from_event(
            &finished_run.event,
            finished_run.run.session_id.as_deref(),
            Some(&finished_run.run.status),
        ));
        self.emit_run(&finished_run.run);
    }

    fn emit(&self, payload: BuddyRunStateChangedEvent) {
        if let Some(app) = &self.app {
            let _ = app.emit(BUDDY_RUN_STATE_CHANGED_EVENT, payload);
        }
    }
}

fn create_buddy_run_state_changed_event_from_event(
    event: &BuddyRunEvent,
    session_id: Option<&str>,
    status: Option<&str>,
) -> BuddyRunStateChangedEvent {
    BuddyRunStateChangedEvent {
        run_id: event.run_id.clone(),
        session_id: session_id.map(str::to_owned),
        event_id: Some(event.id),
        event_type: Some(event.event_type.clone()),
        status: status.map(str::to_owned),
    }
}

fn create_buddy_run_state_changed_event_from_run(run: &BuddyRun) -> BuddyRunStateChangedEvent {
    BuddyRunStateChangedEvent {
        run_id: run.id.clone(),
        session_id: run.session_id.clone(),
        event_id: None,
        event_type: None,
        status: Some(run.status.clone()),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use super::BuddyRunCancellationRegistry;

    #[test]
    fn run_cancellation_registry_cancels_only_the_registered_run() {
        let registry = BuddyRunCancellationRegistry::default();
        let first = registry.register("run-1");
        let second = registry.register("run-2");

        assert!(registry.cancel("run-1"));

        assert!(first.load(Ordering::SeqCst));
        assert!(!second.load(Ordering::SeqCst));
        registry.remove("run-1");
        assert!(!registry.cancel("run-1"));
    }
}
