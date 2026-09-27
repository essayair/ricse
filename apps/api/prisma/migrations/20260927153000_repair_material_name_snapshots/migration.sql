-- 修复历史业务链路中缺失、空白或误存为 materialId 的物料名称快照。
-- 快照中已有正常名称的数据保持不变。

UPDATE "contract_line_items" AS line
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = line."materialId"
  AND (line."materialName" IS NULL OR BTRIM(line."materialName") = '' OR line."materialName" = line."materialId");

UPDATE "order_line_items" AS line
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = line."materialId"
  AND (line."materialName" IS NULL OR BTRIM(line."materialName") = '' OR line."materialName" = line."materialId");

UPDATE "dispatch_notice_line_items" AS line
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = line."materialId"
  AND (line."materialName" IS NULL OR BTRIM(line."materialName") = '' OR line."materialName" = line."materialId");

UPDATE "waybill_line_items" AS line
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = line."materialId"
  AND (line."materialName" IS NULL OR BTRIM(line."materialName") = '' OR line."materialName" = line."materialId");

UPDATE "inbound_receipts" AS receipt
SET "materialName" = material."name"
FROM "waybill_line_items" AS line, "materials" AS material
WHERE line."waybillId" = receipt."waybillId"
  AND material."id" = line."materialId"
  AND (BTRIM(receipt."materialName") = '' OR receipt."materialName" = line."materialId");

UPDATE "weigh_tickets" AS ticket
SET "materialName" = material."name"
FROM "waybill_line_items" AS line, "materials" AS material
WHERE line."waybillId" = ticket."waybillId"
  AND material."id" = line."materialId"
  AND (ticket."materialName" IS NULL OR BTRIM(ticket."materialName") = '' OR ticket."materialName" = line."materialId");

UPDATE "quality_inspections" AS inspection
SET "materialName" = material."name"
FROM "weigh_tickets" AS ticket, "waybill_line_items" AS line, "materials" AS material
WHERE ticket."id" = inspection."weighTicketId"
  AND line."waybillId" = ticket."waybillId"
  AND material."id" = line."materialId"
  AND (BTRIM(inspection."materialName") = '' OR inspection."materialName" = line."materialId");

UPDATE "business_inbounds" AS inbound
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = inbound."materialId"
  AND (BTRIM(inbound."materialName") = '' OR inbound."materialName" = inbound."materialId");

UPDATE "inventory_lots" AS lot
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = lot."materialId"
  AND (BTRIM(lot."materialName") = '' OR lot."materialName" = lot."materialId");

UPDATE "outbound_order_lines" AS line
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = line."materialId"
  AND (line."materialName" IS NULL OR BTRIM(line."materialName") = '' OR line."materialName" = line."materialId");

UPDATE "outbound_receipts" AS receipt
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = receipt."materialId"
  AND (BTRIM(receipt."materialName") = '' OR receipt."materialName" = receipt."materialId");

UPDATE "sales_outbounds" AS outbound
SET "materialName" = material."name"
FROM "materials" AS material
WHERE material."id" = outbound."materialId"
  AND (BTRIM(outbound."materialName") = '' OR outbound."materialName" = outbound."materialId");
