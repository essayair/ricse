INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "lastError", "createdAt", "updatedAt"
) VALUES (
  'content_source_sunsirs_fluorite_news',
  'SUNSIRS_FLUORITE_NEWS',
  '生意社萤石情报（主来源）',
  'API',
  'INACTIVE',
  NULL,
  '{
    "pageUrl":"https://www.100ppi.com/qb/?pid=318",
    "productId":318,
    "priority":1,
    "accessMode":"OFFICIAL_API_REQUIRED"
  }'::jsonb,
  '公开页面启用 JavaScript 安全检查；需取得生意社授权 API 或官方订阅地址后启用，系统不会绕过反爬验证。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = 'INACTIVE',
  "schedule" = NULL,
  "config" = EXCLUDED."config",
  "lastError" = EXCLUDED."lastError",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{"priority":2}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FLUORSPAR_COM_NEWS';

UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{"priority":3}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GDELT_FLUORITE_NEWS';

UPDATE "content_data_sources"
SET "config" = COALESCE("config", '{}'::jsonb) || '{"priority":4}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SMM_INDUSTRY_RSS';
