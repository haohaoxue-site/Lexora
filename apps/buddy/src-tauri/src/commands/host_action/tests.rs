use super::append_buddy_host_action_events;
use crate::{
    commands::{run_state::BuddyRunStateEventPublisher, runtime_events::CodexRuntimeOutput},
    storage::{
        BuddyStorage, CreateBuddyRunEventRequest, CreateBuddyRunRequest, CreateBuddySessionRequest,
    },
};

#[test]
fn appends_host_action_event_from_streamed_message_delta() {
    let storage = create_host_action_test_storage();
    let run = create_host_action_test_run(&storage);
    let message_delta = storage
        .append_run_event(CreateBuddyRunEventRequest::projected(
            run.id.clone(),
            "message.delta",
            serde_json::json!({
                "delta": "处理中 <lexora_buddy_host_action>{\"action\":\"move\",\"target\":{\"kind\":\"edge\",\"edge\":\"left\"},\"after\":\"celebrate\"}</lexora_buddy_host_action>",
                "itemId": "message-1",
                "protocol": "codex_app_server",
                "threadId": "thread-1",
                "turnId": "turn-1",
            }),
        ))
        .expect("append message delta");
    let mut events = vec![message_delta];
    let runtime_output = CodexRuntimeOutput {
        final_memory_citation: None,
        final_message: "已处理。".to_owned(),
        protocol: "codex_app_server",
        stdout_bytes: None,
        thread_id: Some("thread-1".to_owned()),
        turn_id: Some("turn-1".to_owned()),
    };

    append_buddy_host_action_events(
        &storage,
        &run.id,
        &mut events,
        None,
        &BuddyRunStateEventPublisher::disabled(),
        &runtime_output,
    )
    .expect("append host action");
    let stored_events = storage
        .list_run_events(run.id, None, 10)
        .expect("list events");
    let host_action_event = stored_events
        .iter()
        .find(|event| event.event_type == "host.action")
        .expect("host action event");

    assert_eq!(host_action_event.payload["action"], "move");
    assert_eq!(host_action_event.payload["target"]["kind"], "edge");
    assert_eq!(host_action_event.payload["target"]["edge"], "left");
    assert_eq!(host_action_event.payload["after"], "celebrate");
}

fn create_host_action_test_storage() -> BuddyStorage {
    BuddyStorage::new_temporary_for_test().expect("create storage")
}

fn create_host_action_test_run(storage: &BuddyStorage) -> crate::storage::BuddyRun {
    let session = storage
        .create_session(CreateBuddySessionRequest {
            runtime: "codex".to_owned(),
            project_root: None,
            scope: "global".to_owned(),
            title: Some("Host action event".to_owned()),
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
