CREATE TABLE "dispatch_notices" (
  "id" TEXT NOT NULL,
  "noticeNo" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'STANDARD',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "warehouseId" TEXT,
  "plannedDate" TIMESTAMP(3),
  "originLocation" TEXT,
  "destinationLocation" TEXT,
  "totalQuantity" DECIMAL(15,3) NOT NULL,
  "remarks" TEXT,
  "issuedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "dispatch_notices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dispatch_notice_line_items" (
  "id" TEXT NOT NULL,
  "dispatchNoticeId" TEXT NOT NULL,
  "orderLineItemId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dispatch_notice_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "waybills" (
  "id" TEXT NOT NULL,
  "waybillNo" TEXT NOT NULL,
  "dispatchNoticeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "freightMode" TEXT NOT NULL DEFAULT 'SELF',
  "vehicleId" TEXT,
  "carrierName" TEXT,
  "plateNo" TEXT,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "originLocation" TEXT,
  "destinationLocation" TEXT,
  "totalQuantity" DECIMAL(15,3) NOT NULL,
  "plannedDepartureAt" TIMESTAMP(3),
  "departedAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "waybill_line_items" (
  "id" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "dispatchNoticeLineItemId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waybill_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_notices_noticeNo_key" ON "dispatch_notices"("noticeNo");
CREATE INDEX "dispatch_notices_noticeNo_idx" ON "dispatch_notices"("noticeNo");
CREATE INDEX "dispatch_notices_orderId_idx" ON "dispatch_notices"("orderId");
CREATE INDEX "dispatch_notices_type_idx" ON "dispatch_notices"("type");
CREATE INDEX "dispatch_notices_status_idx" ON "dispatch_notices"("status");
CREATE INDEX "dispatch_notices_warehouseId_idx" ON "dispatch_notices"("warehouseId");
CREATE INDEX "dispatch_notice_line_items_dispatchNoticeId_idx" ON "dispatch_notice_line_items"("dispatchNoticeId");
CREATE INDEX "dispatch_notice_line_items_orderLineItemId_idx" ON "dispatch_notice_line_items"("orderLineItemId");
CREATE UNIQUE INDEX "waybills_waybillNo_key" ON "waybills"("waybillNo");
CREATE INDEX "waybills_waybillNo_idx" ON "waybills"("waybillNo");
CREATE INDEX "waybills_dispatchNoticeId_idx" ON "waybills"("dispatchNoticeId");
CREATE INDEX "waybills_status_idx" ON "waybills"("status");
CREATE INDEX "waybills_vehicleId_idx" ON "waybills"("vehicleId");
CREATE INDEX "waybill_line_items_waybillId_idx" ON "waybill_line_items"("waybillId");
CREATE INDEX "waybill_line_items_dispatchNoticeLineItemId_idx" ON "waybill_line_items"("dispatchNoticeLineItemId");

ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_notice_line_items" ADD CONSTRAINT "dispatch_notice_line_items_dispatchNoticeId_fkey" FOREIGN KEY ("dispatchNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_notice_line_items" ADD CONSTRAINT "dispatch_notice_line_items_orderLineItemId_fkey" FOREIGN KEY ("orderLineItemId") REFERENCES "order_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_dispatchNoticeId_fkey" FOREIGN KEY ("dispatchNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybill_line_items" ADD CONSTRAINT "waybill_line_items_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waybill_line_items" ADD CONSTRAINT "waybill_line_items_dispatchNoticeLineItemId_fkey" FOREIGN KEY ("dispatchNoticeLineItemId") REFERENCES "dispatch_notice_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
