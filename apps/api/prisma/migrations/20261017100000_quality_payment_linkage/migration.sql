-- 增量升级：保留原结算和付款历史，旧申请显式使用 LEGACY 兼容口径。
ALTER TABLE "financial_settlements" ADD COLUMN "qualityDeductionAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "financial_settlement_lines"
  ADD COLUMN "waybillLineItemId" TEXT,
  ADD COLUMN "weightSelectionId" TEXT,
  ADD COLUMN "qualityTaskId" TEXT,
  ADD COLUMN "sourceSnapshot" JSONB,
  ADD COLUMN "qualityDeductionAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
CREATE INDEX "financial_settlement_lines_waybillLineItemId_idx" ON "financial_settlement_lines"("waybillLineItemId");
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_waybillLineItemId_fkey" FOREIGN KEY ("waybillLineItemId") REFERENCES "waybill_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_weightSelectionId_fkey" FOREIGN KEY ("weightSelectionId") REFERENCES "waybill_weight_selections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlement_lines" ADD CONSTRAINT "financial_settlement_lines_qualityTaskId_fkey" FOREIGN KEY ("qualityTaskId") REFERENCES "quality_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_tasks" ADD COLUMN "qualityAcceptanceSnapshot" JSONB;
ALTER TABLE "settlement_allocations" ADD COLUMN "earmarkConsumptions" JSONB;
ALTER TABLE "payment_requests"
  ADD COLUMN "basisType" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "stageName" TEXT,
  ADD COLUMN "conditionText" TEXT,
  ADD COLUMN "conditionTypes" JSONB,
  ADD COLUMN "sourceLineIds" JSONB,
  ADD COLUMN "evidenceSnapshot" JSONB,
  ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "payment_requests_createdBy_clientRequestId_key" ON "payment_requests"("createdBy", "clientRequestId");

CREATE TABLE "fund_earmarks" (
  "id" TEXT NOT NULL,
  "fundTransactionId" TEXT NOT NULL,
  "settlementId" TEXT,
  "orderId" TEXT,
  "amount" DECIMAL(15,2) NOT NULL,
  "consumedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fund_earmarks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fund_earmarks_one_target_check" CHECK (("settlementId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int = 1),
  CONSTRAINT "fund_earmarks_amount_check" CHECK ("amount" > 0 AND "consumedAmount" >= 0 AND "consumedAmount" <= "amount")
);
CREATE INDEX "fund_earmarks_fundTransactionId_releasedAt_idx" ON "fund_earmarks"("fundTransactionId", "releasedAt");
CREATE INDEX "fund_earmarks_settlementId_idx" ON "fund_earmarks"("settlementId");
CREATE INDEX "fund_earmarks_orderId_idx" ON "fund_earmarks"("orderId");
ALTER TABLE "fund_earmarks" ADD CONSTRAINT "fund_earmarks_fundTransactionId_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "fund_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_earmarks" ADD CONSTRAINT "fund_earmarks_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_earmarks" ADD CONSTRAINT "fund_earmarks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt")
VALUES ('perm_settlement_quality_accept', 'settlement.quality.accept', '确认合同扣款接收', 'SETTLEMENT', 'QUALITY_ACCEPT', '结算制单或付款申请人员按合同确认扣款接收，不修改检测事实', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p."id"
FROM "role_permissions" rp
JOIN "permissions" existing ON existing."id" = rp."permissionId"
CROSS JOIN "permissions" p
WHERE existing."code" IN ('settlement.create', 'settlement.payment.apply') AND p."code" = 'settlement.quality.accept'
ON CONFLICT DO NOTHING;
