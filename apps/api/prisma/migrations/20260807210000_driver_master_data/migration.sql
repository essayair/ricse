-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "serviceOrganizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "idCardNo" TEXT,
    "licenseNo" TEXT,
    "licenseClass" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN "driverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "drivers_serviceOrganizationId_phone_key" ON "drivers"("serviceOrganizationId", "phone");
CREATE INDEX "drivers_serviceOrganizationId_status_idx" ON "drivers"("serviceOrganizationId", "status");
CREATE INDEX "drivers_name_idx" ON "drivers"("name");
CREATE INDEX "drivers_phone_idx" ON "drivers"("phone");
CREATE INDEX "waybills_driverId_idx" ON "waybills"("driverId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_serviceOrganizationId_fkey" FOREIGN KEY ("serviceOrganizationId") REFERENCES "service_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
