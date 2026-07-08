use crate::domain::BuddyRunEventType;

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBuddyRunEventRequest {
    pub(super) run_id: String,
    pub(super) event_type: String,
    pub(super) payload: serde_json::Value,
}

impl CreateBuddyRunEventRequest {
    pub(crate) fn new(
        run_id: impl Into<String>,
        event_type: BuddyRunEventType,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            event_type: event_type.as_str().to_owned(),
            payload,
        }
    }

    pub(crate) fn projected(
        run_id: impl Into<String>,
        event_type: impl Into<String>,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            event_type: event_type.into(),
            payload,
        }
    }

    pub(crate) fn run_id(&self) -> &str {
        &self.run_id
    }

    pub(crate) fn event_type(&self) -> &str {
        &self.event_type
    }

    pub(crate) fn payload(&self) -> &serde_json::Value {
        &self.payload
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEvent {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyChatRunEvent {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEventCount {
    pub run_id: String,
    pub event_count: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyRunEventSummary {
    pub id: i64,
    pub run_id: String,
    pub event_type: String,
    pub payload_preview: String,
    pub payload_chars: i64,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::CreateBuddyRunEventRequest;
    use crate::domain::BuddyRunEventType;

    #[test]
    fn create_run_event_request_new_uses_stable_event_type() {
        let request = CreateBuddyRunEventRequest::new(
            "run-1",
            BuddyRunEventType::RunStarted,
            serde_json::json!({ "runtime": "codex" }),
        );

        assert_eq!(request.event_type, "run.started");
        assert_eq!(request.run_id, "run-1");
        assert_eq!(request.payload["runtime"], "codex");
    }

    #[test]
    fn create_run_event_request_projected_preserves_runtime_event_type() {
        let request = CreateBuddyRunEventRequest::projected(
            "run-1",
            "tool.finished",
            serde_json::json!({ "itemId": "tool-1" }),
        );

        assert_eq!(request.event_type, "tool.finished");
    }
}
