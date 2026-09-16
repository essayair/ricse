-- 精简泛化角色，建立“运营经理 → 风控/财务经理 → 业务责任人 → 总经理”审批链。
-- 已生成的 approvals 是审批快照，不依赖 approval_flow_nodes 外键，因此不会改写在途任务；
-- 发布前仍应完成或撤回由历史 APPROVER 单独承担的在途审批，避免其角色停用后只能由管理员兜底处理。

UPDATE "roles"
SET
  "name" = '运营经理',
  "description" = '负责合同资料完整性、业务流程和履约条件审核',
  "type" = 'MANAGEMENT',
  "status" = 'ACTIVE',
  "isSystem" = true,
  "sort" = 30,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'BUSINESS_MANAGER';

UPDATE "roles"
SET
  "name" = '风控/财务经理',
  "description" = '负责合同资金、账期、税务、结算、信用及风险复核',
  "type" = 'MANAGEMENT',
  "status" = 'ACTIVE',
  "isSystem" = true,
  "sort" = 40,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'RISK_MANAGER';

INSERT INTO "roles"
  ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt")
VALUES
  (
    'role_business_owner',
    'BUSINESS_OWNER',
    '业务责任人',
    '对所属业务单元的经营结果、利润和合同决策负责',
    'MANAGEMENT',
    'ACTIVE',
    true,
    45,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "type" = EXCLUDED."type",
  "status" = 'ACTIVE',
  "isSystem" = true,
  "sort" = EXCLUDED."sort",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "roles"
SET
  "description" = '负责合同最终经营决策与重大风险确认',
  "type" = 'MANAGEMENT',
  "status" = 'ACTIVE',
  "isSystem" = true,
  "sort" = 50,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GENERAL_MANAGER';

UPDATE "roles"
SET
  "name" = '基础查看',
  "description" = '查看授权业务单元内的基础业务数据，不包含新增、修改、审批和系统配置权限',
  "type" = 'BUSINESS',
  "status" = 'ACTIVE',
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'USER';

-- “管理人员”和“审批人”职责过于宽泛；保留历史记录但停止继续授权。
UPDATE "roles"
SET
  "name" = CASE "code"
    WHEN 'MANAGER' THEN '管理人员（已停用）'
    ELSE '审批人（已停用）'
  END,
  "description" = '历史兼容角色，已由明确岗位角色和专项权限替代',
  "status" = 'INACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('MANAGER', 'APPROVER');

UPDATE "user_role_assignments"
SET "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "code" IN ('MANAGER', 'APPROVER'));

-- ADMIN 已拥有全部权限；其余角色授权对管理员完全重复，停用以减少授权噪音。
UPDATE "user_role_assignments" assignment
SET "status" = 'INACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE assignment."roleId" <> (SELECT "id" FROM "roles" WHERE "code" = 'ADMIN')
  AND EXISTS (
    SELECT 1
    FROM "user_role_assignments" admin_assignment
    JOIN "roles" admin_role ON admin_role."id" = admin_assignment."roleId"
    WHERE admin_assignment."userId" = assignment."userId"
      AND admin_assignment."status" = 'ACTIVE'
      AND admin_role."code" = 'ADMIN'
      AND admin_role."status" = 'ACTIVE'
  );

INSERT INTO "permissions"
  ("id", "code", "name", "module", "action", "createdAt", "updatedAt")
VALUES
  (
    'perm_inventory_review',
    'inventory.review',
    '审核库存冲销',
    'INVENTORY',
    'REVIEW',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 关键审批角色使用受控的最小权限模板，纠正历史“全选权限”造成的越权。
DELETE FROM "role_permissions"
WHERE "roleId" IN (
  SELECT "id"
  FROM "roles"
  WHERE "code" IN (
    'APPROVER',
    'MANAGER',
    'BUSINESS_MANAGER',
    'RISK_MANAGER',
    'BUSINESS_OWNER',
    'GENERAL_MANAGER',
    'USER'
  )
);

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON (
  role."code" IN ('BUSINESS_MANAGER', 'RISK_MANAGER', 'BUSINESS_OWNER')
  AND permission."code" IN (
    'contract.view',
    'contract.approve',
    'execution.view',
    'logistics.view',
    'quality.view',
    'inventory.view',
    'settlement.view'
  )
) OR (
  role."code" = 'BUSINESS_OWNER'
  AND permission."code" = 'inventory.review'
) OR (
  role."code" = 'GENERAL_MANAGER'
  AND permission."code" IN (
    'contract.view',
    'contract.approve',
    'execution.view',
    'logistics.view',
    'quality.view',
    'inventory.view',
    'inventory.review',
    'settlement.view',
    'production.view',
    'master_data.view'
  )
) OR (
  role."code" = 'USER'
  AND permission."code" IN (
    'contract.view',
    'execution.view',
    'logistics.view',
    'quality.view',
    'inventory.view',
    'settlement.view',
    'production.view'
  )
)
WHERE role."code" IN (
  'BUSINESS_MANAGER',
  'RISK_MANAGER',
  'BUSINESS_OWNER',
  'GENERAL_MANAGER',
  'USER'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 系统管理员固定拥有新增加的专项权限。
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'ADMIN'
  AND permission."code" = 'inventory.review'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 所有新提交合同统一采用四级审批。存量审批任务继续使用原审批快照。
DELETE FROM "approval_flow_nodes"
WHERE "flowId" IN (
  SELECT "id"
  FROM "approval_flows"
  WHERE "contractType" IN ('PURCHASE', 'SALES', 'BILATERAL')
);

UPDATE "approval_flows"
SET
  "name" = CASE "contractType"
    WHEN 'PURCHASE' THEN '采购合同四级审批流'
    WHEN 'SALES' THEN '销售合同四级审批流'
    ELSE '双边合同四级审批流'
  END,
  "amountThreshold" = NULL,
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "contractType" IN ('PURCHASE', 'SALES', 'BILATERAL');

INSERT INTO "approval_flow_nodes"
  ("id", "flowId", "nodeName", "step", "roleId", "approvalMode", "scopeType", "condition", "enabled", "createdAt", "updatedAt")
SELECT
  'afn_' || md5(flow."id" || node."step"::text || node."roleCode"),
  flow."id",
  node."nodeName",
  node."step",
  role."id",
  'ANY',
  node."scopeType",
  'ALWAYS',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "approval_flows" flow
CROSS JOIN (
  VALUES
    (1, '运营经理', 'BUSINESS_MANAGER', 'BUSINESS_UNIT'),
    (2, '风控/财务经理', 'RISK_MANAGER', 'ALL'),
    (3, '业务责任人', 'BUSINESS_OWNER', 'BUSINESS_UNIT'),
    (4, '总经理', 'GENERAL_MANAGER', 'ALL')
) AS node("step", "nodeName", "roleCode", "scopeType")
JOIN "roles" role ON role."code" = node."roleCode"
WHERE flow."contractType" IN ('PURCHASE', 'SALES', 'BILATERAL');
