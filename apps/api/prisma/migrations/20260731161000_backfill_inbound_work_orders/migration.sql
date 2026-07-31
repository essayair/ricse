-- 为升级前已经在途、到达或签收，但尚无有效入库单的采购运单补建入库作业单。
-- 使用运单 ID 的哈希生成稳定唯一的迁移编号，迁移重复执行也不会重复建单。
INSERT INTO "inbound_receipts" (
  "id",
  "receiptNo",
  "waybillId",
  "warehouseId",
  "status",
  "materialName",
  "supplierName",
  "plateNo",
  "plannedQuantity",
  "receivedQuantity",
  "acceptanceConclusion",
  "receivedAt",
  "receiverName",
  "remarks",
  "createdBy",
  "createdAt",
  "updatedAt"
)
SELECT
  'inb_' || md5(w."id"),
  'LIR-MIG-' || upper(substr(md5(w."id"), 1, 12)),
  w."id",
  dn."warehouseId",
  'PENDING',
  COALESCE(first_line."materialName", '未命名物料'),
  supplier."name",
  w."plateNo",
  w."totalQuantity",
  NULL,
  NULL,
  NULL,
  NULL,
  '由历史采购运单升级补建的入库作业单',
  w."createdBy",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "waybills" w
JOIN "dispatch_notices" dn ON dn."id" = w."dispatchNoticeId"
JOIN "orders" o ON o."id" = dn."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
LEFT JOIN "partners" supplier ON supplier."id" = c."sellerId"
LEFT JOIN LATERAL (
  SELECT wli."materialName"
  FROM "waybill_line_items" wli
  WHERE wli."waybillId" = w."id"
  ORDER BY wli."createdAt" ASC
  LIMIT 1
) first_line ON TRUE
WHERE w."deletedAt" IS NULL
  AND dn."deletedAt" IS NULL
  AND dn."type" = 'PURCHASE'
  AND w."status" IN ('IN_TRANSIT', 'ARRIVED', 'SIGNED')
  AND NOT EXISTS (
    SELECT 1
    FROM "inbound_receipts" ir
    WHERE ir."waybillId" = w."id"
      AND ir."deletedAt" IS NULL
      AND ir."status" <> 'CANCELLED'
  );
