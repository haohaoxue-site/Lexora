export const BUDDY_V8_USAGE_EVENT_OUTBOX_SQL = `
CREATE TABLE usage_event_outbox (
  usage_record_id TEXT PRIMARY KEY REFERENCES usage_records(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_usage_event_outbox_created
  ON usage_event_outbox(created_at, usage_record_id);
`
