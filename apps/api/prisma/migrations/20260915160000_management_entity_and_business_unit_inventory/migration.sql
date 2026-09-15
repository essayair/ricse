-- 将“管理组织、业务单元、法律主体”拆为独立维度，并把业务单元带入库存台账。

ALTER TABLE "companies" ADD COLUMN "isManagementEntity" BOOLEAN NOT NULL DEFAULT false;

-- 兼容既有数据：首个有效内部企业作为平台管理主体。后续可通过产品配置显式调整。
WITH management_company AS (
  SELECT "id"
  FROM "companies"
  WHERE "type" = 'INTERNAL'
  ORDER BY CASE WHEN "status" = 'ACTIVE' THEN 0 ELSE 1 END, "createdAt", "id"
  LIMIT 1
)
UPDATE "companies"
SET "isManagementEntity" = true
WHERE "id" IN (SELECT "id" FROM management_company);

CREATE UNIQUE INDEX "companies_single_management_entity_idx"
  ON "companies" ("isManagementEntity")
  WHERE "isManagementEntity" = true;

-- 旧迁移曾按每个内部企业创建一个默认业务单元。将这些系统默认单元安全归并到
-- 平台管理主体的默认单元；用户、角色范围和合同引用一并迁移，人工创建的单元保留。
WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
UPDATE "contracts"
SET "businessUnitId" = (SELECT "id" FROM target_unit)
WHERE "businessUnitId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (SELECT 1 FROM target_unit);

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_memberships AS (
  SELECT membership."userId", membership."businessUnitId", membership."isDefault"
  FROM "user_business_units" membership
  JOIN "business_units" bu ON bu."id" = membership."businessUnitId"
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
UPDATE "user_business_units" target_membership
SET "isDefault" = target_membership."isDefault" OR legacy."isDefault"
FROM legacy_memberships legacy
WHERE target_membership."userId" = legacy."userId"
  AND target_membership."businessUnitId" = (SELECT "id" FROM target_unit);

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
DELETE FROM "user_business_units" legacy_membership
WHERE legacy_membership."businessUnitId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (
    SELECT 1 FROM "user_business_units" target_membership
    WHERE target_membership."userId" = legacy_membership."userId"
      AND target_membership."businessUnitId" = (SELECT "id" FROM target_unit)
  );

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
UPDATE "user_business_units"
SET "businessUnitId" = (SELECT "id" FROM target_unit)
WHERE "businessUnitId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (SELECT 1 FROM target_unit);

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
DELETE FROM "user_role_scopes" legacy_scope
WHERE legacy_scope."targetType" = 'BUSINESS_UNIT'
  AND legacy_scope."targetId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (
    SELECT 1 FROM "user_role_scopes" target_scope
    WHERE target_scope."assignmentId" = legacy_scope."assignmentId"
      AND target_scope."targetType" = 'BUSINESS_UNIT'
      AND target_scope."targetId" = (SELECT "id" FROM target_unit)
  );

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
UPDATE "user_role_scopes"
SET "targetId" = (SELECT "id" FROM target_unit)
WHERE "targetType" = 'BUSINESS_UNIT'
  AND "targetId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (SELECT 1 FROM target_unit);

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
UPDATE "business_units"
SET "parentId" = (SELECT "id" FROM target_unit)
WHERE "parentId" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (SELECT 1 FROM target_unit);

WITH target_unit AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId" AND c."isManagementEntity" = true
  WHERE bu."code" = 'BU-' || c."code"
  LIMIT 1
), legacy_units AS (
  SELECT bu."id"
  FROM "business_units" bu
  JOIN "companies" c ON c."id" = bu."companyId"
  WHERE c."isManagementEntity" = false
    AND c."type" = 'INTERNAL'
    AND bu."code" = 'BU-' || c."code"
)
DELETE FROM "business_units"
WHERE "id" IN (SELECT "id" FROM legacy_units)
  AND EXISTS (SELECT 1 FROM target_unit);

-- 其余人工创建的业务单元统一归在平台管理主体下；合同签约主体继续由 signingPartnerId 独立记录。
WITH management_company AS (
  SELECT "id" FROM "companies" WHERE "isManagementEntity" = true LIMIT 1
)
UPDATE "business_units"
SET "companyId" = (SELECT "id" FROM management_company)
WHERE EXISTS (SELECT 1 FROM management_company)
  AND "companyId" <> (SELECT "id" FROM management_company);

