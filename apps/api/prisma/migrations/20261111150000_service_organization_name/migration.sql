ALTER TABLE "service_organizations" ADD COLUMN "name" TEXT;

-- 只补齐新增字段，不修改合作伙伴主体名称、关联ID或已有业务单据快照。
UPDATE "service_organizations" AS service
SET "name" = COALESCE(NULLIF(BTRIM(partner."name"), ''), service."code")
FROM "partners" AS partner
WHERE partner."id" = service."partnerId";

ALTER TABLE "service_organizations" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "service_organizations" ADD CONSTRAINT "service_organizations_name_not_blank"
CHECK (LENGTH(BTRIM("name")) > 0);
