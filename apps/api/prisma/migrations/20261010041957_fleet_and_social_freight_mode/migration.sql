-- DropForeignKey
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_serviceOrganizationId_fkey";

-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "serviceOrganizationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "fleets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "carrierPartnerId" TEXT,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_fleets" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_fleets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_fleets" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_fleets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fleets_carrierPartnerId_idx" ON "fleets"("carrierPartnerId");

-- CreateIndex
CREATE INDEX "fleets_status_idx" ON "fleets"("status");

-- CreateIndex
CREATE INDEX "driver_fleets_fleetId_idx" ON "driver_fleets"("fleetId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_fleets_driverId_fleetId_key" ON "driver_fleets"("driverId", "fleetId");

-- CreateIndex
CREATE INDEX "vehicle_fleets_fleetId_idx" ON "vehicle_fleets"("fleetId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_fleets_vehicleId_fleetId_key" ON "vehicle_fleets"("vehicleId", "fleetId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_serviceOrganizationId_fkey" FOREIGN KEY ("serviceOrganizationId") REFERENCES "service_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_carrierPartnerId_fkey" FOREIGN KEY ("carrierPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fleets" ADD CONSTRAINT "driver_fleets_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fleets" ADD CONSTRAINT "driver_fleets_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fleets" ADD CONSTRAINT "vehicle_fleets_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fleets" ADD CONSTRAINT "vehicle_fleets_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