-- 将首个默认单元对齐新编码规则；外键引用按 ID 保持不变。
UPDATE "business_units" bu
SET "code" = 'BU-' || company."code" || '-001',
    "name" = CASE
      WHEN bu."name" = COALESCE(NULLIF(company."shortName", ''), company."name") || '默认业务单元'
      THEN COALESCE(NULLIF(company."shortName", ''), company."name") || '综合事业部'
      ELSE bu."name"
    END
FROM "companies" company
WHERE bu."companyId" = company."id"
  AND company."isManagementEntity" = true
  AND bu."code" = 'BU-' || company."code"
  AND NOT EXISTS (
    SELECT 1 FROM "business_units" existing
    WHERE existing."code" = 'BU-' || company."code" || '-001'
  );

ALTER TABLE "production_tasks" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "business_inbounds" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "inventory_lots" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "inventory_ledgers" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "sales_outbounds" ADD COLUMN "businessUnitId" TEXT;

-- 合同履约链回填业务单元。
UPDATE "business_inbounds" bi
SET "businessUnitId" = c."businessUnitId"
FROM "inbound_receipts" ir
JOIN "waybills" w ON w."id" = ir."waybillId"
JOIN "dispatch_notices" dn ON dn."id" = w."dispatchNoticeId"
JOIN "orders" o ON o."id" = dn."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
WHERE bi."receiptId" = ir."id";

UPDATE "outbound_orders" oo
SET "businessUnitId" = c."businessUnitId"
FROM "dispatch_notices" dn
JOIN "orders" o ON o."id" = dn."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
WHERE oo."dispatchNoticeId" = dn."id";

-- 无合同来源的生产任务优先使用创建人的默认业务单元。
UPDATE "production_tasks" pt
SET "businessUnitId" = source_contract."businessUnitId"
FROM "orders" source_order
JOIN "contracts" source_contract ON source_contract."id" = source_order."contractId"
WHERE pt."sourceOrderId" = source_order."id";

UPDATE "production_tasks" pt
SET "businessUnitId" = defaults."businessUnitId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "businessUnitId"
  FROM "user_business_units"
  WHERE "status" = 'ACTIVE'
  ORDER BY "userId", "isDefault" DESC, "createdAt"
) defaults
WHERE pt."businessUnitId" IS NULL AND pt."createdBy" = defaults."userId";

UPDATE "inventory_lots" lot
SET "businessUnitId" = bi."businessUnitId"
FROM "business_inbounds" bi
WHERE lot."businessInboundId" = bi."id";

UPDATE "inventory_lots" lot
SET "businessUnitId" = pt."businessUnitId"
FROM "production_completions" pc
JOIN "production_tasks" pt ON pt."id" = pc."taskId"
WHERE lot."businessUnitId" IS NULL AND lot."productionCompletionId" = pc."id";

UPDATE "inventory_ledgers" ledger
SET "businessUnitId" = lot."businessUnitId"
FROM "inventory_lots" lot
WHERE ledger."lotId" = lot."id";

UPDATE "sales_outbounds" so
SET "businessUnitId" = oo."businessUnitId"
FROM "outbound_receipts" receipt
JOIN "outbound_orders" oo ON oo."id" = receipt."outboundOrderId"
WHERE so."receiptId" = receipt."id";

CREATE INDEX "production_tasks_businessUnitId_idx" ON "production_tasks"("businessUnitId");
CREATE INDEX "business_inbounds_businessUnitId_idx" ON "business_inbounds"("businessUnitId");
CREATE INDEX "inventory_lots_businessUnitId_idx" ON "inventory_lots"("businessUnitId");
CREATE INDEX "inventory_ledgers_businessUnitId_idx" ON "inventory_ledgers"("businessUnitId");
CREATE INDEX "outbound_orders_businessUnitId_idx" ON "outbound_orders"("businessUnitId");
CREATE INDEX "sales_outbounds_businessUnitId_idx" ON "sales_outbounds"("businessUnitId");

ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inbounds" ADD CONSTRAINT "business_inbounds_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledgers" ADD CONSTRAINT "inventory_ledgers_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbounds" ADD CONSTRAINT "sales_outbounds_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
