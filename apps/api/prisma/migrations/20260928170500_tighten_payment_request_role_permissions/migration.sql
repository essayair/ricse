-- 付款申请职责分离：采销业务员或运营经理发起，指定管理角色审批，财务专员不兼任申请与审批。
DELETE FROM "role_permissions"
WHERE "roleId" IN (
  SELECT "id" FROM "roles" WHERE "code" = 'FINANCE_SPECIALIST'
)
AND "permissionId" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN ('settlement.payment.apply', 'settlement.payment.approve')
);
