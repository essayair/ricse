-- CreateTable
CREATE TABLE "service_organizations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "organizationType" TEXT NOT NULL,
    "licenseNo" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "qualificationNo" TEXT,
    "cmaNo" TEXT,
    "cnasNo" TEXT,
    "serviceScope" TEXT,
    "serviceRegions" TEXT,
    "transportModes" TEXT[],
    "cargoTypes" TEXT,
    "supportedMaterials" TEXT,
    "supportedItems" TEXT,
    "operationType" TEXT,
    "storageCapacity" DECIMAL(15,3),
    "dispatcherName" TEXT,
    "dispatcherPhone" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "settlementMethod" TEXT,
    "reportCycleDays" INTEGER,
    "insuranceInfo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_organizations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN "carrierPartnerId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "institutionPartnerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "service_organizations_code_key" ON "service_organizations"("code");
CREATE UNIQUE INDEX "service_organizations_partnerId_organizationType_key" ON "service_organizations"("partnerId", "organizationType");
CREATE INDEX "service_organizations_organizationType_status_idx" ON "service_organizations"("organizationType", "status");
CREATE INDEX "service_organizations_partnerId_idx" ON "service_organizations"("partnerId");
CREATE INDEX "waybills_carrierPartnerId_idx" ON "waybills"("carrierPartnerId");
CREATE INDEX "quality_inspections_institutionPartnerId_idx" ON "quality_inspections"("institutionPartnerId");

-- AddForeignKey
ALTER TABLE "service_organizations" ADD CONSTRAINT "service_organizations_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waybills" ADD CONSTRAINT "waybills_carrierPartnerId_fkey"
FOREIGN KEY ("carrierPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_institutionPartnerId_fkey"
FOREIGN KEY ("institutionPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
