-- 补齐系统各业务模块的标准岗位角色。
-- 角色只定义“可以做什么”，实际可操作的数据仍由用户角色授权上的数据范围决定。

INSERT INTO "roles"
  ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt")
VALUES
  (
    'role_logistics_operator',
    'LOGISTICS_OPERATOR',
    '物流运营',
    '负责物流运单创建、调度、在途跟踪、收货及物流附件维护',
    'BUSINESS',
    'ACTIVE',
    true,
    60,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_quality_operator',
    'QUALITY_OPERATOR',
    '地磅质检',
    '负责磅单、质检单、复核意见及相关附件维护',
    'BUSINESS',
    'ACTIVE',
    true,
    70,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_warehouse_keeper',
    'WAREHOUSE_KEEPER',
    '仓储库管',
    '负责出入库单、库存批次、库存台账及库存冲销业务',
    'BUSINESS',
    'ACTIVE',
    true,
    80,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_finance_specialist',
    'FINANCE_SPECIALIST',
    '财务结算',
    '负责应收、应付及业务结算管理',
    'BUSINESS',
    'ACTIVE',
    true,
    90,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_master_data_admin',
    'MASTER_DATA_ADMIN',
    '主数据管理员',
    '负责合作伙伴、服务生态、物料、仓库和车辆等主数据维护',
    'MANAGEMENT',
    'ACTIVE',
    true,
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'role_organization_admin',
    'ORGANIZATION_ADMIN',
    '组织管理员',
    '负责企业、部门、员工、业务组和用户账号维护',
    'MANAGEMENT',
    'ACTIVE',
    true,
    110,
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
JOIN "permissions" p ON (
  (r."code" = 'LOGISTICS_OPERATOR' AND p."code" IN (
    'contract.view',
    'execution.view',
    'logistics.view',
    'logistics.manage',
    'quality.view',
    'inventory.view',
    'master_data.view'
  ))
  OR
  (r."code" = 'QUALITY_OPERATOR' AND p."code" IN (
    'contract.view',
    'execution.view',
    'logistics.view',
    'quality.view',
    'quality.manage',
    'inventory.view',
    'master_data.view'
  ))
  OR
  (r."code" = 'WAREHOUSE_KEEPER' AND p."code" IN (
    'contract.view',
    'execution.view',
    'logistics.view',
    'quality.view',
    'inventory.view',
    'inventory.manage',
    'master_data.view'
  ))
  OR
  (r."code" = 'FINANCE_SPECIALIST' AND p."code" IN (
    'contract.view',
    'execution.view',
    'logistics.view',
    'quality.view',
    'inventory.view',
    'settlement.view',
    'settlement.manage',
    'master_data.view'
  ))
  OR
  (r."code" = 'MASTER_DATA_ADMIN' AND p."code" IN (
    'master_data.view',
    'master_data.manage',
    'organization.view'
  ))
  OR
  (r."code" = 'ORGANIZATION_ADMIN' AND p."code" IN (
    'organization.view',
    'organization.manage',
    'system.user.manage'
  ))
)
WHERE r."code" IN (
  'LOGISTICS_OPERATOR',
  'QUALITY_OPERATOR',
  'WAREHOUSE_KEEPER',
  'FINANCE_SPECIALIST',
  'MASTER_DATA_ADMIN',
  'ORGANIZATION_ADMIN'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
