ALTER TABLE "inbound_receipts"
  ADD COLUMN "legacyReceivedQuantity" DECIMAL(15,3),
  ADD COLUMN "quantitySource" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN "quantityReconciledAt" TIMESTAMP(3);

ALTER TABLE "business_inbounds" ADD COLUMN "legacyQuantity" DECIMAL(15,3);

ALTER TABLE "inventory_lots"
  ADD COLUMN "legacyInitialQuantity" DECIMAL(15,3),
  ADD COLUMN "legacyAvailableQuantity" DECIMAL(15,3),
  ADD COLUMN "quantityReconciledAt" TIMESTAMP(3);

ALTER TABLE "inventory_ledgers"
  ADD COLUMN "legacyQuantityChange" DECIMAL(15,3),
  ADD COLUMN "legacyBalanceAfter" DECIMAL(15,3);

-- 保留历史原值；证据核对由单独的幂等脚本完成，不在 DDL 迁移中盲改已过账业务。
UPDATE "inbound_receipts"
SET "legacyReceivedQuantity" = "receivedQuantity", "quantitySource" = 'LEGACY_UNVERIFIED'
WHERE "status" IN ('PENDING', 'RECEIVED', 'POSTED') AND "deletedAt" IS NULL;

UPDATE "business_inbounds" SET "legacyQuantity" = "quantity";

UPDATE "inventory_lots"
SET "legacyInitialQuantity" = "initialQuantity", "legacyAvailableQuantity" = "availableQuantity"
WHERE "quantitySource" = 'LEGACY_UNVERIFIED';

UPDATE "inventory_ledgers" ledger
SET "legacyQuantityChange" = ledger."quantityChange", "legacyBalanceAfter" = ledger."balanceAfter"
FROM "inventory_lots" lot
WHERE ledger."lotId" = lot."id" AND lot."quantitySource" = 'LEGACY_UNVERIFIED';
