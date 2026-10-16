ALTER TABLE "contract_line_items"
  ADD COLUMN "qualityRulesSnapshot" JSONB;

ALTER TABLE "quality_tasks"
  ADD COLUMN "contractQualitySnapshot" JSONB,
  ADD COLUMN "contractQualityEvaluation" JSONB,
  ADD COLUMN "qualityDisposition" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "qualityDeductionPerTon" DECIMAL(15,4),
  ADD COLUMN "qualityDispositionReason" TEXT;

UPDATE "quality_tasks"
SET "qualityDisposition" = CASE
  WHEN "finalConclusion" = 'PASS' THEN 'LEGACY'
  ELSE 'REVIEW_REQUIRED'
END
WHERE "status" = 'COMPLETED';

CREATE INDEX "quality_tasks_qualityDisposition_idx"
  ON "quality_tasks"("qualityDisposition");

ALTER TABLE "inbound_receipts"
  ADD COLUMN "contractQualityDeductionPerTon" DECIMAL(15,4),
  ADD COLUMN "contractQualityEvaluation" JSONB;
