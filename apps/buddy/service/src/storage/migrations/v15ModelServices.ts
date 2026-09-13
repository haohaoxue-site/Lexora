export const BUDDY_V15_PROVIDER_INSTANCES_SCHEMA_SQL = `
CREATE TABLE builtin_provider_configs (
  id TEXT PRIMARY KEY,
  builtin_provider_id TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO builtin_provider_configs (id, builtin_provider_id, created_at, updated_at)
SELECT provider_id, provider_id, created_at, updated_at
FROM provider_states
WHERE provider_id NOT IN (SELECT id FROM provider_configs);
`

export const BUDDY_V15_CATALOG_MODEL_ID_SCHEMA_SQL = `
ALTER TABLE provider_model_states ADD COLUMN catalog_model_id TEXT;
`

export const BUDDY_V15_CATALOG_SELECTION_SCHEMA_SQL = `
ALTER TABLE provider_model_states
  ADD COLUMN catalog_selection_json TEXT
  CHECK (catalog_selection_json IS NULL OR json_valid(catalog_selection_json));
`

export const BUDDY_V15_CAPABILITY_OVERRIDES_SCHEMA_SQL = `
ALTER TABLE provider_model_states
  ADD COLUMN capability_overrides_json TEXT
  CHECK (capability_overrides_json IS NULL OR json_valid(capability_overrides_json));
`

export const BUDDY_V15_REQUEST_HEADERS_SCHEMA_SQL = `
ALTER TABLE provider_states ADD COLUMN request_headers_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(request_headers_json));
`

export const BUDDY_V15_MODEL_SERVICES_SCHEMA_SQL = `
ALTER TABLE provider_model_states
  ADD COLUMN thinking_level_map_json TEXT
  CHECK (thinking_level_map_json IS NULL OR json_valid(thinking_level_map_json));

ALTER TABLE provider_model_states
  ADD COLUMN sampling_params_json TEXT
  CHECK (sampling_params_json IS NULL OR json_valid(sampling_params_json));

ALTER TABLE provider_model_states
  ADD COLUMN compat_json TEXT
  CHECK (compat_json IS NULL OR json_valid(compat_json));

ALTER TABLE provider_model_states ADD COLUMN catalog_provider_id TEXT;
ALTER TABLE provider_model_states ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT '';

${BUDDY_V15_CATALOG_MODEL_ID_SCHEMA_SQL}
${BUDDY_V15_CATALOG_SELECTION_SCHEMA_SQL}
${BUDDY_V15_CAPABILITY_OVERRIDES_SCHEMA_SQL}
${BUDDY_V15_PROVIDER_INSTANCES_SCHEMA_SQL}
${BUDDY_V15_REQUEST_HEADERS_SCHEMA_SQL}
`
