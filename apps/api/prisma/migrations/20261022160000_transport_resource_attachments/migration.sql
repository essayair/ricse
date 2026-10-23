ALTER TABLE "attachments" ADD COLUMN "driverId" TEXT, ADD COLUMN "vehicleId" TEXT;
CREATE INDEX "attachments_driverId_idx" ON "attachments"("driverId");
CREATE INDEX "attachments_vehicleId_idx" ON "attachments"("vehicleId");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
