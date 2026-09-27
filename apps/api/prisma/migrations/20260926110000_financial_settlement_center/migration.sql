CREATE TABLE "financial_settlements" (
  "id" TEXT NOT NULL,
  "settlementNo" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'CONTRACT',
  "sourceNo" TEXT,
  "contractId" TEXT NOT NULL,
  "businessUnitId" TEXT,
  "legalEntityPartnerId" TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "quantity" DECIMAL(15,3),
  "unit" TEXT,
  "grossAmount" DECIMAL(15,2) NOT NULL,
  "adjustmentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "settledAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "remarks" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "financial_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fund_transactions" (
  "id" TEXT NOT NULL,
  "transactionNo" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'NORMAL',
  "contractId" TEXT NOT NULL,
  "legalEntityPartnerId" TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "amount" DECIMAL(15,2) NOT NULL,
  "allocatedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "bankReference" TEXT,
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fund_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlement_allocations" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "fundTransactionId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_settlements_settlementNo_key" ON "financial_settlements"("settlementNo");
CREATE INDEX "financial_settlements_direction_status_idx" ON "financial_settlements"("direction", "status");
CREATE INDEX "financial_settlements_contractId_idx" ON "financial_settlements"("contractId");
CREATE INDEX "financial_settlements_businessUnitId_idx" ON "financial_settlements"("businessUnitId");
CREATE INDEX "financial_settlements_legalEntityPartnerId_idx" ON "financial_settlements"("legalEntityPartnerId");
CREATE INDEX "financial_settlements_counterpartyId_idx" ON "financial_settlements"("counterpartyId");

CREATE UNIQUE INDEX "fund_transactions_transactionNo_key" ON "fund_transactions"("transactionNo");
CREATE INDEX "fund_transactions_direction_status_idx" ON "fund_transactions"("direction", "status");
CREATE INDEX "fund_transactions_contractId_idx" ON "fund_transactions"("contractId");
CREATE INDEX "fund_transactions_legalEntityPartnerId_idx" ON "fund_transactions"("legalEntityPartnerId");
CREATE INDEX "fund_transactions_counterpartyId_idx" ON "fund_transactions"("counterpartyId");

CREATE INDEX "settlement_allocations_settlementId_idx" ON "settlement_allocations"("settlementId");
CREATE INDEX "settlement_allocations_fundTransactionId_idx" ON "settlement_allocations"("fundTransactionId");

ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_legalEntityPartnerId_fkey" FOREIGN KEY ("legalEntityPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlements" ADD CONSTRAINT "financial_settlements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_legalEntityPartnerId_fkey" FOREIGN KEY ("legalEntityPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_fundTransactionId_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "fund_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
