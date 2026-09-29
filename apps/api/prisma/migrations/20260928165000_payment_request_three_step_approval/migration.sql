-- 付款申请由采销业务员或运营经理发起，审批调整为：
-- 风控/财务经理 -> 业务责任人 -> 总经理。

UPDATE "approval_flows"
SET "name" = '付款申请三级审批流', "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "contractType" = 'PAYMENT_REQUEST';

INSERT INTO "approval_flow_nodes" (
  "id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt"
)
SELECT 'flow-payment-request-node-1', flow."id", '风控/财务经理', 1, role."id", 'ANY', 'ALL', 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
JOIN "roles" role ON role."code" = 'RISK_MANAGER'
WHERE flow."contractType" = 'PAYMENT_REQUEST'
ON CONFLICT ("flowId", "step") DO UPDATE SET
  "nodeName" = EXCLUDED."nodeName", "roleId" = EXCLUDED."roleId", "approvalMode" = EXCLUDED."approvalMode",
  "scopeType" = EXCLUDED."scopeType", "condition" = EXCLUDED."condition", "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "approval_flow_nodes" (
  "id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt"
)
SELECT 'flow-payment-request-node-2', flow."id", '业务责任人', 2, role."id", 'ANY', 'BUSINESS_UNIT', 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
JOIN "roles" role ON role."code" = 'BUSINESS_OWNER'
WHERE flow."contractType" = 'PAYMENT_REQUEST'
ON CONFLICT ("flowId", "step") DO UPDATE SET
  "nodeName" = EXCLUDED."nodeName", "roleId" = EXCLUDED."roleId", "approvalMode" = EXCLUDED."approvalMode",
  "scopeType" = EXCLUDED."scopeType", "condition" = EXCLUDED."condition", "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "approval_flow_nodes" (
  "id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt"
)
SELECT 'flow-payment-request-node-3', flow."id", '总经理', 3, role."id", 'ANY', 'ALL', 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
JOIN "roles" role ON role."code" = 'GENERAL_MANAGER'
WHERE flow."contractType" = 'PAYMENT_REQUEST'
ON CONFLICT ("flowId", "step") DO UPDATE SET
  "nodeName" = EXCLUDED."nodeName", "roleId" = EXCLUDED."roleId", "approvalMode" = EXCLUDED."approvalMode",
  "scopeType" = EXCLUDED."scopeType", "condition" = EXCLUDED."condition", "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "approval_flow_nodes"
WHERE "flowId" IN (SELECT "id" FROM "approval_flows" WHERE "contractType" = 'PAYMENT_REQUEST')
  AND "step" NOT IN (1, 2, 3);

-- 发起人与审批人职责分离：采销业务员、运营经理发起，业务责任人参与审批。
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" IN ('SALESPERSON', 'BUSINESS_MANAGER')
  AND permission."code" = 'settlement.payment.apply'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'BUSINESS_OWNER'
  AND permission."code" = 'settlement.payment.approve'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

DELETE FROM "role_permissions"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "code" = 'BUSINESS_OWNER')
  AND "permissionId" IN (SELECT "id" FROM "permissions" WHERE "code" = 'settlement.payment.apply');
