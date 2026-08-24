-- 生意社资讯每天北京时间 08:00、12:00、17:00 采集。
-- 自动发布排序使用原文发布时间，避免同批采集时较旧文章反而排在前面。
UPDATE "content_data_sources"
SET "schedule" = '0 8,12,17 * * *',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SUNSIRS_FLUORITE_NEWS';

UPDATE "content_articles"
SET "publishAt" = "sourcePublishedAt",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "dataSourceId" = 'content_source_sunsirs_fluorite_news'
  AND "ingestionMode" = 'AUTO'
  AND "sourcePublishedAt" IS NOT NULL;
