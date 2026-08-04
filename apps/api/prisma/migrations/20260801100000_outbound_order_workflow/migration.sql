-- 销售发货通知下达后生成通知级出库管理单；物流运单对应车次出库作业。
CREATE TABLE "outbound_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "dispatchNoticeId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "plannedQuantity" DECIMAL(15,3) NOT NULL,
  "reservedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "actualQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "shortageQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_order_lines" (
  "id" TEXT NOT NULL,
  "outboundOrderId" TEXT NOT NULL,
  "dispatchNoticeLineItemId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "plannedQuantity" DECIMAL(15,3) NOT NULL,
  "reservedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "actualQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_orders_orderNo_key" ON "outbound_orders"("orderNo");
CREATE UNIQUE INDEX "outbound_orders_dispatchNoticeId_key" ON "outbound_orders"("dispatchNoticeId");
CREATE INDEX "outbound_orders_orderNo_idx" ON "outbound_orders"("orderNo");
CREATE INDEX "outbound_orders_warehouseId_idx" ON "outbound_orders"("warehouseId");
CREATE INDEX "outbound_orders_status_idx" ON "outbound_orders"("status");
CREATE UNIQUE INDEX "outbound_order_lines_dispatchNoticeLineItemId_key" ON "outbound_order_lines"("dispatchNoticeLineItemId");
CREATE INDEX "outbound_order_lines_outboundOrderId_idx" ON "outbound_order_lines"("outboundOrderId");
CREATE INDEX "outbound_order_lines_materialId_idx" ON "outbound_order_lines"("materialId");

ALTER TABLE "outbound_receipts"
  ADD COLUMN "outboundOrderId" TEXT,
  ADD COLUMN "plannedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN "varianceQuantity" DECIMAL(15,3),
  ADD COLUMN "varianceRate" DECIMAL(10,4),
  ADD COLUMN "varianceDecision" TEXT,
  ADD COLUMN "varianceReason" TEXT,
  ADD COLUMN "varianceResolvedBy" TEXT,
  ADD COLUMN "varianceResolvedAt" TIMESTAMP(3),
  ALTER COLUMN "weighTicketId" DROP NOT NULL,
  ALTER COLUMN "outboundQuantity" DROP NOT NULL,
  ALTER COLUMN "departedAt" DROP NOT NULL,
  ALTER COLUMN "operatorName" DROP NOT NULL;

-- 为历史已下达销售通知补齐出库管理单。
INSERT INTO "outbound_orders" (
  "id", "orderNo", "dispatchNoticeId", "warehouseId", "status",
  "plannedQuantity", "reservedQuantity", "actualQuantity", "shortageQuantity",
  "createdBy", "createdAt", "updatedAt"
)
SELECT
  'outo_' || md5(n."id"),
  'OOM-MIG-' || upper(substr(md5(n."id"), 1, 12)),
  n."id",
  n."warehouseId",
  CASE
    WHEN n."status" = 'COMPLETED' THEN 'COMPLETED'
    WHEN EXISTS (
      SELECT 1 FROM "outbound_receipts" r
      JOIN "waybills" w ON w."id" = r."waybillId"
      WHERE w."dispatchNoticeId" = n."id" AND r."status" = 'POSTED' AND r."deletedAt" IS NULL
    ) THEN 'PARTIAL'
    ELSE 'PENDING'
  END,
  n."totalQuantity",
  0,
  COALESCE((
    SELECT SUM(r."outboundQuantity") FROM "outbound_receipts" r
    JOIN "waybills" w ON w."id" = r."waybillId"
    WHERE w."dispatchNoticeId" = n."id" AND r."status" = 'POSTED' AND r."deletedAt" IS NULL
  ), 0),
  n."totalQuantity",
  n."createdBy",
  COALESCE(n."issuedAt", n."createdAt"),
  CURRENT_TIMESTAMP
FROM "dispatch_notices" n
WHERE n."type" = 'SALES'
  AND n."mode" = 'STANDARD'
  AND n."warehouseId" IS NOT NULL
  AND n."status" IN ('ISSUED', 'IN_PROGRESS', 'COMPLETED');

INSERT INTO "outbound_order_lines" (
  "id", "outboundOrderId", "dispatchNoticeLineItemId", "materialId", "materialName",
  "unit", "plannedQuantity", "reservedQuantity", "actualQuantity", "createdAt", "updatedAt"
)
SELECT
  'outol_' || md5(li."id"),
  o."id",
  li."id",
  li."materialId",
  li."materialName",
  li."unit",
  li."quantity",
  0,
  COALESCE((
    SELECT SUM(r."outboundQuantity")
    FROM "outbound_receipts" r
    JOIN "waybills" w ON w."id" = r."waybillId"
    JOIN "waybill_line_items" wli ON wli."waybillId" = w."id"
    WHERE wli."dispatchNoticeLineItemId" = li."id"
      AND r."status" = 'POSTED'
      AND r."deletedAt" IS NULL
  ), 0),
  li."createdAt",
  CURRENT_TIMESTAMP
FROM "dispatch_notice_line_items" li
JOIN "outbound_orders" o ON o."dispatchNoticeId" = li."dispatchNoticeId";

UPDATE "outbound_receipts" r
SET
  "outboundOrderId" = o."id",
  "plannedQuantity" = COALESCE(w."totalQuantity", r."outboundQuantity", 0),
  "status" = CASE
    WHEN r."status" = 'POSTED' THEN 'POSTED'
    WHEN r."status" = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'READY'
  END
FROM "waybills" w
JOIN "outbound_orders" o ON o."dispatchNoticeId" = w."dispatchNoticeId"
WHERE r."waybillId" = w."id";

ALTER TABLE "outbound_receipts" ALTER COLUMN "outboundOrderId" SET NOT NULL;

CREATE INDEX "outbound_receipts_outboundOrderId_idx" ON "outbound_receipts"("outboundOrderId");
CREATE UNIQUE INDEX "outbound_receipts_active_waybill_key"
  ON "outbound_receipts"("waybillId")
  WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED';

ALTER TABLE "outbound_orders"
  ADD CONSTRAINT "outbound_orders_dispatchNoticeId_fkey" FOREIGN KEY ("dispatchNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "outbound_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "outbound_orders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbound_order_lines"
  ADD CONSTRAINT "outbound_order_lines_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "outbound_order_lines_dispatchNoticeLineItemId_fkey" FOREIGN KEY ("dispatchNoticeLineItemId") REFERENCES "dispatch_notice_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbound_receipts"
  ADD CONSTRAINT "outbound_receipts_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "outbound_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
