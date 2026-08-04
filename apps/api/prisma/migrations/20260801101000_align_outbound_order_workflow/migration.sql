-- 对齐 Prisma 可空关系、默认值及外键删除规则。
ALTER TABLE "inbound_receipts" DROP CONSTRAINT "inbound_receipts_qualityInspectionId_fkey";
ALTER TABLE "inbound_receipts" DROP CONSTRAINT "inbound_receipts_warehouseId_fkey";
ALTER TABLE "inbound_receipts" DROP CONSTRAINT "inbound_receipts_weighTicketId_fkey";
ALTER TABLE "outbound_receipts" DROP CONSTRAINT "outbound_receipts_weighTicketId_fkey";

ALTER TABLE "outbound_order_lines" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "outbound_orders" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "outbound_receipts"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "plannedQuantity" DROP DEFAULT;

ALTER TABLE "inbound_receipts"
  ADD CONSTRAINT "inbound_receipts_weighTicketId_fkey" FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "inbound_receipts_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "inbound_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_receipts"
  ADD CONSTRAINT "outbound_receipts_weighTicketId_fkey" FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
