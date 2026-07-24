ALTER TABLE "quality_inspections"
  ADD COLUMN "institutionType" TEXT NOT NULL DEFAULT 'OUR',
  ADD COLUMN "institutionName" TEXT,
  ADD COLUMN "reportNo" TEXT,
  ADD COLUMN "testedAt" TIMESTAMP(3);

UPDATE "quality_inspections"
SET
  "institutionName" = COALESCE(NULLIF("ownLabName", ''), '我方化验机构'),
  "reportNo" = COALESCE(NULLIF("ownReportNo", ''), "inspectionNo"),
  "testedAt" = COALESCE("ownTestedAt", "sampledAt");

ALTER TABLE "quality_inspections"
  ALTER COLUMN "institutionName" SET NOT NULL,
  ALTER COLUMN "reportNo" SET NOT NULL,
  ALTER COLUMN "testedAt" SET NOT NULL,
  DROP COLUMN "ownReportNo",
  DROP COLUMN "ownLabName",
  DROP COLUMN "ownTestedAt",
  DROP COLUMN "partnerReportNo",
  DROP COLUMN "partnerTesterName",
  DROP COLUMN "partnerTestedAt",
  DROP COLUMN "thirdReportNo",
  DROP COLUMN "thirdOrgName",
  DROP COLUMN "thirdTestedAt",
  DROP COLUMN "deviationWarning";

ALTER TABLE "quality_inspection_indicators" ADD COLUMN "measuredValue" DECIMAL(15,4);
UPDATE "quality_inspection_indicators" SET "measuredValue" = "ownValue";
ALTER TABLE "quality_inspection_indicators"
  DROP COLUMN "ownValue",
  DROP COLUMN "partnerValue",
  DROP COLUMN "thirdValue",
  DROP COLUMN "deviationThreshold";

CREATE INDEX "quality_inspections_institutionType_idx" ON "quality_inspections"("institutionType");
CREATE INDEX "quality_inspections_reportNo_idx" ON "quality_inspections"("reportNo");
CREATE INDEX "quality_inspections_testedAt_idx" ON "quality_inspections"("testedAt");
