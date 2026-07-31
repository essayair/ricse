-- 入库单从“质检合格后的结果单”升级为“采购在途开始的入库作业单”。
-- 磅单、最终验收质检和实际入库数量在后续作业节点逐步补齐。
ALTER TABLE "inbound_receipts"
  ADD COLUMN "plannedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  ALTER COLUMN "weighTicketId" DROP NOT NULL,
  ALTER COLUMN "qualityInspectionId" DROP NOT NULL,
  ALTER COLUMN "acceptanceConclusion" DROP NOT NULL,
  ALTER COLUMN "receivedQuantity" DROP NOT NULL;

UPDATE "inbound_receipts"
SET "plannedQuantity" = COALESCE("receivedQuantity", 0)
WHERE "plannedQuantity" = 0;
