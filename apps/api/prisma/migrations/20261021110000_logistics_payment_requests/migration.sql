ALTER TABLE "payment_requests" ALTER COLUMN "contractId" DROP NOT NULL;
ALTER TABLE "payment_requests" ADD COLUMN "logisticsSettlementId" TEXT;
CREATE INDEX "payment_requests_logisticsSettlementId_idx" ON "payment_requests"("logisticsSettlementId");
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_logisticsSettlementId_fkey" FOREIGN KEY ("logisticsSettlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_business_source_check" CHECK (
  ("businessType" = 'LOGISTICS' AND "logisticsSettlementId" IS NOT NULL AND "contractId" IS NULL AND "settlementId" IS NULL AND "orderId" IS NULL)
  OR ("businessType" <> 'LOGISTICS' AND "contractId" IS NOT NULL AND "logisticsSettlementId" IS NULL)
);
CREATE TABLE "logistics_payment_allocations" (
  "id" TEXT NOT NULL, "logisticsSettlementId" TEXT NOT NULL, "fundTransactionId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3), "reversedBy" TEXT, "reversalReason" TEXT,
  CONSTRAINT "logistics_payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_payment_allocations_positive" CHECK ("amount" > 0),
  CONSTRAINT "logistics_payment_allocations_settlement_fkey" FOREIGN KEY ("logisticsSettlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "logistics_payment_allocations_fund_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "fund_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "logistics_payment_allocations_logisticsSettlementId_idx" ON "logistics_payment_allocations"("logisticsSettlementId");
CREATE INDEX "logistics_payment_allocations_fundTransactionId_idx" ON "logistics_payment_allocations"("fundTransactionId");
