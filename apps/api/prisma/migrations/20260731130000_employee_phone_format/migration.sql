-- 历史空值继续兼容；所有新增和修改的员工手机号必须为 11 位中国大陆手机号。
ALTER TABLE "employees"
ADD CONSTRAINT "employees_phone_format_check"
CHECK ("phone" IS NULL OR "phone" ~ '^1[3-9][0-9]{9}$')
NOT VALID;
