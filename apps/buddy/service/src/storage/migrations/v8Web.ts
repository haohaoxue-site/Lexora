export const BUDDY_V8_WEB_SCHEMA_SQL = `
UPDATE workspace_settings
SET value_json = json_object(
  'search', json_array(
    json_object('provider', 'native', 'enabled', json(CASE WHEN json_extract(value_json, '$.search.native') THEN 'true' ELSE 'false' END)),
    json_object('provider', 'tavily', 'enabled', json(CASE WHEN json_extract(value_json, '$.search.tavily') THEN 'true' ELSE 'false' END)),
    json_object('provider', 'bing', 'enabled', json(CASE WHEN json_extract(value_json, '$.search.bing') THEN 'true' ELSE 'false' END)),
    json_object('provider', 'brave', 'enabled', json(CASE WHEN json_extract(value_json, '$.search.brave') THEN 'true' ELSE 'false' END))
  ),
  'fetch', json_object(
    'render', json(CASE WHEN json_extract(value_json, '$.fetch.render') THEN 'true' ELSE 'false' END),
    'remote', json(CASE WHEN json_extract(value_json, '$.fetch.tavily') THEN 'true' ELSE 'false' END)
  )
)
WHERE key = 'buddy.web';
`
