-- 员工一旦开通后台账号，其档案承担身份和审计追溯职责，不允许物理删除。
-- 历史版本使用 ON DELETE SET NULL，会产生仍可登录但没有员工档案的孤立账号。
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_employeeId_fkey";

ALTER TABLE "users"
  ADD CONSTRAINT "users_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
