-- 生意社自动采集资讯取消人工审核：既有待审核数据立即发布，后续由采集器直接发布。
UPDATE "content_articles"
SET "status" = 'PUBLISHED',
    "publishAt" = COALESCE("publishAt", CURRENT_TIMESTAMP),
    "tags" = CASE
      WHEN NOT ('自动发布' = ANY("tags")) THEN array_append("tags", '自动发布')
      ELSE "tags"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "dataSourceId" = 'content_source_sunsirs_fluorite_news'
  AND "ingestionMode" = 'AUTO'
  AND "status" = 'PENDING_REVIEW';
