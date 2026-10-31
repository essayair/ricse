ALTER TABLE "quality_inspections" ADD COLUMN "evidenceStage" TEXT NOT NULL DEFAULT 'UNSPECIFIED';
CREATE INDEX "quality_inspections_evidenceStage_idx" ON "quality_inspections"("evidenceStage");
