-- 发票改为可先登记、暂不对应结算单，再按金额分摊到一张或多张结算依据。
-- 既有发票按原归属全额转为分摊记录；作废发票的分摊同时记为已撤销，保留历史。

BEGIN;

CREATE TABLE "invoice_allocations" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "settlementId" TEXT,
  "logisticsSettlementId" TEXT,
  "amount" DECIMAL(15,2) NOT NULL,
  "quantity" DECIMAL(15,3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedBy" TEXT,
  "reversalReason" TEXT,
  CONSTRAINT "invoice_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_allocations_target_check" CHECK (("settlementId" IS NULL) <> ("logisticsSettlementId" IS NULL)),
  CONSTRAINT "invoice_allocations_amount_check" CHECK ("amount" > 0 AND ("quantity" IS NULL OR "quantity" > 0))
);

CREATE INDEX "invoice_allocations_invoiceId_reversedAt_idx" ON "invoice_allocations"("invoiceId", "reversedAt");
CREATE INDEX "invoice_allocations_settlementId_reversedAt_idx" ON "invoice_allocations"("settlementId", "reversedAt");
CREATE INDEX "invoice_allocations_logisticsSettlementId_reversedAt_idx" ON "invoice_allocations"("logisticsSettlementId", "reversedAt");

ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_logisticsSettlementId_fkey" FOREIGN KEY ("logisticsSettlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 发票增加事业部（运费发票的数据范围；货款发票取自合同）
ALTER TABLE "invoice_records" ADD COLUMN "businessUnitId" TEXT;
UPDATE "invoice_records" r SET "businessUnitId" = COALESCE(
  (SELECT s."businessUnitId" FROM "financial_settlements" s WHERE s."id" = r."settlementId"),
  (SELECT l."businessUnitId" FROM "logistics_settlements" l WHERE l."id" = r."logisticsSettlementId"),
  (SELECT c."businessUnitId" FROM "contracts" c WHERE c."id" = r."contractId"));

-- 既有归属转为全额分摊
INSERT INTO "invoice_allocations" ("id", "invoiceId", "settlementId", "logisticsSettlementId", "amount", "quantity", "createdBy", "createdAt", "reversedAt", "reversedBy", "reversalReason")
SELECT 'ia_' || r."id", r."id", r."settlementId", r."logisticsSettlementId", r."taxInclusiveAmount", r."quantity", r."createdBy", r."createdAt",
       CASE WHEN r."status" = 'VOIDED' THEN COALESCE(r."voidedAt", CURRENT_TIMESTAMP) END,
       CASE WHEN r."status" = 'VOIDED' THEN r."voidedBy" END,
       CASE WHEN r."status" = 'VOIDED' THEN '发票作废（数据迁移）' END
FROM "invoice_records" r
WHERE r."settlementId" IS NOT NULL OR r."logisticsSettlementId" IS NOT NULL;

-- 移除发票上的单一结算依据字段
ALTER TABLE "invoice_records" DROP CONSTRAINT "invoice_records_source_check";
ALTER TABLE "invoice_records" DROP CONSTRAINT IF EXISTS "invoice_records_settlementId_fkey";
ALTER TABLE "invoice_records" DROP CONSTRAINT IF EXISTS "invoice_records_logisticsSettlementId_fkey";
DROP INDEX IF EXISTS "invoice_records_settlementId_status_idx";
DROP INDEX IF EXISTS "invoice_records_logisticsSettlementId_status_idx";
ALTER TABLE "invoice_records" DROP COLUMN "settlementId", DROP COLUMN "logisticsSettlementId";

ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "invoice_records_businessUnitId_idx" ON "invoice_records"("businessUnitId");

-- 货款发票必须归属合同；运费发票固定为进项并归属事业部（历史运费发票缺事业部时保留，不阻断迁移）
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_source_check" CHECK (
  ("sourceType" = 'GOODS' AND "contractId" IS NOT NULL)
  OR ("sourceType" = 'FREIGHT' AND "direction" = 'INPUT')
);

COMMIT;
