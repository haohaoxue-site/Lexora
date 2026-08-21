export const BUDDY_V6_RUN_INPUTS_SQL = `
CREATE TABLE run_inputs (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  attachment_ids_json TEXT NOT NULL,
  context_items_json TEXT NOT NULL,
  reasoning TEXT,
  service_tier TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO run_inputs (
  run_id, prompt, attachment_ids_json, context_items_json,
  reasoning, service_tier, created_at
)
SELECT
  runs.id,
  CASE
    WHEN json_valid(messages.content_json)
      THEN COALESCE(
        json_extract(messages.content_json, '$.modelInputText'),
        json_extract(messages.content_json, '$.text'),
        ''
      )
    ELSE ''
  END,
  CASE
    WHEN json_valid(messages.content_json)
      AND json_type(messages.content_json, '$.attachmentIds') = 'array'
      THEN json_extract(messages.content_json, '$.attachmentIds')
    ELSE '[]'
  END,
  CASE
    WHEN json_valid(messages.content_json)
      AND json_type(messages.content_json, '$.contextItems') = 'array'
      THEN json_extract(messages.content_json, '$.contextItems')
    ELSE '[]'
  END,
  NULL,
  NULL,
  runs.started_at
FROM runs
LEFT JOIN messages ON messages.id = runs.triggering_message_id;
`
