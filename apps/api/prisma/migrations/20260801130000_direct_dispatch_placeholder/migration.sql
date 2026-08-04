-- 直拨发运不经过我方仓库，管理单只承担物流、磅单、质检与签收进度跟踪。
ALTER TABLE "outbound_orders" ALTER COLUMN "warehouseId" DROP NOT NULL;

-- 为历史已经下达或执行中的销售直拨通知补齐直拨发运管理占位单。
INSERT INTO "outbound_orders" (
  "id", "orderNo", "dispatchNoticeId", "warehouseId", "status",
  "plannedQuantity", "reservedQuantity", "actualQuantity", "shortageQuantity",
  "createdBy", "createdAt", "updatedAt"
)
SELECT
  'outd_' || md5(n."id"),
  'DFM-MIG-' || upper(substr(md5(n."id"), 1, 12)),
  n."id",
  NULL,
  CASE WHEN n."status" = 'COMPLETED' THEN 'COMPLETED' ELSE 'PENDING' END,
  n."totalQuantity",
  0,
  0,
  0,
  n."createdBy",
  COALESCE(n."issuedAt", n."createdAt"),
  CURRENT_TIMESTAMP
FROM "dispatch_notices" n
WHERE n."type" = 'SALES'
  AND n."mode" = 'DIRECT'
  AND n."status" IN ('ISSUED', 'IN_PROGRESS', 'COMPLETED')
  AND n."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "outbound_orders" o WHERE o."dispatchNoticeId" = n."id"
  );

INSERT INTO "outbound_order_lines" (
  "id", "outboundOrderId", "dispatchNoticeLineItemId", "materialId", "materialName",
  "unit", "plannedQuantity", "reservedQuantity", "actualQuantity", "createdAt", "updatedAt"
)
SELECT
  'outdl_' || md5(li."id"),
  o."id",
  li."id",
  li."materialId",
  li."materialName",
  li."unit",
  li."quantity",
  0,
  0,
  li."createdAt",
  CURRENT_TIMESTAMP
FROM "dispatch_notice_line_items" li
JOIN "dispatch_notices" n ON n."id" = li."dispatchNoticeId"
JOIN "outbound_orders" o ON o."dispatchNoticeId" = n."id"
WHERE n."type" = 'SALES'
  AND n."mode" = 'DIRECT'
  AND NOT EXISTS (
    SELECT 1 FROM "outbound_order_lines" ol WHERE ol."dispatchNoticeLineItemId" = li."id"
  );
