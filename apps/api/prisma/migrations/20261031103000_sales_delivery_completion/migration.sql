ALTER TABLE "waybills"
  ADD COLUMN "salesCompletionReportId" TEXT,
  ADD COLUMN "salesCompletionConfirmedBy" TEXT,
  ADD COLUMN "salesCompletionConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "salesCompletionRemarks" TEXT;

ALTER TABLE "waybills"
  ADD CONSTRAINT "waybills_salesCompletionReportId_fkey" FOREIGN KEY ("salesCompletionReportId") REFERENCES "quality_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waybills"
  ADD CONSTRAINT "waybills_salesCompletionConfirmedBy_fkey" FOREIGN KEY ("salesCompletionConfirmedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "waybills_salesCompletionConfirmedAt_idx" ON "waybills"("salesCompletionConfirmedAt");

ALTER TABLE "attachments" ADD COLUMN "financialSettlementId" TEXT;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_financialSettlementId_fkey" FOREIGN KEY ("financialSettlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "attachments_financialSettlementId_idx" ON "attachments"("financialSettlementId");
