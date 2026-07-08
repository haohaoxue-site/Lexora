use crate::{error::BuddyResult, storage::BuddyStorage};

use super::{counts, scoped, single_run};
use crate::storage::run_events::{
    BuddyChatRunEvent, BuddyRunEvent, BuddyRunEventCount, BuddyRunEventSummary,
};

impl BuddyStorage {
    pub fn list_run_events(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_run_events", |connection| {
            single_run::list_run_events(connection, run_id, after_id, limit)
        })
    }

    pub fn count_run_events(&self, run_ids: Vec<String>) -> BuddyResult<Vec<BuddyRunEventCount>> {
        self.with_connection("count_run_events", |connection| {
            counts::count_run_events(connection, run_ids)
        })
    }

    pub fn list_chat_run_events(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_run_events", |connection| {
            single_run::list_chat_run_events(connection, run_id, after_id, limit)
        })
    }

    pub fn list_run_event_summaries(
        &self,
        run_id: String,
        after_id: Option<i64>,
        limit: i64,
        payload_preview_chars: i64,
    ) -> BuddyResult<Vec<BuddyRunEventSummary>> {
        self.with_connection("list_run_event_summaries", |connection| {
            single_run::list_run_event_summaries(
                connection,
                run_id,
                after_id,
                limit,
                payload_preview_chars,
            )
        })
    }

    pub fn list_session_run_events(
        &self,
        session_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_session_run_events", |connection| {
            scoped::list_session_run_events(
                connection,
                session_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_conversation_run_events(
        &self,
        conversation_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyRunEvent>> {
        self.with_connection("list_conversation_run_events", |connection| {
            scoped::list_conversation_run_events(
                connection,
                conversation_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_chat_session_run_events(
        &self,
        session_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_session_run_events", |connection| {
            scoped::list_chat_session_run_events(
                connection,
                session_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }

    pub fn list_chat_conversation_run_events(
        &self,
        conversation_id: String,
        after_id: Option<i64>,
        run_limit: i64,
        event_limit: i64,
    ) -> BuddyResult<Vec<BuddyChatRunEvent>> {
        self.with_connection("list_chat_conversation_run_events", |connection| {
            scoped::list_chat_conversation_run_events(
                connection,
                conversation_id,
                after_id,
                run_limit,
                event_limit,
            )
        })
    }
}
