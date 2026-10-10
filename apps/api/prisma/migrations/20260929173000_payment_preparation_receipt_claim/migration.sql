-- 付款申请增加“业务确认—财务送审”职责分离，并保存银行账户快照。
ALTER TABLE "payment_requests"
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "businessConfirmedBy" TEXT,
  ADD COLUMN "businessConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "ourBankAccountName" TEXT,
  ADD COLUMN "ourBankName" TEXT,
  ADD COLUMN "ourBankCode" TEXT,
  ADD COLUMN "counterpartyBankAccountName" TEXT,
  ADD COLUMN "counterpartyBankName" TEXT,
  ADD COLUMN "counterpartyBankCode" TEXT;

CREATE INDEX "payment_requests_orderId_idx" ON "payment_requests"("orderId");
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_businessConfirmedBy_fkey" FOREIGN KEY ("businessConfirmedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 收款允许先按银行流水登记，合同和交易对手在认领时确定。
ALTER TABLE "fund_transactions"
  ALTER COLUMN "contractId" DROP NOT NULL,
  ALTER COLUMN "counterpartyId" DROP NOT NULL,
  ADD COLUMN "ourBankAccountName" TEXT,
  ADD COLUMN "ourBankName" TEXT,
  ADD COLUMN "ourBankCode" TEXT,
  ADD COLUMN "counterpartyBankAccountName" TEXT,
  ADD COLUMN "counterpartyBankName" TEXT,
  ADD COLUMN "counterpartyBankCode" TEXT;

CREATE TABLE "fund_claims" (
  "id" TEXT NOT NULL,
  "fundTransactionId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "orderId" TEXT,
  "businessUnitId" TEXT,
  "counterpartyId" TEXT NOT NULL,
  "paymentStage" TEXT NOT NULL DEFAULT 'SETTLEMENT',
  "amount" DECIMAL(15,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fund_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fund_claims_fundTransactionId_status_idx" ON "fund_claims"("fundTransactionId", "status");
CREATE INDEX "fund_claims_contractId_idx" ON "fund_claims"("contractId");
CREATE INDEX "fund_claims_orderId_idx" ON "fund_claims"("orderId");
CREATE INDEX "fund_claims_businessUnitId_idx" ON "fund_claims"("businessUnitId");
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_fundTransactionId_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "fund_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_claims" ADD CONSTRAINT "fund_claims_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 历史收款原本在流水主表上直接关联单一合同，迁移为一条等额认领明细。
INSERT INTO "fund_claims" (
  "id", "fundTransactionId", "contractId", "businessUnitId", "counterpartyId", "paymentStage",
  "amount", "status", "createdBy", "confirmedBy", "confirmedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy-claim-' || fund."id", fund."id", fund."contractId", contract."businessUnitId", fund."counterpartyId", fund."paymentStage",
  fund."amount",
  CASE WHEN fund."status" IN ('CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED') THEN 'CONFIRMED' ELSE 'PENDING_CONFIRMATION' END,
  COALESCE(fund."claimedBy", fund."createdBy"), fund."confirmedBy", fund."confirmedAt", fund."createdAt", CURRENT_TIMESTAMP
FROM "fund_transactions" fund
JOIN "contracts" contract ON contract."id" = fund."contractId"
WHERE fund."direction" = 'RECEIPT' AND fund."contractId" IS NOT NULL AND fund."counterpartyId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt")
VALUES ('perm_payment_submit', 'settlement.payment.submit', '财务提交付款审批', 'SETTLEMENT', 'PAYMENT_SUBMIT', '复核业务准备资料并正式提交付款审批流程', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "permissions"
SET "name" = '编制付款申请', "description" = '业务人员编制并确认付款申请资料', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'settlement.payment.apply';

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" IN ('ADMIN', 'FINANCE_SPECIALIST', 'ACCOUNTANT')
  AND permission."code" = 'settlement.payment.submit'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
