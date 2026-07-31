ALTER TABLE "inbound_receipts"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "warehouseId" DROP NOT NULL,
  ALTER COLUMN "receivedAt" DROP NOT NULL,
  ALTER COLUMN "receiverName" DROP NOT NULL;

UPDATE "inbound_receipts"
SET "status" = 'PENDING'
WHERE "status" = 'DRAFT';
