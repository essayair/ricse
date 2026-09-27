-- 收款认领、财务确认和付款申请闭环。

ALTER TABLE "fund_transactions"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION',
  ADD COLUMN "actualPayerName" TEXT,
  ADD COLUMN "actualPayeeName" TEXT,
  ADD COLUMN "isThirdParty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "thirdPartyReason" TEXT,
  ADD COLUMN "paymentRequestId" TEXT,
  ADD COLUMN "claimedBy" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

UPDATE "fund_transactions" f
SET
  "actualPayerName" = CASE WHEN f."direction" = 'RECEIPT' THEN counterparty."name" ELSE legal_entity."name" END,
  "actualPayeeName" = CASE WHEN f."direction" = 'RECEIPT' THEN legal_entity."name" ELSE counterparty."name" END,
  "confirmedAt" = f."createdAt",
  "confirmedBy" = f."createdBy"
FROM "partners" legal_entity, "partners" counterparty
WHERE legal_entity."id" = f."legalEntityPartnerId"
  AND counterparty."id" = f."counterpartyId";

CREATE TABLE "payment_requests" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "businessType" TEXT NOT NULL DEFAULT 'PURCHASE',
  "paymentStage" TEXT NOT NULL DEFAULT 'SETTLEMENT',
  "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  "contractId" TEXT NOT NULL,
  "settlementId" TEXT,
  "businessUnitId" TEXT,
  "legalEntityPartnerId" TEXT NOT NULL,
  "counterpartyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "amount" DECIMAL(15,2) NOT NULL,
  "requestedPayDate" TIMESTAMP(3),
  "ourBankAccount" TEXT,
  "counterpartyBankAccount" TEXT,
  "actualPayeeName" TEXT,
  "isThirdParty" BOOLEAN NOT NULL DEFAULT false,
  "thirdPartyReason" TEXT,
  "purpose" TEXT,
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "submittedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_requests_requestNo_key" ON "payment_requests"("requestNo");
CREATE INDEX "payment_requests_status_requestedPayDate_idx" ON "payment_requests"("status", "requestedPayDate");
CREATE INDEX "payment_requests_contractId_idx" ON "payment_requests"("contractId");
CREATE INDEX "payment_requests_settlementId_idx" ON "payment_requests"("settlementId");
CREATE INDEX "payment_requests_businessUnitId_idx" ON "payment_requests"("businessUnitId");
CREATE UNIQUE INDEX "fund_transactions_paymentRequestId_key" ON "fund_transactions"("paymentRequestId");

ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_legalEntityPartnerId_fkey" FOREIGN KEY ("legalEntityPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_claimedBy_fkey" FOREIGN KEY ("claimedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attachments"
  ADD COLUMN "fundTransactionId" TEXT,
  ADD COLUMN "paymentRequestId" TEXT;
CREATE INDEX "attachments_fundTransactionId_idx" ON "attachments"("fundTransactionId");
CREATE INDEX "attachments_paymentRequestId_idx" ON "attachments"("paymentRequestId");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_fundTransactionId_fkey" FOREIGN KEY ("fundTransactionId") REFERENCES "fund_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt") VALUES
  ('perm_settlement_create', 'settlement.create', '创建应收应付', 'SETTLEMENT', 'CREATE', '创建应收、应付结算单', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_settlement_confirm', 'settlement.confirm', '确认应收应付', 'SETTLEMENT', 'CONFIRM', '确认结算口径并形成正式应收应付', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_receipt_register', 'settlement.receipt.register', '登记收款', 'SETTLEMENT', 'RECEIPT_REGISTER', '依据银行到账登记收款流水', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_receipt_claim', 'settlement.receipt.claim', '认领收款', 'SETTLEMENT', 'RECEIPT_CLAIM', '将收款认领到授权业务合同', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_fund_confirm', 'settlement.fund.confirm', '确认资金流水', 'SETTLEMENT', 'FUND_CONFIRM', '复核实际收付款事实', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_payment_apply', 'settlement.payment.apply', '发起付款申请', 'SETTLEMENT', 'PAYMENT_APPLY', '从采购合同或应付结算单发起付款申请', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_payment_approve', 'settlement.payment.approve', '审批付款申请', 'SETTLEMENT', 'PAYMENT_APPROVE', '审批或驳回付款申请', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_payment_execute', 'settlement.payment.execute', '执行付款', 'SETTLEMENT', 'PAYMENT_EXECUTE', '根据已批准付款申请登记实际付款', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_settlement_allocate', 'settlement.allocate', '核销收付款', 'SETTLEMENT', 'ALLOCATE', '将已确认资金流水核销至结算单', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_settlement_reverse', 'settlement.reverse', '撤销及作废资金', 'SETTLEMENT', 'REVERSE', '撤销核销并作废错误资金单据', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "module" = EXCLUDED."module", "action" = EXCLUDED."action",
  "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "roles" ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt") VALUES
  ('role_cashier', 'CASHIER', '资金出纳', '登记银行收款、执行已批准付款并维护银行回单', 'BUSINESS', 'ACTIVE', true, 91, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_accountant', 'ACCOUNTANT', '财务会计', '确认结算与资金流水并完成应收应付核销', 'BUSINESS', 'ACTIVE', true, 92, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "status" = 'ACTIVE',
  "isSystem" = true, "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE
  (role."code" = 'ADMIN' AND permission."code" LIKE 'settlement.%')
  OR (role."code" = 'FINANCE_SPECIALIST' AND permission."code" IN (
    'settlement.view', 'settlement.manage', 'settlement.create', 'settlement.confirm',
    'settlement.receipt.register', 'settlement.receipt.claim', 'settlement.fund.confirm',
    'settlement.payment.apply', 'settlement.payment.approve', 'settlement.payment.execute',
    'settlement.allocate', 'settlement.reverse'
  ))
  OR (role."code" = 'CASHIER' AND permission."code" IN (
    'settlement.view', 'settlement.receipt.register', 'settlement.payment.execute'
  ))
  OR (role."code" = 'ACCOUNTANT' AND permission."code" IN (
    'settlement.view', 'settlement.create', 'settlement.confirm', 'settlement.fund.confirm',
    'settlement.allocate', 'settlement.reverse'
  ))
  OR (role."code" IN ('BUSINESS_MANAGER', 'BUSINESS_OWNER') AND permission."code" IN (
    'settlement.receipt.claim', 'settlement.payment.apply'
  ))
  OR (role."code" IN ('RISK_MANAGER', 'GENERAL_MANAGER') AND permission."code" = 'settlement.payment.approve')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
