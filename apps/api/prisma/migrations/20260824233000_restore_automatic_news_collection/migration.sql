-- 资讯双轨运营：保留人工内容，同时恢复独立 Worker 的自动资讯采集与审核入库。

ALTER TABLE "content_articles"
  ADD COLUMN "dataSourceId" TEXT,
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "ingestionMode" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourcePublishedAt" TIMESTAMP(3),
  ADD COLUMN "collectedAt" TIMESTAMP(3),
  ADD COLUMN "rawData" JSONB,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

UPDATE "content_articles"
SET "ingestionMode" = 'MIGRATION'
WHERE "legacyId" IS NOT NULL;

CREATE UNIQUE INDEX "content_articles_dataSourceId_externalId_key"
  ON "content_articles"("dataSourceId", "externalId");
CREATE INDEX "content_articles_ingestionMode_status_collectedAt_idx"
  ON "content_articles"("ingestionMode", "status", "collectedAt");
CREATE INDEX "content_articles_sourceUrl_idx"
  ON "content_articles"("sourceUrl");

ALTER TABLE "content_articles"
  ADD CONSTRAINT "content_articles_dataSourceId_fkey"
  FOREIGN KEY ("dataSourceId") REFERENCES "content_data_sources"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_gdelt_news',
  'GDELT_FLUORITE_NEWS',
  'GDELT 萤石产业资讯',
  'GDELT',
  'ACTIVE',
  '17 */2 * * *',
  '{"query":"(fluorspar OR fluorite OR \"hydrofluoric acid\" OR \"fluorine chemical\") sourcelang:Chinese","timespan":"3d","maxRecords":50,"keywords":["萤石","氟石","氟化工","氢氟酸","无水氟化氢","氟化铝","含氟","制冷剂"]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "status" = 'ACTIVE',
  "schedule" = EXCLUDED."schedule",
  "config" = COALESCE("content_data_sources"."config", EXCLUDED."config"),
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "content_data_sources"
SET "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'LEGACY_NEWS';
