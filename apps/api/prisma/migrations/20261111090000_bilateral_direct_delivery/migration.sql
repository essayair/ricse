-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "salesExternalNo" TEXT,
ADD COLUMN     "salesPaymentMethod" TEXT,
ADD COLUMN     "salesSignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contract_line_items" ADD COLUMN     "pricingQuantityBasis" TEXT;

-- AlterTable
ALTER TABLE "financial_settlement_lines" ADD COLUMN     "directDeliveryId" TEXT;

-- CreateTable
CREATE TABLE "direct_executions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "purchaseNoticeId" TEXT NOT NULL,
    "salesNoticeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_deliveries" (
    "id" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "weighTicketId" TEXT NOT NULL,
    "qualityInspectionId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "pricingQuantity" DECIMAL(15,3) NOT NULL,
    "pricingQuantityBasis" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "direct_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_trade_documents" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "directDeliveryId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "quantity" DECIMAL(15,3) NOT NULL,
    "pricingQuantity" DECIMAL(15,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_trade_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "direct_executions_purchaseNoticeId_key" ON "direct_executions"("purchaseNoticeId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_executions_salesNoticeId_key" ON "direct_executions"("salesNoticeId");

-- CreateIndex
CREATE INDEX "direct_executions_contractId_idx" ON "direct_executions"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_executions_createdBy_requestId_key" ON "direct_executions"("createdBy", "requestId");

-- CreateIndex
CREATE INDEX "direct_deliveries_status_idx" ON "direct_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "direct_deliveries_waybillId_version_key" ON "direct_deliveries"("waybillId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "direct_trade_documents_documentNo_key" ON "direct_trade_documents"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "direct_trade_documents_directDeliveryId_direction_key" ON "direct_trade_documents"("directDeliveryId", "direction");

-- CreateIndex
CREATE INDEX "financial_settlement_lines_directDeliveryId_idx" ON "financial_settlement_lines"("directDeliveryId");

-- AddForeignKey
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_directDeliveryId_fkey" FOREIGN KEY ("directDeliveryId") REFERENCES "direct_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_executions" ADD CONSTRAINT "direct_executions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_executions" ADD CONSTRAINT "direct_executions_purchaseNoticeId_fkey" FOREIGN KEY ("purchaseNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_executions" ADD CONSTRAINT "direct_executions_salesNoticeId_fkey" FOREIGN KEY ("salesNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_deliveries" ADD CONSTRAINT "direct_deliveries_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_trade_documents" ADD CONSTRAINT "direct_trade_documents_directDeliveryId_fkey" FOREIGN KEY ("directDeliveryId") REFERENCES "direct_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One active confirmation/review per trip; reversals retain historical versions.
CREATE UNIQUE INDEX "direct_deliveries_active_waybill_key" ON "direct_deliveries" ("waybillId") WHERE status IN ('PENDING_REVIEW', 'CONFIRMED');
ALTER TABLE "direct_deliveries" ADD CONSTRAINT "direct_deliveries_positive_quantity" CHECK (quantity > 0 AND "pricingQuantity" > 0);
ALTER TABLE "direct_trade_documents" ADD CONSTRAINT "direct_trade_documents_direction_check" CHECK (direction IN ('PURCHASE', 'SALES'));

