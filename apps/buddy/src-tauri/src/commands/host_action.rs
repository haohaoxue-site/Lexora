mod payloads;
#[cfg(test)]
mod tests;

pub(super) use payloads::strip_buddy_host_action_blocks;

use crate::{
    domain::BuddyRunEventType,
    error::BuddyError,
    storage::{BuddyRunEvent, BuddyStorage, CreateBuddyRunEventRequest},
};

use super::{run_state::BuddyRunStateEventPublisher, runtime_events::CodexRuntimeOutput};
use payloads::collect_buddy_host_action_payloads;

pub(super) fn append_buddy_host_action_events(
    storage: &BuddyStorage,
    run_id: &str,
    events: &mut Vec<BuddyRunEvent>,
    session_id: Option<&str>,
    event_publisher: &BuddyRunStateEventPublisher,
    runtime_output: &CodexRuntimeOutput,
) -> Result<(), BuddyError> {
    for payload in collect_buddy_host_action_payloads(runtime_output, events) {
        let event = storage.append_run_event(CreateBuddyRunEventRequest::new(
            run_id,
            BuddyRunEventType::HostAction,
            payload,
        ))?;
        event_publisher.emit_event(&event, session_id);
        events.push(event);
    }

    Ok(())
}
