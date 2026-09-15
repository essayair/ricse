-- 业务单元、用户多业务单元归属与合同经营归属。
CREATE TABLE "business_units" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'COMPREHENSIVE',
  "companyId" TEXT NOT NULL,
  "parentId" TEXT,
  "profitCenterCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_units_code_key" ON "business_units"("code");
CREATE INDEX "business_units_companyId_status_idx" ON "business_units"("companyId", "status");
CREATE INDEX "business_units_parentId_idx" ON "business_units"("parentId");

ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_units"
  ADD CONSTRAINT "business_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "user_business_units" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessUnitId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_business_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_business_units_userId_businessUnitId_key" ON "user_business_units"("userId", "businessUnitId");
CREATE INDEX "user_business_units_businessUnitId_status_idx" ON "user_business_units"("businessUnitId", "status");
CREATE INDEX "user_business_units_userId_isDefault_idx" ON "user_business_units"("userId", "isDefault");

ALTER TABLE "user_business_units"
  ADD CONSTRAINT "user_business_units_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_business_units"
  ADD CONSTRAINT "user_business_units_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contracts" ADD COLUMN "businessUnitId" TEXT;
CREATE INDEX "contracts_businessUnitId_idx" ON "contracts"("businessUnitId");
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 为每个现有企业建立一个默认业务单元，并把历史账号、合同迁入安全的初始归属。
INSERT INTO "business_units" (
  "id", "code", "name", "type", "companyId", "profitCenterCode", "status", "createdAt", "updatedAt"
)
SELECT
  'bu_' || md5(c."id"),
  'BU-' || c."code",
  COALESCE(NULLIF(c."shortName", ''), c."name") || '默认业务单元',
  'COMPREHENSIVE',
  c."id",
  'PC-' || c."code",
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies" c
WHERE c."type" = 'INTERNAL'
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "user_business_units" (
  "id", "userId", "businessUnitId", "isDefault", "status", "effectiveAt", "createdAt", "updatedAt"
)
SELECT
  'ubu_' || md5(u."id" || bu."id"),
  u."id",
  bu."id",
  true,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "companies" c ON c."id" = u."companyId"
JOIN "business_units" bu ON bu."companyId" = c."id" AND bu."code" = 'BU-' || c."code"
ON CONFLICT ("userId", "businessUnitId") DO NOTHING;

UPDATE "contracts" contract
SET "businessUnitId" = bu."id"
FROM "companies" c
JOIN "business_units" bu ON bu."companyId" = c."id" AND bu."code" = 'BU-' || c."code"
WHERE contract."businessUnitId" IS NULL
  AND contract."companyId" = c."id";
