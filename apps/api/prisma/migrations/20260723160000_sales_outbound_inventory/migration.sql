CREATE TABLE "outbound_receipts" (
  "id" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "weighTicketId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "materialId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "customerName" TEXT,
  "plateNo" TEXT,
  "outboundQuantity" DECIMAL(15,3) NOT NULL,
  "departedAt" TIMESTAMP(3) NOT NULL,
  "operatorName" TEXT NOT NULL,
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "outbound_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_receipt_allocations" (
  "id" TEXT NOT NULL,
  "outboundReceiptId" TEXT NOT NULL,
  "inventoryLotId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_receipt_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_outbounds" (
  "id" TEXT NOT NULL,
  "outboundNo" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "customerName" TEXT,
  "quantity" DECIMAL(15,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_outbounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_outbound_lines" (
  "id" TEXT NOT NULL,
  "salesOutboundId" TEXT NOT NULL,
  "inventoryLotId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "balanceAfter" DECIMAL(15,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_outbound_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN "outboundReceiptId" TEXT;

CREATE UNIQUE INDEX "outbound_receipts_receiptNo_key" ON "outbound_receipts"("receiptNo");
CREATE UNIQUE INDEX "outbound_receipt_allocations_outboundReceiptId_inventoryLotId_key" ON "outbound_receipt_allocations"("outboundReceiptId", "inventoryLotId");
CREATE UNIQUE INDEX "sales_outbounds_outboundNo_key" ON "sales_outbounds"("outboundNo");
CREATE UNIQUE INDEX "sales_outbounds_receiptId_key" ON "sales_outbounds"("receiptId");
CREATE UNIQUE INDEX "sales_outbound_lines_salesOutboundId_inventoryLotId_key" ON "sales_outbound_lines"("salesOutboundId", "inventoryLotId");

CREATE INDEX "outbound_receipts_waybillId_idx" ON "outbound_receipts"("waybillId");
CREATE INDEX "outbound_receipts_weighTicketId_idx" ON "outbound_receipts"("weighTicketId");
CREATE INDEX "outbound_receipts_warehouseId_idx" ON "outbound_receipts"("warehouseId");
CREATE INDEX "outbound_receipts_materialId_idx" ON "outbound_receipts"("materialId");
CREATE INDEX "outbound_receipts_status_idx" ON "outbound_receipts"("status");
CREATE INDEX "outbound_receipt_allocations_inventoryLotId_idx" ON "outbound_receipt_allocations"("inventoryLotId");
CREATE INDEX "sales_outbounds_outboundNo_idx" ON "sales_outbounds"("outboundNo");
CREATE INDEX "sales_outbounds_warehouseId_idx" ON "sales_outbounds"("warehouseId");
CREATE INDEX "sales_outbounds_materialId_idx" ON "sales_outbounds"("materialId");
CREATE INDEX "sales_outbounds_status_idx" ON "sales_outbounds"("status");
CREATE INDEX "sales_outbound_lines_inventoryLotId_idx" ON "sales_outbound_lines"("inventoryLotId");
CREATE INDEX "attachments_outboundReceiptId_idx" ON "attachments"("outboundReceiptId");

ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_weighTicketId_fkey" FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_receipt_allocations" ADD CONSTRAINT "outbound_receipt_allocations_outboundReceiptId_fkey" FOREIGN KEY ("outboundReceiptId") REFERENCES "outbound_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbound_receipt_allocations" ADD CONSTRAINT "outbound_receipt_allocations_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbounds" ADD CONSTRAINT "sales_outbounds_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "outbound_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbounds" ADD CONSTRAINT "sales_outbounds_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbounds" ADD CONSTRAINT "sales_outbounds_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbounds" ADD CONSTRAINT "sales_outbounds_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_outbound_lines" ADD CONSTRAINT "sales_outbound_lines_salesOutboundId_fkey" FOREIGN KEY ("salesOutboundId") REFERENCES "sales_outbounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_outbound_lines" ADD CONSTRAINT "sales_outbound_lines_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_outboundReceiptId_fkey" FOREIGN KEY ("outboundReceiptId") REFERENCES "outbound_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
