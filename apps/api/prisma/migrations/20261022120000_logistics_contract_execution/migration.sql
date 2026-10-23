ALTER TABLE "logistics_contracts"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "externalContractNo" TEXT,
  ADD COLUMN "signingPartnerId" TEXT,
  ADD COLUMN "allBusinessUnits" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultWeightBasis" TEXT NOT NULL DEFAULT 'SETTLEMENT',
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "logistics_contracts" ADD CONSTRAINT "logistics_contracts_signingPartnerId_fkey"
  FOREIGN KEY ("signingPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "logistics_contracts" c SET "signingPartnerId" = o."partnerId" FROM "companies" o WHERE c."companyId" = o."id";

CREATE TABLE "logistics_contract_business_units" (
  "contractId" TEXT NOT NULL, "businessUnitId" TEXT NOT NULL,
  CONSTRAINT "logistics_contract_business_units_pkey" PRIMARY KEY ("contractId", "businessUnitId"),
  CONSTRAINT "logistics_contract_business_units_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "logistics_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "logistics_contract_business_units_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "logistics_contract_business_units_businessUnitId_idx" ON "logistics_contract_business_units"("businessUnitId");
ALTER TABLE "attachments" ADD COLUMN "logisticsContractId" TEXT;
ALTER TABLE "attachments" ADD COLUMN "logisticsSettlementId" TEXT;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_logisticsContractId_fkey" FOREIGN KEY ("logisticsContractId") REFERENCES "logistics_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "attachments_logisticsContractId_idx" ON "attachments"("logisticsContractId");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_logisticsSettlementId_fkey" FOREIGN KEY ("logisticsSettlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "attachments_logisticsSettlementId_idx" ON "attachments"("logisticsSettlementId");

ALTER TABLE "logistics_settlements"
  ADD COLUMN "ownerPartnerId" TEXT,
  ADD COLUMN "carrierPartnerId" TEXT,
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "payerChangeReason" TEXT;
UPDATE "logistics_settlements" SET "ownerPartnerId" = "payerPartnerId";
ALTER TABLE "logistics_settlement_lines"
  ADD COLUMN "grossWeight" DECIMAL(15,3), ADD COLUMN "tareWeight" DECIMAL(15,3),
  ADD COLUMN "shippingWeight" DECIMAL(15,3), ADD COLUMN "receivingWeight" DECIMAL(15,3),
  ADD COLUMN "chargeQuantity" DECIMAL(15,3),
  ADD COLUMN "pricingBasis" TEXT NOT NULL DEFAULT 'NET_WEIGHT',
  ADD COLUMN "weightBasis" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "weighTicketId" TEXT, ADD COLUMN "ticketNo" TEXT, ADD COLUMN "weightReason" TEXT,
  ADD COLUMN "materialName" TEXT, ADD COLUMN "materialSpec" TEXT,
  ADD COLUMN "shippedAt" TIMESTAMP(3), ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "evidenceSnapshot" JSONB;
UPDATE "logistics_settlement_lines" SET "chargeQuantity" = "netWeight";

CREATE TABLE "logistics_settlement_adjustments" (
  "id" TEXT NOT NULL, "settlementId" TEXT NOT NULL, "lineId" TEXT, "kind" TEXT NOT NULL,
  "before" JSONB NOT NULL, "after" JSONB NOT NULL, "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_settlement_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_settlement_adjustments_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "logistics_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "logistics_settlement_adjustments_settlementId_createdAt_idx" ON "logistics_settlement_adjustments"("settlementId", "createdAt");
