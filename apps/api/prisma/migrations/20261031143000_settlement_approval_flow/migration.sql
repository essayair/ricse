INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt")
VALUES ('perm_settlement_approve', 'settlement.approve', '审批结算单', 'SETTLEMENT', 'APPROVE', '审批协商数量和偏离常规依据的采购或销售结算单', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id" FROM "roles" role CROSS JOIN "permissions" permission
WHERE role."code" IN ('BUSINESS_MANAGER', 'RISK_MANAGER', 'BUSINESS_OWNER', 'GENERAL_MANAGER', 'ADMIN')
  AND permission."code" = 'settlement.approve'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "approval_flows" ("id", "name", "contractType", "status", "createdAt", "updatedAt")
VALUES ('flow-financial-settlement', '采购销售结算四级审批流', 'FINANCIAL_SETTLEMENT', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("contractType") DO NOTHING;

INSERT INTO "approval_flow_nodes" ("id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt")
SELECT 'flow-financial-settlement-node-' || node."step", flow."id", node."nodeName", node."step", role."id", 'ANY', node."scopeType", 'ALWAYS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "approval_flows" flow
CROSS JOIN (VALUES
  (1, '运营经理', 'BUSINESS_MANAGER', 'BUSINESS_UNIT'),
  (2, '风控/财务经理', 'RISK_MANAGER', 'ALL'),
  (3, '业务责任人', 'BUSINESS_OWNER', 'BUSINESS_UNIT'),
  (4, '总经理', 'GENERAL_MANAGER', 'ALL')
) AS node("step", "nodeName", "roleCode", "scopeType")
JOIN "roles" role ON role."code" = node."roleCode"
WHERE flow."contractType" = 'FINANCIAL_SETTLEMENT'
ON CONFLICT ("flowId", "step") DO NOTHING;
