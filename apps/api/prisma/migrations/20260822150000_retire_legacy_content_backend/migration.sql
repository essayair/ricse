CREATE TABLE "content_industry_datasets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "records" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_industry_datasets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_industry_datasets_code_key"
    ON "content_industry_datasets"("code");
CREATE INDEX "content_industry_datasets_status_code_idx"
    ON "content_industry_datasets"("status", "code");

INSERT INTO "content_industry_datasets" (
    "id", "code", "name", "description", "source", "status", "records"
) VALUES (
    'content_dataset_fluorite_trade',
    'FLUORITE_IMPORT_EXPORT',
    '萤石进出口数据',
    '旧产业数据服务下线前迁入的萤石进出口月度数据快照',
    'MIGRATED_LEGACY_SNAPSHOT',
    'ACTIVE',
    '[{"产品":"萤石","年份":"2025年","月份":"1月","进口数量":8845949,"单位":"美元","进口金额":3152468,"出口数量":0.25,"出口金额":1229771},{"产品":"萤石","年份":"2025年","月份":"2月","进口数量":5366601,"单位":"美元","进口金额":1786992,"出口数量":0.41,"出口金额":1771296},{"产品":"萤石","年份":"2025年","月份":"3月","进口数量":1305443,"单位":"美元","进口金额":452208,"出口数量":1.24,"出口金额":5701446},{"产品":"萤石","年份":"2025年","月份":"4月","进口数量":5541122,"单位":"美元","进口金额":1963764,"出口数量":0.26,"出口金额":1201753},{"产品":"萤石","年份":"2025年","月份":"5月","进口数量":6020404,"单位":"美元","进口金额":1999267,"出口数量":1.29,"出口金额":6282562},{"产品":"萤石","年份":"2025年","月份":"6月","进口数量":9218161,"单位":"美元","进口金额":3322438,"出口数量":0.25,"出口金额":1240173},{"产品":"萤石","年份":"2025年","月份":"7月","进口数量":15789163,"单位":"美元","进口金额":4624358,"出口数量":1.51,"出口金额":7743971},{"产品":"萤石","年份":"2025年","月份":"8月","进口数量":10415990,"单位":"美元","进口金额":3184728,"出口数量":2.27,"出口金额":9260940},{"产品":"萤石","年份":"2025年","月份":"9月","进口数量":3419617,"单位":"美元","进口金额":930986,"出口数量":0.61,"出口金额":3317712},{"产品":"萤石","年份":"2025年","月份":"10月","进口数量":3496409,"单位":"美元","进口金额":1166577,"出口数量":0.11,"出口金额":672522},{"产品":"萤石","年份":"2026年","月份":"11月","进口数量":6065589,"单位":"美元","进口金额":1989792,"出口数量":1.11,"出口金额":5682839}]'::jsonb
)
ON CONFLICT ("code") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "source" = EXCLUDED."source",
    "status" = EXCLUDED."status",
    "records" = EXCLUDED."records",
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "content_data_sources"
SET "status" = 'INACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'LEGACY_NEWS';

UPDATE "content_jobs"
SET "status" = 'CANCELLED',
    "finishedAt" = CURRENT_TIMESTAMP,
    "result" = '{"skipped":"legacy content backend retired"}'::jsonb
WHERE "type" = 'NEWS_SYNC'
  AND "status" IN ('PENDING', 'RUNNING');
