CREATE TABLE "inventory_reversals" (
  "id" TEXT NOT NULL,
  "reversalNo" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "businessInboundId" TEXT,
  "salesOutboundId" TEXT,
  "reason" TEXT NOT NULL,
  "remarks" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalComment" TEXT,
  "rejectedReason" TEXT,
  "postedBy" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_reversals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_reversal_lines" (
  "id" TEXT NOT NULL,
  "reversalId" TEXT NOT NULL,
  "inventoryLotId" TEXT NOT NULL,
  "sourceSalesOutboundLineId" TEXT,
  "sourceQuantity" DECIMAL(15,3) NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "balanceAfter" DECIMAL(15,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_reversal_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN "inventoryReversalId" TEXT;

CREATE UNIQUE INDEX "inventory_reversals_reversalNo_key" ON "inventory_reversals"("reversalNo");
CREATE UNIQUE INDEX "inventory_reversal_lines_reversalId_inventoryLotId_key" ON "inventory_reversal_lines"("reversalId", "inventoryLotId");
CREATE INDEX "inventory_reversals_reversalNo_idx" ON "inventory_reversals"("reversalNo");
CREATE INDEX "inventory_reversals_type_idx" ON "inventory_reversals"("type");
CREATE INDEX "inventory_reversals_status_idx" ON "inventory_reversals"("status");
CREATE INDEX "inventory_reversals_businessInboundId_idx" ON "inventory_reversals"("businessInboundId");
CREATE INDEX "inventory_reversals_salesOutboundId_idx" ON "inventory_reversals"("salesOutboundId");
CREATE INDEX "inventory_reversals_createdBy_idx" ON "inventory_reversals"("createdBy");
CREATE INDEX "inventory_reversals_approvedBy_idx" ON "inventory_reversals"("approvedBy");
CREATE INDEX "inventory_reversals_postedBy_idx" ON "inventory_reversals"("postedBy");
CREATE INDEX "inventory_reversal_lines_inventoryLotId_idx" ON "inventory_reversal_lines"("inventoryLotId");
CREATE INDEX "inventory_reversal_lines_sourceSalesOutboundLineId_idx" ON "inventory_reversal_lines"("sourceSalesOutboundLineId");
CREATE INDEX "attachments_inventoryReversalId_idx" ON "attachments"("inventoryReversalId");

ALTER TABLE "inventory_reversals" ADD CONSTRAINT "inventory_reversals_businessInboundId_fkey" FOREIGN KEY ("businessInboundId") REFERENCES "business_inbounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_reversals" ADD CONSTRAINT "inventory_reversals_salesOutboundId_fkey" FOREIGN KEY ("salesOutboundId") REFERENCES "sales_outbounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_reversals" ADD CONSTRAINT "inventory_reversals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reversals" ADD CONSTRAINT "inventory_reversals_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_reversals" ADD CONSTRAINT "inventory_reversals_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_reversal_lines" ADD CONSTRAINT "inventory_reversal_lines_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "inventory_reversals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_reversal_lines" ADD CONSTRAINT "inventory_reversal_lines_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reversal_lines" ADD CONSTRAINT "inventory_reversal_lines_sourceSalesOutboundLineId_fkey" FOREIGN KEY ("sourceSalesOutboundLineId") REFERENCES "sales_outbound_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_inventoryReversalId_fkey" FOREIGN KEY ("inventoryReversalId") REFERENCES "inventory_reversals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
