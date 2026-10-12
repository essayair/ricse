-- 物流结算的货主方改为合同中的内部签约合作伙伴。
-- payerCompanyId 保留为可空兼容字段，以便历史物流合同继续按组织企业匹配专属运价。
ALTER TABLE "logistics_settlements"
  DROP CONSTRAINT "logistics_settlements_payerCompanyId_fkey";

ALTER TABLE "logistics_settlements"
  ALTER COLUMN "payerCompanyId" DROP NOT NULL,
  ADD COLUMN "payerPartnerId" TEXT;

UPDATE "logistics_settlements" AS settlement
SET "payerPartnerId" = company."partnerId"
FROM "companies" AS company
WHERE settlement."payerCompanyId" = company."id"
  AND company."partnerId" IS NOT NULL;

CREATE INDEX "logistics_settlements_payerPartnerId_idx"
  ON "logistics_settlements"("payerPartnerId");

ALTER TABLE "logistics_settlements"
  ADD CONSTRAINT "logistics_settlements_payerCompanyId_fkey"
  FOREIGN KEY ("payerCompanyId") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "logistics_settlements_payerPartnerId_fkey"
  FOREIGN KEY ("payerPartnerId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
