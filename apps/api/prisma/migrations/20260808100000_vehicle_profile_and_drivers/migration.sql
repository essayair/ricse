-- AlterTable
ALTER TABLE "vehicles"
ADD COLUMN "tareWeight" DECIMAL(10,2),
ADD COLUMN "plateColor" TEXT,
ADD COLUMN "licenseNo" TEXT,
ADD COLUMN "annualInspectionExpiry" TIMESTAMP(3),
ADD COLUMN "compulsoryInsuranceExpiry" TIMESTAMP(3),
ADD COLUMN "commercialInsuranceExpiry" TIMESTAMP(3),
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "ownerPhone" TEXT,
ADD COLUMN "deviceType" TEXT,
ADD COLUMN "deviceNo" TEXT,
ADD COLUMN "deviceInstalledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vehicle_drivers" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SECONDARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_drivers_vehicleId_driverId_key" ON "vehicle_drivers"("vehicleId", "driverId");
CREATE INDEX "vehicle_drivers_driverId_idx" ON "vehicle_drivers"("driverId");

-- AddForeignKey
ALTER TABLE "vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_drivers" ADD CONSTRAINT "vehicle_drivers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
