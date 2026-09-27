-- 历史自定义角色若已经拥有 settlement.manage，则等价继承拆分后的全部资金操作权限。
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT legacy."roleId", permission."id"
FROM "role_permissions" legacy
JOIN "permissions" legacy_permission ON legacy_permission."id" = legacy."permissionId" AND legacy_permission."code" = 'settlement.manage'
CROSS JOIN "permissions" permission
WHERE permission."code" IN (
  'settlement.create', 'settlement.confirm', 'settlement.receipt.register', 'settlement.receipt.claim',
  'settlement.fund.confirm', 'settlement.payment.apply', 'settlement.payment.approve',
  'settlement.payment.execute', 'settlement.allocate', 'settlement.reverse'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
