export const BUDDY_V15_DEFAULT_MODEL_REASONING_SQL = `
ALTER TABLE default_model_setting
ADD COLUMN reasoning TEXT
CHECK (reasoning IS NULL OR reasoning IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
`
