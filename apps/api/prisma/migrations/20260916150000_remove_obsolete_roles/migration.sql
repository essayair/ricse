-- 测试阶段不保留已废弃的泛化角色。
-- 正式系统只使用明确岗位角色和专项权限，不再存在 MANAGER / APPROVER。

-- 仅拥有废弃角色的测试账号回落为“基础查看”，避免迁移后出现无有效角色账号。
INSERT INTO "user_role_assignments"
  ("id", "userId", "roleId", "scopeType", "status", "effectiveAt", "createdAt", "updatedAt")
SELECT
  'ura_cleanup_' || md5(account."id" || base_role."id"),
  account."id",
  base_role."id",
  CASE
    WHEN account."companyId" IS NULL THEN 'ALL'
    WHEN company."type" = 'EXTERNAL' THEN 'COMPANY'
    WHEN EXISTS (
      SELECT 1
      FROM "user_business_units" membership
      WHERE membership."userId" = account."id"
        AND membership."status" = 'ACTIVE'
    ) THEN 'BUSINESS_UNIT'
    ELSE 'COMPANY'
  END,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" account
CROSS JOIN "roles" base_role
LEFT JOIN "companies" company ON company."id" = account."companyId"
WHERE account."role" IN ('MANAGER', 'APPROVER')
  AND base_role."code" = 'USER'
  AND NOT EXISTS (
    SELECT 1
    FROM "user_role_assignments" assignment
    JOIN "roles" assigned_role ON assigned_role."id" = assignment."roleId"
    WHERE assignment."userId" = account."id"
      AND assignment."status" = 'ACTIVE'
      AND assigned_role."status" = 'ACTIVE'
      AND assigned_role."code" NOT IN ('MANAGER', 'APPROVER')
  )
ON CONFLICT ("userId", "roleId") DO UPDATE SET
  "status" = 'ACTIVE',
  "expiresAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

-- 为回落到业务单元范围的账号补充默认业务单元范围。
INSERT INTO "user_role_scopes"
  ("id", "assignmentId", "targetType", "targetId", "createdAt")
SELECT
  'urs_cleanup_' || md5(assignment."id" || membership."businessUnitId"),
  assignment."id",
  'BUSINESS_UNIT',
  membership."businessUnitId",
  CURRENT_TIMESTAMP
FROM "users" account
JOIN "roles" base_role ON base_role."code" = 'USER'
JOIN "user_role_assignments" assignment
  ON assignment."userId" = account."id"
 AND assignment."roleId" = base_role."id"
 AND assignment."status" = 'ACTIVE'
JOIN LATERAL (
  SELECT user_unit."businessUnitId"
  FROM "user_business_units" user_unit
  WHERE user_unit."userId" = account."id"
    AND user_unit."status" = 'ACTIVE'
  ORDER BY user_unit."isDefault" DESC, user_unit."createdAt" ASC
  LIMIT 1
) membership ON true
WHERE account."role" IN ('MANAGER', 'APPROVER')
  AND assignment."scopeType" = 'BUSINESS_UNIT'
ON CONFLICT ("assignmentId", "targetType", "targetId") DO NOTHING;

-- 兼容主角色字段改为当前仍有效的明确角色；没有其他岗位时使用基础查看。
UPDATE "users" account
SET
  "role" = COALESCE(
    (
      SELECT assigned_role."code"
      FROM "user_role_assignments" assignment
      JOIN "roles" assigned_role ON assigned_role."id" = assignment."roleId"
      WHERE assignment."userId" = account."id"
        AND assignment."status" = 'ACTIVE'
        AND assigned_role."status" = 'ACTIVE'
        AND assigned_role."code" NOT IN ('MANAGER', 'APPROVER')
      ORDER BY CASE WHEN assigned_role."code" = 'ADMIN' THEN 0 ELSE 1 END, assigned_role."sort", assignment."createdAt"
      LIMIT 1
    ),
    'USER'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE account."role" IN ('MANAGER', 'APPROVER');

-- 清除引用后物理删除废弃角色；历史审批单自身已保存角色名称和编码快照。
DELETE FROM "approval_flow_nodes"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "code" IN ('MANAGER', 'APPROVER'));

DELETE FROM "user_role_assignments"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "code" IN ('MANAGER', 'APPROVER'));

DELETE FROM "roles"
WHERE "code" IN ('MANAGER', 'APPROVER');
