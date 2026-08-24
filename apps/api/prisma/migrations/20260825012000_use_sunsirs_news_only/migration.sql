-- 产业资讯采集口径：仅保留生意社萤石情报（pid=318）。
-- 其他资讯源停止调度，但保留配置和历史记录以便审计。
UPDATE "content_data_sources"
SET "status" = 'INACTIVE',
    "schedule" = NULL,
    "config" = COALESCE("config", '{}'::jsonb) || '{"sourcePolicy":"DISABLED_BY_SCOPE"}'::jsonb,
    "lastError" = '已按平台采集口径停用：产业资讯仅使用生意社萤石情报。',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN (
  'GDELT_FLUORITE_NEWS',
  'SMM_INDUSTRY_RSS',
  'FLUORSPAR_COM_NEWS'
);

UPDATE "content_data_sources"
SET "name" = '生意社萤石情报',
    "status" = 'INACTIVE',
    "schedule" = NULL,
    "config" = COALESCE("config", '{}'::jsonb) || '{
      "pageUrl":"https://www.100ppi.com/qb/?pid=318",
      "productId":318,
      "priority":1,
      "sourceName":"生意社",
      "sourcePolicy":"SOLE_NEWS_SOURCE",
      "accessMode":"OFFICIAL_API_REQUIRED"
    }'::jsonb,
    "lastError" = '当前唯一产业资讯来源；取得生意社授权 API/RSS 或订阅地址后启用，系统不绕过站点安全校验。',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SUNSIRS_FLUORITE_NEWS';
