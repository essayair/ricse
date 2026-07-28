CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'BUSINESS',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE "user_role_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL DEFAULT 'ALL',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "assignedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_role_scopes" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_role_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_module_idx" ON "permissions"("module");
CREATE UNIQUE INDEX "user_role_assignments_userId_roleId_key" ON "user_role_assignments"("userId", "roleId");
CREATE INDEX "user_role_assignments_roleId_idx" ON "user_role_assignments"("roleId");
CREATE UNIQUE INDEX "user_role_scopes_assignmentId_targetType_targetId_key"
  ON "user_role_scopes"("assignmentId", "targetType", "targetId");
CREATE INDEX "user_role_scopes_targetType_targetId_idx" ON "user_role_scopes"("targetType", "targetId");

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_role_scopes"
  ADD CONSTRAINT "user_role_scopes_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "user_role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "code", "name", "description", "type", "isSystem", "sort", "updatedAt") VALUES
  ('role_admin', 'ADMIN', '系统管理员', '平台系统管理与全部业务权限', 'SYSTEM', true, 10, CURRENT_TIMESTAMP),
  ('role_approver', 'APPROVER', '审批人', '处理分配到本人的业务审批任务', 'MANAGEMENT', true, 20, CURRENT_TIMESTAMP),
  ('role_manager', 'MANAGER', '管理人员', '业务管理与经营过程操作', 'MANAGEMENT', true, 30, CURRENT_TIMESTAMP),
  ('role_salesperson', 'SALESPERSON', '采销业务员', '合同及采销执行业务操作', 'BUSINESS', true, 40, CURRENT_TIMESTAMP),
  ('role_user', 'USER', '普通用户', '基础业务操作权限', 'BUSINESS', true, 50, CURRENT_TIMESTAMP);

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "updatedAt") VALUES
  ('perm_contract_view', 'contract.view', '查看合同', 'CONTRACT', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_contract_create', 'contract.create', '新建合同', 'CONTRACT', 'CREATE', CURRENT_TIMESTAMP),
  ('perm_contract_edit', 'contract.edit', '修改合同', 'CONTRACT', 'EDIT', CURRENT_TIMESTAMP),
  ('perm_contract_submit', 'contract.submit', '提交合同审批', 'CONTRACT', 'SUBMIT', CURRENT_TIMESTAMP),
  ('perm_contract_approve', 'contract.approve', '审批合同', 'CONTRACT', 'APPROVE', CURRENT_TIMESTAMP),
  ('perm_contract_void', 'contract.void', '作废合同', 'CONTRACT', 'VOID', CURRENT_TIMESTAMP),
  ('perm_contract_delete', 'contract.delete', '删除已作废合同', 'CONTRACT', 'DELETE', CURRENT_TIMESTAMP),
  ('perm_execution_view', 'execution.view', '查看执行批次', 'EXECUTION', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_execution_manage', 'execution.manage', '管理执行批次', 'EXECUTION', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_logistics_view', 'logistics.view', '查看物流数据', 'LOGISTICS', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_logistics_manage', 'logistics.manage', '管理物流数据', 'LOGISTICS', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_quality_view', 'quality.view', '查看质检磅单', 'QUALITY', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_quality_manage', 'quality.manage', '管理质检磅单', 'QUALITY', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_inventory_view', 'inventory.view', '查看库存', 'INVENTORY', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_inventory_manage', 'inventory.manage', '管理库存', 'INVENTORY', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_settlement_view', 'settlement.view', '查看结算', 'SETTLEMENT', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_settlement_manage', 'settlement.manage', '管理结算', 'SETTLEMENT', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_master_view', 'master_data.view', '查看主数据', 'MASTER_DATA', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_master_manage', 'master_data.manage', '管理主数据', 'MASTER_DATA', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_org_view', 'organization.view', '查看组织数据', 'ORGANIZATION', 'VIEW', CURRENT_TIMESTAMP),
  ('perm_org_manage', 'organization.manage', '管理组织数据', 'ORGANIZATION', 'MANAGE', CURRENT_TIMESTAMP),
  ('perm_user_manage', 'system.user.manage', '管理用户授权', 'SYSTEM', 'USER_MANAGE', CURRENT_TIMESTAMP),
  ('perm_role_manage', 'system.role.manage', '管理角色权限', 'SYSTEM', 'ROLE_MANAGE', CURRENT_TIMESTAMP),
  ('perm_approval_manage', 'system.approval.manage', '配置审批流程', 'SYSTEM', 'APPROVAL_MANAGE', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "permissions";

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role_approver', "id" FROM "permissions"
WHERE "code" IN ('contract.view', 'contract.approve', 'execution.view', 'logistics.view', 'quality.view', 'inventory.view', 'settlement.view');

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role_manager', "id" FROM "permissions"
WHERE "module" <> 'SYSTEM' AND "code" <> 'contract.delete';

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role_salesperson', "id" FROM "permissions"
WHERE "code" IN (
  'contract.view', 'contract.create', 'contract.edit', 'contract.submit', 'contract.void',
  'execution.view', 'execution.manage', 'logistics.view', 'quality.view',
  'inventory.view', 'settlement.view', 'master_data.view', 'organization.view'
);

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role_user', "id" FROM "permissions"
WHERE "code" IN (
  'contract.view', 'contract.create', 'contract.edit', 'contract.submit', 'contract.void',
  'execution.view', 'logistics.view', 'quality.view', 'inventory.view',
  'settlement.view', 'master_data.view', 'organization.view'
);

INSERT INTO "user_role_assignments"
  ("id", "userId", "roleId", "scopeType", "status", "effectiveAt", "createdAt", "updatedAt")
SELECT
  'ura_' || md5(u."id" || COALESCE(r."id", 'role_user')),
  u."id",
  COALESCE(r."id", 'role_user'),
  CASE WHEN c."type" = 'EXTERNAL' THEN 'COMPANY' ELSE 'ALL' END,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "roles" r ON r."code" = u."role"
LEFT JOIN "companies" c ON c."id" = u."companyId";

INSERT INTO "user_role_scopes"
  ("id", "assignmentId", "targetType", "targetId", "createdAt")
SELECT
  'urs_' || md5(a."id" || u."companyId"),
  a."id",
  'COMPANY',
  u."companyId",
  CURRENT_TIMESTAMP
FROM "user_role_assignments" a
JOIN "users" u ON u."id" = a."userId"
JOIN "companies" c ON c."id" = u."companyId"
WHERE c."type" = 'EXTERNAL';
