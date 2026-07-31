-- 员工手机号作为独立登录凭据，需要统一格式并保证唯一。
UPDATE "employees"
SET "phone" = NULLIF(regexp_replace(trim("phone"), '[[:space:]()-]', '', 'g'), '')
WHERE "phone" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "employees"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '员工手机号存在重复，请先清理后再执行迁移';
  END IF;
END $$;

CREATE UNIQUE INDEX "employees_phone_key" ON "employees"("phone");
