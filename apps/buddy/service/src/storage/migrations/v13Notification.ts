export const BUDDY_V13_NOTIFICATION_SQL = `
DELETE FROM notification_attention_states
WHERE origin = 'local-runtime'
  AND kind IN ('approval.requested', 'run.completed', 'run.failed');
`
