-- 合作伙伴多收发货地址，以及执行通知地址来源与快照
CREATE TABLE "partner_addresses" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "addressName" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "detailAddress" TEXT NOT NULL,
  "fullAddress" TEXT NOT NULL,
  "contactPerson" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partner_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "partner_addresses_partnerId_status_idx" ON "partner_addresses"("partnerId", "status");
CREATE INDEX "partner_addresses_partnerId_isDefault_idx" ON "partner_addresses"("partnerId", "isDefault");
ALTER TABLE "partner_addresses" ADD CONSTRAINT "partner_addresses_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispatch_notices"
  ADD COLUMN "originSourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "destinationSourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "originWarehouseId" TEXT,
  ADD COLUMN "destinationWarehouseId" TEXT,
  ADD COLUMN "originPartnerAddressId" TEXT,
  ADD COLUMN "destinationPartnerAddressId" TEXT,
  ADD COLUMN "originContactPerson" TEXT,
  ADD COLUMN "originContactPhone" TEXT,
  ADD COLUMN "destinationContactPerson" TEXT,
  ADD COLUMN "destinationContactPhone" TEXT;

-- 兼容既有单据：原 warehouseId 是库存操作仓库，采购对应目的仓、销售对应起运仓。
UPDATE "dispatch_notices"
SET "originWarehouseId" = "warehouseId", "originSourceType" = 'WAREHOUSE'
WHERE "type" = 'SALES' AND "warehouseId" IS NOT NULL;

UPDATE "dispatch_notices"
SET "destinationWarehouseId" = "warehouseId", "destinationSourceType" = 'WAREHOUSE'
WHERE "type" = 'PURCHASE' AND "warehouseId" IS NOT NULL;

CREATE INDEX "dispatch_notices_originWarehouseId_idx" ON "dispatch_notices"("originWarehouseId");
CREATE INDEX "dispatch_notices_destinationWarehouseId_idx" ON "dispatch_notices"("destinationWarehouseId");
CREATE INDEX "dispatch_notices_originPartnerAddressId_idx" ON "dispatch_notices"("originPartnerAddressId");
CREATE INDEX "dispatch_notices_destinationPartnerAddressId_idx" ON "dispatch_notices"("destinationPartnerAddressId");

ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_originWarehouseId_fkey" FOREIGN KEY ("originWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_originPartnerAddressId_fkey" FOREIGN KEY ("originPartnerAddressId") REFERENCES "partner_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_notices" ADD CONSTRAINT "dispatch_notices_destinationPartnerAddressId_fkey" FOREIGN KEY ("destinationPartnerAddressId") REFERENCES "partner_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
