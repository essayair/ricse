CREATE TABLE "quality_inspections" (
  "id" TEXT NOT NULL,
  "inspectionNo" TEXT NOT NULL,
  "weighTicketId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "conclusion" TEXT NOT NULL DEFAULT 'PENDING',
  "dataSource" TEXT NOT NULL DEFAULT 'MANUAL',
  "sampledAt" TIMESTAMP(3) NOT NULL,
  "samplerName" TEXT NOT NULL,
  "samplingMethod" TEXT,
  "sampleNo1" TEXT,
  "sampleNo2" TEXT,
  "sampleNo3" TEXT,
  "materialName" TEXT NOT NULL,
  "materialSpec" TEXT,
  "supplierName" TEXT,
  "plateNo" TEXT,
  "baseWeight" DECIMAL(15,3),
  "ownReportNo" TEXT,
  "ownLabName" TEXT,
  "ownTestedAt" TIMESTAMP(3),
  "partnerReportNo" TEXT,
  "partnerTesterName" TEXT,
  "partnerTestedAt" TIMESTAMP(3),
  "thirdReportNo" TEXT,
  "thirdOrgName" TEXT,
  "thirdTestedAt" TIMESTAMP(3),
  "moistureDeductionWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "impurityDeductionWeight" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "settlementWeight" DECIMAL(15,3),
  "deductionAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "deviationWarning" BOOLEAN NOT NULL DEFAULT false,
  "fuseReason" TEXT,
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspection_indicators" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "standardValue" DECIMAL(15,4),
  "upperValue" DECIMAL(15,4),
  "fuseValue" DECIMAL(15,4),
  "unit" TEXT NOT NULL DEFAULT '%',
  "ownValue" DECIMAL(15,4),
  "partnerValue" DECIMAL(15,4),
  "thirdValue" DECIMAL(15,4),
  "deviationThreshold" DECIMAL(10,4) NOT NULL DEFAULT 0.3,
  "result" TEXT NOT NULL DEFAULT 'PENDING',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_inspection_indicators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "qualityInspectionId" TEXT;

CREATE UNIQUE INDEX "quality_inspections_inspectionNo_key" ON "quality_inspections"("inspectionNo");
CREATE INDEX "quality_inspections_inspectionNo_idx" ON "quality_inspections"("inspectionNo");
CREATE INDEX "quality_inspections_weighTicketId_idx" ON "quality_inspections"("weighTicketId");
CREATE INDEX "quality_inspections_status_idx" ON "quality_inspections"("status");
CREATE INDEX "quality_inspections_conclusion_idx" ON "quality_inspections"("conclusion");
CREATE INDEX "quality_inspections_sampledAt_idx" ON "quality_inspections"("sampledAt");
CREATE UNIQUE INDEX "quality_inspection_indicators_inspectionId_code_key" ON "quality_inspection_indicators"("inspectionId", "code");
CREATE INDEX "quality_inspection_indicators_inspectionId_idx" ON "quality_inspection_indicators"("inspectionId");
CREATE INDEX IF NOT EXISTS "attachments_qualityInspectionId_idx" ON "attachments"("qualityInspectionId");

ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_weighTicketId_fkey"
  FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_confirmedBy_fkey"
  FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_indicators" ADD CONSTRAINT "quality_inspection_indicators_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_qualityInspectionId_fkey"
  FOREIGN KEY ("qualityInspectionId") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
