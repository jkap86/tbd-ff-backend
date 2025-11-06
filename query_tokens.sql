SELECT
  pt.user_id,
  u.username,
  pt.device_type,
  pt.device_id,
  LEFT(pt.token, 30) as token_preview,
  pt.is_active,
  pt.created_at,
  pt.last_used_at
FROM push_tokens pt
JOIN users u ON u.id = pt.user_id
ORDER BY pt.last_used_at DESC;
