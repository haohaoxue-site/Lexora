export const BUDDY_V14_PROVIDER_DESCRIPTIONS_SQL = `
ALTER TABLE provider_configs
ADD COLUMN description TEXT
CHECK (description IS NULL OR length(description) <= 200);
`
