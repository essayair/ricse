ALTER TABLE "contracts"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "contracts_createdBy_clientRequestId_key"
ON "contracts"("createdBy", "clientRequestId");
