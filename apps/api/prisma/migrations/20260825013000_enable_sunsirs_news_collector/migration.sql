-- 迁移旧 spiderworks 的生意社萤石资讯采集口径到 RICSE Content Worker。
-- 仅访问公开列表与详情页；使用透明客户端标识，不处理安全挑战。
UPDATE "content_data_sources"
SET "name" = '生意社萤石资讯',
    "type" = 'API',
    "status" = 'ACTIVE',
    "schedule" = '0 5 * * *',
    "config" = '{
      "pageUrl":"https://www.100ppi.com/qb/?pid=318",
      "productId":318,
      "priority":1,
      "sourceName":"生意社",
      "sourcePolicy":"SOLE_NEWS_SOURCE",
      "accessMode":"PUBLIC_HTML",
      "maxPages":1,
      "maxRecords":20,
      "detailDelayMs":3000,
      "enforceKeywords":false
    }'::jsonb,
    "lastError" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SUNSIRS_FLUORITE_NEWS';
