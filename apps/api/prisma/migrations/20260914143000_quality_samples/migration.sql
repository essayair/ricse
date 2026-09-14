CREATE TABLE "quality_samples" (
  "id" TEXT NOT NULL,
  "qualityTaskId" TEXT NOT NULL,
  "sampleNo" TEXT NOT NULL,
  "sampleLabel" TEXT,
  "sampledAt" TIMESTAMP(3) NOT NULL,
  "samplerName" TEXT NOT NULL,
  "samplingMethod" TEXT,
  "sealNo" TEXT,
  "destinationInstitutionName" TEXT,
  "sentAt" TIMESTAMP(3),
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SAMPLED',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "quality_samples_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quality_inspections" ADD COLUMN "qualitySampleId" TEXT;
ALTER TABLE "attachments" ADD COLUMN "qualitySampleId" TEXT;

CREATE UNIQUE INDEX "quality_samples_qualityTaskId_sampleNo_key" ON "quality_samples"("qualityTaskId", "sampleNo");
CREATE INDEX "quality_samples_qualityTaskId_status_idx" ON "quality_samples"("qualityTaskId", "status");
CREATE INDEX "quality_samples_createdBy_idx" ON "quality_samples"("createdBy");
CREATE INDEX "quality_inspections_qualitySampleId_idx" ON "quality_inspections"("qualitySampleId");
CREATE INDEX "attachments_qualitySampleId_idx" ON "attachments"("qualitySampleId");

ALTER TABLE "quality_samples" ADD CONSTRAINT "quality_samples_qualityTaskId_fkey"
  FOREIGN KEY ("qualityTaskId") REFERENCES "quality_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_samples" ADD CONSTRAINT "quality_samples_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_qualitySampleId_fkey"
  FOREIGN KEY ("qualitySampleId") REFERENCES "quality_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_qualitySampleId_fkey"
  FOREIGN KEY ("qualitySampleId") REFERENCES "quality_samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;
