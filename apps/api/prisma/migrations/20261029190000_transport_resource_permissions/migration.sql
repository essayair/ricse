-- 运力档案是物流业务资源，不再借用整套主数据维护权限。
INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  ('perm_transport_resource_view', 'transport_resource.view', '查看运力档案', 'LOGISTICS', 'RESOURCE_VIEW', '查看司机、车辆和车队档案', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_transport_resource_manage', 'transport_resource.manage', '维护运力档案', 'LOGISTICS', 'RESOURCE_MANAGE', '新增、修改司机车辆车队及其附件和成员', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 现有主数据岗位保留原有能力；内部物流运营岗位直接获得日常运力管理能力。
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('transport_resource.view', 'transport_resource.manage')
WHERE r."code" = 'LOGISTICS_OPERATOR'
   OR EXISTS (
     SELECT 1 FROM "role_permissions" rp
     JOIN "permissions" existing ON existing."id" = rp."permissionId"
     WHERE rp."roleId" = r."id"
       AND (existing."code" IN ('master_data.manage', 'logistics.manage')
         OR (p."code" = 'transport_resource.view' AND existing."code" IN ('master_data.view', 'logistics.view')))
   )
ON CONFLICT DO NOTHING;
