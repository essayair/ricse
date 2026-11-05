CREATE TABLE "invoice_records" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  "invoiceCode" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "sellerPartnerId" TEXT NOT NULL,
  "buyerPartnerId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "quantity" DECIMAL(15,3),
  "unitPrice" DECIMAL(15,4),
  "taxRate" DECIMAL(5,2),
  "taxAmount" DECIMAL(15,2),
  "taxInclusiveAmount" DECIMAL(15,2) NOT NULL,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedBy" TEXT,
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  CONSTRAINT "invoice_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "invoice_records_settlementId_status_idx" ON "invoice_records"("settlementId", "status");
CREATE INDEX "invoice_records_contractId_idx" ON "invoice_records"("contractId");
CREATE UNIQUE INDEX "invoice_records_direction_sellerPartnerId_invoiceNo_key" ON "invoice_records"("direction", "sellerPartnerId", "invoiceNo");
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_sellerPartnerId_fkey" FOREIGN KEY ("sellerPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_buyerPartnerId_fkey" FOREIGN KEY ("buyerPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
