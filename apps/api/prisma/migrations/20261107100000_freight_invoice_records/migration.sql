-- 发票登记扩展到物流结算单（运费进项发票）；既有货款发票全部标记为 GOODS，不改写金额。
ALTER TABLE "invoice_records"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'GOODS',
  ADD COLUMN "logisticsSettlementId" TEXT,
  ALTER COLUMN "settlementId" DROP NOT NULL,
  ALTER COLUMN "contractId" DROP NOT NULL;

ALTER TABLE "invoice_records"
  ADD CONSTRAINT "invoice_records_logisticsSettlementId_fkey"
  FOREIGN KEY ("logisticsSettlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 一张发票只能挂一种结算依据：货款发票挂结算单并带合同，运费发票挂物流结算单且固定为进项。
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_source_check" CHECK (
  ("sourceType" = 'GOODS' AND "settlementId" IS NOT NULL AND "contractId" IS NOT NULL AND "logisticsSettlementId" IS NULL)
  OR ("sourceType" = 'FREIGHT' AND "logisticsSettlementId" IS NOT NULL AND "settlementId" IS NULL AND "direction" = 'INPUT')
);

CREATE INDEX "invoice_records_logisticsSettlementId_status_idx" ON "invoice_records"("logisticsSettlementId", "status");
CREATE INDEX "invoice_records_direction_issuedAt_idx" ON "invoice_records"("direction", "issuedAt");
