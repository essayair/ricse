INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_fluorspar_com_news',
  'FLUORSPAR_COM_NEWS',
  'Fluorspar.com 萤石产业资讯',
  'RSS',
  'ACTIVE',
  '7 */3 * * *',
  '{
    "endpoint":"https://fluorspar.com/feed/",
    "sourceName":"Fluorspar.com",
    "enforceKeywords":false,
    "excludeKeywords":["camera","smart lock","security camera","摄像机","监控器","智能锁","家居安防"]
  }'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = 'ACTIVE',
  "schedule" = EXCLUDED."schedule",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;
