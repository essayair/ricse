-- 审批节点由固定用户升级为角色，并在合同提交时生成角色成员审批快照。

INSERT INTO "roles"
  ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt")
VALUES
  (
    'role_business_manager',
    'BUSINESS_MANAGER',
    '业务主管',
    '负责合同业务合理性审批',
    'MANAGEMENT',
    'ACTIVE',
    true,
    30,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_risk_manager',
    'RISK_MANAGER',
    '风控经理',
    '负责合同风险与合规审批',
    'MANAGEMENT',
    'ACTIVE',
    true,
    40,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_general_manager',
    'GENERAL_MANAGER',
    '总经理',
    '负责合同最终经营决策审批',
    'MANAGEMENT',
    'ACTIVE',
    true,
    50,
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

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('contract.view', 'contract.approve')
WHERE r."code" IN ('BUSINESS_MANAGER', 'RISK_MANAGER', 'GENERAL_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

ALTER TABLE "approval_flow_nodes"
  ADD COLUMN "roleId" TEXT,
  ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "scopeType" TEXT NOT NULL DEFAULT 'COMPANY';

UPDATE "approval_flow_nodes" n
SET
  "roleId" = CASE
    WHEN n."nodeName" = '业务主管' THEN (SELECT "id" FROM "roles" WHERE "code" = 'BUSINESS_MANAGER')
    WHEN n."nodeName" = '风控经理' THEN (SELECT "id" FROM "roles" WHERE "code" = 'RISK_MANAGER')
    WHEN n."nodeName" = '总经理' THEN (SELECT "id" FROM "roles" WHERE "code" = 'GENERAL_MANAGER')
    ELSE (SELECT "id" FROM "roles" WHERE "code" = 'APPROVER')
  END,
  "scopeType" = CASE
    WHEN n."nodeName" = '业务主管' THEN 'DEPARTMENT'
    ELSE 'COMPANY'
  END;

-- 把旧节点指定用户加入对应新角色，保证迁移后已有流程仍有审批人。
INSERT INTO "user_role_assignments"
  ("id", "userId", "roleId", "scopeType", "status", "effectiveAt", "createdAt", "updatedAt")
SELECT
  'ura_approval_' || md5(n."assigneeId" || n."roleId"),
  n."assigneeId",
  n."roleId",
  'ALL',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "approval_flow_nodes" n
WHERE n."assigneeId" IS NOT NULL
  AND n."roleId" IS NOT NULL
ON CONFLICT ("userId", "roleId") DO NOTHING;

ALTER TABLE "approval_flow_nodes" ALTER COLUMN "roleId" SET NOT NULL;

DROP INDEX IF EXISTS "approval_flow_nodes_assigneeId_idx";
ALTER TABLE "approval_flow_nodes" DROP CONSTRAINT IF EXISTS "approval_flow_nodes_assigneeId_fkey";
ALTER TABLE "approval_flow_nodes" DROP COLUMN "assigneeId";

CREATE INDEX "approval_flow_nodes_roleId_idx" ON "approval_flow_nodes"("roleId");
ALTER TABLE "approval_flow_nodes"
  ADD CONSTRAINT "approval_flow_nodes_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approvals"
  ADD COLUMN "roleCode" TEXT,
  ADD COLUMN "roleName" TEXT,
  ADD COLUMN "approvalMode" TEXT NOT NULL DEFAULT 'ALL';
