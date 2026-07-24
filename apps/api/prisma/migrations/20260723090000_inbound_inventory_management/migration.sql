CREATE TABLE "inbound_receipts" (
  "id" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "weighTicketId" TEXT NOT NULL,
  "qualityInspectionId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "acceptanceConclusion" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "materialSpec" TEXT,
  "supplierName" TEXT,
  "plateNo" TEXT,
  "receivedQuantity" DECIMAL(15,3) NOT NULL,
  "moistureDeductionWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "impurityDeductionWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "deductionAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "receiverName" TEXT NOT NULL,
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "inbound_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_inbounds" (
  "id" TEXT NOT NULL,
  "inboundNo" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "supplierName" TEXT,
  "quantity" DECIMAL(15,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "lotNo" TEXT NOT NULL,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_inbounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_lots" (
  "id" TEXT NOT NULL,
  "lotNo" TEXT NOT NULL,
  "businessInboundId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "supplierName" TEXT,
  "initialQuantity" DECIMAL(15,3) NOT NULL,
  "availableQuantity" DECIMAL(15,3) NOT NULL,
  "qualityConclusion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_ledgers" (
  "id" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "businessNo" TEXT NOT NULL,
  "quantityChange" DECIMAL(15,3) NOT NULL,
  "balanceAfter" DECIMAL(15,3) NOT NULL,
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_ledgers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN "inboundReceiptId" TEXT;

CREATE UNIQUE INDEX "inbound_receipts_receiptNo_key" ON "inbound_receipts"("receiptNo");
CREATE UNIQUE INDEX "business_inbounds_inboundNo_key" ON "business_inbounds"("inboundNo");
CREATE UNIQUE INDEX "business_inbounds_receiptId_key" ON "business_inbounds"("receiptId");
CREATE UNIQUE INDEX "inventory_lots_lotNo_key" ON "inventory_lots"("lotNo");
CREATE UNIQUE INDEX "inventory_lots_businessInboundId_key" ON "inventory_lots"("businessInboundId");
CREATE INDEX "inbound_receipts_waybillId_idx" ON "inbound_receipts"("waybillId");
CREATE INDEX "inbound_receipts_weighTicketId_idx" ON "inbound_receipts"("weighTicketId");
CREATE INDEX "inbound_receipts_qualityInspectionId_idx" ON "inbound_receipts"("qualityInspectionId");
CREATE INDEX "inbound_receipts_warehouseId_idx" ON "inbound_receipts"("warehouseId");
CREATE INDEX "inbound_receipts_status_idx" ON "inbound_receipts"("status");
CREATE INDEX "business_inbounds_warehouseId_idx" ON "business_inbounds"("warehouseId");
CREATE INDEX "business_inbounds_materialId_idx" ON "business_inbounds"("materialId");
CREATE INDEX "business_inbounds_status_idx" ON "business_inbounds"("status");
CREATE INDEX "inventory_lots_warehouseId_idx" ON "inventory_lots"("warehouseId");
CREATE INDEX "inventory_lots_materialId_idx" ON "inventory_lots"("materialId");
CREATE INDEX "inventory_lots_status_idx" ON "inventory_lots"("status");
CREATE INDEX "inventory_ledgers_lotId_idx" ON "inventory_ledgers"("lotId");
CREATE INDEX "inventory_ledgers_warehouseId_idx" ON "inventory_ledgers"("warehouseId");
CREATE INDEX "inventory_ledgers_materialId_idx" ON "inventory_ledgers"("materialId");
CREATE INDEX "inventory_ledgers_businessType_idx" ON "inventory_ledgers"("businessType");
CREATE INDEX "attachments_inboundReceiptId_idx" ON "attachments"("inboundReceiptId");

ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_weighTicketId_fkey" FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "quality_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inbounds" ADD CONSTRAINT "business_inbounds_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inbound_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inbounds" ADD CONSTRAINT "business_inbounds_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inbounds" ADD CONSTRAINT "business_inbounds_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_inbounds" ADD CONSTRAINT "business_inbounds_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_businessInboundId_fkey" FOREIGN KEY ("businessInboundId") REFERENCES "business_inbounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledgers" ADD CONSTRAINT "inventory_ledgers_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledgers" ADD CONSTRAINT "inventory_ledgers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledgers" ADD CONSTRAINT "inventory_ledgers_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledgers" ADD CONSTRAINT "inventory_ledgers_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_inboundReceiptId_fkey" FOREIGN KEY ("inboundReceiptId") REFERENCES "inbound_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
