ALTER TABLE "financial_settlements"
  ADD COLUMN "settlementScope" TEXT NOT NULL DEFAULT 'BATCH',
  ADD COLUMN "stageName" TEXT,
  ADD COLUMN "stageRatio" DECIMAL(5,2);

CREATE TABLE "financial_settlement_lines" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "orderId" TEXT,
  "orderNo" TEXT,
  "orderName" TEXT,
  "quantity" DECIMAL(15,3),
  "unit" TEXT,
  "unitPrice" DECIMAL(15,4),
  "grossAmount" DECIMAL(15,2) NOT NULL,
  "adjustmentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_settlement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_settlement_lines_settlementId_idx" ON "financial_settlement_lines"("settlementId");
CREATE INDEX "financial_settlement_lines_orderId_idx" ON "financial_settlement_lines"("orderId");
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fund_transactions"
  ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN "paymentStage" TEXT NOT NULL DEFAULT 'SETTLEMENT',
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN "refundedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "ourBankAccount" TEXT,
  ADD COLUMN "counterpartyBankAccount" TEXT,
  ADD COLUMN "instrumentNo" TEXT,
  ADD COLUMN "instrumentDueDate" TIMESTAMP(3),
  ADD COLUMN "relatedTransactionId" TEXT;

UPDATE "fund_transactions" f
SET "businessType" = CASE WHEN c."type" = 'SALES' THEN 'SALES' ELSE 'PURCHASE' END,
    "paymentStage" = CASE WHEN f."category" = 'ADVANCE' THEN 'ADVANCE' WHEN f."category" = 'REFUND' THEN 'REFUND' ELSE 'SETTLEMENT' END
FROM "contracts" c
WHERE c."id" = f."contractId";

CREATE INDEX "fund_transactions_businessType_paymentStage_idx" ON "fund_transactions"("businessType", "paymentStage");
CREATE INDEX "fund_transactions_relatedTransactionId_idx" ON "fund_transactions"("relatedTransactionId");
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "fund_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_allocations"
  ADD COLUMN "reversedBy" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT;

ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_reversedBy_fkey" FOREIGN KEY ("reversedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
