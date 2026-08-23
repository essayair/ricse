CREATE TABLE "business_operation_logs" (
    "id" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_operation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_operation_logs_businessType_businessId_createdAt_idx"
ON "business_operation_logs"("businessType", "businessId", "createdAt");

CREATE INDEX "business_operation_logs_operatorId_idx"
ON "business_operation_logs"("operatorId");

ALTER TABLE "business_operation_logs"
ADD CONSTRAINT "business_operation_logs_operatorId_fkey"
FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 为既有核心业务单据补齐创建记录，保证上线后历史详情也能显示创建人。
INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-contract-' || "id", 'CONTRACT', "id", 'CREATE', '创建合同', "createdBy", "createdAt" FROM "contracts";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-order-' || "id", 'ORDER', "id", 'CREATE', '创建执行批次', "createdBy", "createdAt" FROM "orders";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-dispatch-' || "id", 'DISPATCH_NOTICE', "id", 'CREATE', '创建执行通知', "createdBy", "createdAt" FROM "dispatch_notices";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-waybill-' || "id", 'WAYBILL', "id", 'CREATE', '创建物流运单', "createdBy", "createdAt" FROM "waybills";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-weigh-ticket-' || "id", 'WEIGH_TICKET', "id", 'CREATE', '创建磅单', "createdBy", "createdAt" FROM "weigh_tickets";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-quality-task-' || "id", 'QUALITY_TASK', "id", 'CREATE', '创建质检任务', "createdBy", "createdAt" FROM "quality_tasks";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-inbound-' || "id", 'INBOUND_RECEIPT', "id", 'CREATE', '创建入库单', "createdBy", "createdAt" FROM "inbound_receipts";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-outbound-' || "id", 'OUTBOUND_RECEIPT', "id", 'CREATE', '创建出库单', "createdBy", "createdAt" FROM "outbound_receipts";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-outbound-order-' || "id", 'OUTBOUND_ORDER', "id", 'CREATE', '创建出库管理单', "createdBy", "createdAt" FROM "outbound_orders";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-reversal-' || "id", 'INVENTORY_REVERSAL', "id", 'CREATE', '创建库存冲销单', "createdBy", "createdAt" FROM "inventory_reversals";

INSERT INTO "business_operation_logs" ("id", "businessType", "businessId", "action", "actionLabel", "operatorId", "createdAt")
SELECT 'legacy-production-task-' || "id", 'PRODUCTION_TASK', "id", 'CREATE', '创建生产任务', "createdBy", "createdAt" FROM "production_tasks";
