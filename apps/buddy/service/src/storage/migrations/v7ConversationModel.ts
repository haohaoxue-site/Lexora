export const BUDDY_V7_CONVERSATION_MODEL_SCHEMA_SQL = `
ALTER TABLE conversations
ADD COLUMN model_selection_json TEXT
  CHECK (model_selection_json IS NULL OR json_valid(model_selection_json));

UPDATE conversations
SET model_selection_json = (
  SELECT json_object(
    'providerId', runs.provider,
    'modelId', runs.model,
    'reasoning', run_inputs.reasoning,
    'serviceTier', run_inputs.service_tier
  )
  FROM runs
  LEFT JOIN run_inputs ON run_inputs.run_id = runs.id
  WHERE runs.conversation_id = conversations.id
    AND runs.purpose = 'chat'
  ORDER BY runs.started_at DESC, runs.id DESC
  LIMIT 1
);
`
