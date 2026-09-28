-- 付款申请接入系统管理中的可配置审批流程。

CREATE TABLE "payment_request_approvals" (
  "id" TEXT NOT NULL,
  "paymentRequestId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "actedById" TEXT,
  "nodeName" TEXT NOT NULL DEFAULT '付款申请审批',
  "roleCode" TEXT,
  "roleName" TEXT,
  "approvalMode" TEXT NOT NULL DEFAULT 'ALL',
  "step" INTEGER NOT NULL DEFAULT 1,
  "round" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "comment" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_request_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_request_approvals_paymentRequestId_idx" ON "payment_request_approvals"("paymentRequestId");
CREATE INDEX "payment_request_approvals_assigneeId_idx" ON "payment_request_approvals"("assigneeId");
CREATE INDEX "payment_request_approvals_actedById_idx" ON "payment_request_approvals"("actedById");
CREATE INDEX "payment_request_approvals_paymentRequestId_round_step_idx" ON "payment_request_approvals"("paymentRequestId", "round", "step");

ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_request_approvals" ADD CONSTRAINT "payment_request_approvals_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "approval_flows" ("id", "name", "contractType", "amountThreshold", "status", "createdAt", "updatedAt")
VALUES ('flow-payment-request', '付款申请审批流', 'PAYMENT_REQUEST', NULL, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("contractType") DO UPDATE SET
  "name" = EXCLUDED."name", "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "approval_flow_nodes" ("id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt")
SELECT 'flow-payment-request-node-1', flow."id", '风控/财务经理', 1, role."id", 'ANY', 'ALL', 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
JOIN "roles" role ON role."code" = 'RISK_MANAGER'
WHERE flow."contractType" = 'PAYMENT_REQUEST'
ON CONFLICT ("flowId", "step") DO UPDATE SET
  "nodeName" = EXCLUDED."nodeName", "roleId" = EXCLUDED."roleId", "approvalMode" = EXCLUDED."approvalMode",
  "scopeType" = EXCLUDED."scopeType", "condition" = EXCLUDED."condition", "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "approval_flow_nodes" ("id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt")
SELECT 'flow-payment-request-node-2', flow."id", '总经理', 2, role."id", 'ANY', 'ALL', 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
JOIN "roles" role ON role."code" = 'GENERAL_MANAGER'
WHERE flow."contractType" = 'PAYMENT_REQUEST'
ON CONFLICT ("flowId", "step") DO UPDATE SET
  "nodeName" = EXCLUDED."nodeName", "roleId" = EXCLUDED."roleId", "approvalMode" = EXCLUDED."approvalMode",
  "scopeType" = EXCLUDED."scopeType", "condition" = EXCLUDED."condition", "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

-- 旧版本的待审批申请没有节点任务，退回草稿后由用户重新提交，建立完整审批轨迹。
UPDATE "payment_requests"
SET "status" = 'DRAFT', "submittedBy" = NULL, "submittedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_APPROVAL';

UPDATE "permissions"
SET "name" = '创建付款单', "description" = '根据已批准付款申请创建实际付款单', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'settlement.payment.execute';
