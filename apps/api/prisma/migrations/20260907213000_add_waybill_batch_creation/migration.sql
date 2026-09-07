ALTER TABLE "waybills"
ADD COLUMN "creationBatchId" TEXT,
ADD COLUMN "creationRowId" TEXT;

CREATE INDEX "waybills_creationBatchId_idx" ON "waybills"("creationBatchId");

CREATE UNIQUE INDEX "waybills_creationBatchId_creationRowId_key"
ON "waybills"("creationBatchId", "creationRowId");
