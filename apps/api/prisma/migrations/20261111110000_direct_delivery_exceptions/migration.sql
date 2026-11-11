ALTER TABLE "waybills" ADD COLUMN "directOutcome" TEXT, ADD COLUMN "replacementWaybillId" TEXT;
CREATE UNIQUE INDEX "waybills_replacementWaybillId_key" ON "waybills"("replacementWaybillId");
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_replacementWaybillId_fkey" FOREIGN KEY ("replacementWaybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
