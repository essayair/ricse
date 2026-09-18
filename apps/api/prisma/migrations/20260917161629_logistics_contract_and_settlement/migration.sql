-- CreateTable
CREATE TABLE "logistics_contracts" (
    "id" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "carrierPartnerId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "settlementBasis" TEXT NOT NULL DEFAULT 'NET_WEIGHT',
    "signedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "logistics_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_contract_price_terms" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "originLocation" TEXT NOT NULL,
    "destinationLocation" TEXT NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_contract_price_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_settlements" (
    "id" TEXT NOT NULL,
    "settlementNo" TEXT NOT NULL,
    "payerCompanyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparedBy" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "totalGrossWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "totalNetWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "logistics_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "netWeight" DECIMAL(15,3) NOT NULL,
    "unitPrice" DECIMAL(15,2),
    "priceSource" TEXT NOT NULL,
    "contractPriceTermId" TEXT,
    "contractUnitPrice" DECIMAL(15,2),
    "overrideReason" TEXT,
    "amount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_contracts_contractNo_key" ON "logistics_contracts"("contractNo");

-- CreateIndex
CREATE INDEX "logistics_contracts_carrierPartnerId_idx" ON "logistics_contracts"("carrierPartnerId");

-- CreateIndex
CREATE INDEX "logistics_contracts_companyId_idx" ON "logistics_contracts"("companyId");

-- CreateIndex
CREATE INDEX "logistics_contracts_status_idx" ON "logistics_contracts"("status");

-- CreateIndex
CREATE INDEX "logistics_contract_price_terms_contractId_originLocation_de_idx" ON "logistics_contract_price_terms"("contractId", "originLocation", "destinationLocation");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_settlements_settlementNo_key" ON "logistics_settlements"("settlementNo");

-- CreateIndex
CREATE INDEX "logistics_settlements_payerCompanyId_idx" ON "logistics_settlements"("payerCompanyId");

-- CreateIndex
CREATE INDEX "logistics_settlements_status_idx" ON "logistics_settlements"("status");

-- CreateIndex
CREATE INDEX "logistics_settlement_lines_settlementId_idx" ON "logistics_settlement_lines"("settlementId");

-- CreateIndex
CREATE INDEX "logistics_settlement_lines_waybillId_idx" ON "logistics_settlement_lines"("waybillId");

-- CreateIndex
CREATE INDEX "logistics_settlement_lines_contractPriceTermId_idx" ON "logistics_settlement_lines"("contractPriceTermId");

-- AddForeignKey
ALTER TABLE "logistics_contracts" ADD CONSTRAINT "logistics_contracts_carrierPartnerId_fkey" FOREIGN KEY ("carrierPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_contracts" ADD CONSTRAINT "logistics_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_contracts" ADD CONSTRAINT "logistics_contracts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_contract_price_terms" ADD CONSTRAINT "logistics_contract_price_terms_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "logistics_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_contract_price_terms" ADD CONSTRAINT "logistics_contract_price_terms_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlements" ADD CONSTRAINT "logistics_settlements_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlements" ADD CONSTRAINT "logistics_settlements_preparedBy_fkey" FOREIGN KEY ("preparedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlements" ADD CONSTRAINT "logistics_settlements_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlements" ADD CONSTRAINT "logistics_settlements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlement_lines" ADD CONSTRAINT "logistics_settlement_lines_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "logistics_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlement_lines" ADD CONSTRAINT "logistics_settlement_lines_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_settlement_lines" ADD CONSTRAINT "logistics_settlement_lines_contractPriceTermId_fkey" FOREIGN KEY ("contractPriceTermId") REFERENCES "logistics_contract_price_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 物流合同与结算权限点及角色授权
INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "updatedAt") VALUES
  ('perm_logistics_contract_view', 'logistics.contract.view', '查看物流合同', 'LOGISTICS', 'CONTRACT_VIEW', '查看物流合同及运价条款', CURRENT_TIMESTAMP),
  ('perm_logistics_contract_manage', 'logistics.contract.manage', '管理物流合同', 'LOGISTICS', 'CONTRACT_MANAGE', '新建、编辑物流合同及运价条款', CURRENT_TIMESTAMP),
  ('perm_logistics_settlement_view', 'logistics.settlement.view', '查看物流结算单', 'LOGISTICS', 'SETTLEMENT_VIEW', '查看运费结算单及明细', CURRENT_TIMESTAMP),
  ('perm_logistics_settlement_manage', 'logistics.settlement.manage', '管理物流结算单', 'LOGISTICS', 'SETTLEMENT_MANAGE', '创建、复核、作废物流结算单', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON (
  (r."code" = 'ADMIN' AND p."code" IN (
    'logistics.contract.view', 'logistics.contract.manage',
    'logistics.settlement.view', 'logistics.settlement.manage'
  ))
  OR
  (r."code" = 'LOGISTICS_OPERATOR' AND p."code" IN (
    'logistics.contract.view', 'logistics.contract.manage',
    'logistics.settlement.view', 'logistics.settlement.manage'
  ))
  OR
  (r."code" = 'FINANCE_SPECIALIST' AND p."code" IN (
    'logistics.contract.view', 'logistics.settlement.view'
  ))
  OR
  (r."code" = 'RISK_MANAGER' AND p."code" IN (
    'logistics.contract.view', 'logistics.settlement.view'
  ))
)
WHERE r."code" IN ('ADMIN', 'LOGISTICS_OPERATOR', 'FINANCE_SPECIALIST', 'RISK_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
