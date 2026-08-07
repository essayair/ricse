CREATE TABLE "standard_commodities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "baseName" TEXT NOT NULL,
    "commodityForm" TEXT NOT NULL,
    "coreSpecName" TEXT NOT NULL,
    "coreSpecOperator" TEXT NOT NULL,
    "coreSpecValue" TEXT NOT NULL,
    "coreSpecUnit" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'TON',
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_commodities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "materials"
ADD COLUMN "standardCommodityId" TEXT,
ADD COLUMN "referenceType" TEXT NOT NULL DEFAULT 'TRADING_GOODS',
ADD COLUMN "commodityForm" TEXT;

CREATE UNIQUE INDEX "standard_commodities_code_key" ON "standard_commodities"("code");
CREATE UNIQUE INDEX "standard_commodities_fingerprint_key" ON "standard_commodities"("fingerprint");
CREATE INDEX "standard_commodities_categoryId_idx" ON "standard_commodities"("categoryId");
CREATE INDEX "standard_commodities_status_idx" ON "standard_commodities"("status");
CREATE INDEX "materials_standardCommodityId_idx" ON "materials"("standardCommodityId");
CREATE INDEX "materials_referenceType_idx" ON "materials"("referenceType");

ALTER TABLE "standard_commodities"
ADD CONSTRAINT "standard_commodities_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "materials"
ADD CONSTRAINT "materials_standardCommodityId_fkey"
FOREIGN KEY ("standardCommodityId") REFERENCES "standard_commodities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH legacy AS (
    SELECT
        m."id" AS "materialId",
        'std_' || md5(m."id") AS "standardId",
        'STD' || lpad(row_number() OVER (ORDER BY m."createdAt", m."id")::text, 6, '0') AS "standardCode"
    FROM "materials" m
)
INSERT INTO "standard_commodities" (
    "id", "code", "name", "categoryId", "baseName", "commodityForm",
    "coreSpecName", "coreSpecOperator", "coreSpecValue", "coreSpecUnit",
    "packageType", "unit", "fingerprint", "status", "createdAt", "updatedAt"
)
SELECT
    legacy."standardId", legacy."standardCode", m."name", m."categoryId", m."name", COALESCE(m."spec", ''),
    CASE WHEN m."grade" IS NULL THEN '' ELSE '历史规格' END, '', COALESCE(m."grade", ''), '',
    COALESCE(m."packageType", ''), m."unit", 'legacy:' || m."id", m."status", m."createdAt", m."updatedAt"
FROM "materials" m
JOIN legacy ON legacy."materialId" = m."id";

UPDATE "materials" m
SET "standardCommodityId" = 'std_' || md5(m."id"),
    "commodityForm" = COALESCE(m."spec", '')
WHERE m."standardCommodityId" IS NULL;
