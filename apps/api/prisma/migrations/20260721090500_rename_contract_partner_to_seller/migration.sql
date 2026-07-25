ALTER TABLE "contracts"
RENAME COLUMN "partnerId" TO "sellerId";

ALTER INDEX "contracts_partnerId_idx"
RENAME TO "contracts_sellerId_idx";

ALTER TABLE "contracts"
RENAME CONSTRAINT "contracts_partnerId_fkey" TO "contracts_sellerId_fkey";
