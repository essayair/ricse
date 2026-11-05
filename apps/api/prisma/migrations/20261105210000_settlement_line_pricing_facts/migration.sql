-- 结算行增加可查询的计价事实列；仅新增可空列与索引，不改写既有金额。
ALTER TABLE "financial_settlement_lines"
  ADD COLUMN "pricingMethod" TEXT,
  ADD COLUMN "pricingQuantityBasis" TEXT,
  ADD COLUMN "measuredGradePct" DECIMAL(7,4),
  ADD COLUMN "measuredMoisturePct" DECIMAL(7,4),
  ADD COLUMN "measuredRecoveryPct" DECIMAL(7,4),
  ADD COLUMN "gradeBandLower" DECIMAL(7,4),
  ADD COLUMN "gradeBandUpper" DECIMAL(7,4),
  ADD COLUMN "gradeRateExTax" DECIMAL(15,4),
  ADD COLUMN "recoveryDeductionPerTonExTax" DECIMAL(15,4),
  ADD COLUMN "taxRatePct" DECIMAL(5,2),
  ADD COLUMN "amountExTax" DECIMAL(15,2),
  ADD COLUMN "taxAmount" DECIMAL(15,2);

CREATE INDEX "financial_settlement_lines_pricingMethod_measuredGradePct_idx"
  ON "financial_settlement_lines"("pricingMethod", "measuredGradePct");

-- 回填：已有分档结算行的事实从来源快照读取（快照为生成时冻结的计算结果）。
UPDATE "financial_settlement_lines"
SET "pricingMethod" = 'GRADE_TIER',
    "pricingQuantityBasis" = COALESCE("sourceSnapshot"->>'pricingQuantityBasis', 'PHYSICAL'),
    "measuredGradePct" = NULLIF("sourceSnapshot"->'gradePrice'->>'gradePct', '')::DECIMAL,
    "measuredMoisturePct" = NULLIF("sourceSnapshot"->'gradePrice'->>'moisturePct', '')::DECIMAL,
    "gradeBandLower" = NULLIF("sourceSnapshot"->'gradePrice'->'band'->>'lower', '')::DECIMAL,
    "gradeBandUpper" = NULLIF("sourceSnapshot"->'gradePrice'->'band'->>'upper', '')::DECIMAL,
    "gradeRateExTax" = NULLIF("sourceSnapshot"->'gradePrice'->>'rate', '')::DECIMAL,
    "taxRatePct" = NULLIF("sourceSnapshot"->>'taxRatePct', '')::DECIMAL,
    "amountExTax" = NULLIF("sourceSnapshot"->>'amountExTax', '')::DECIMAL,
    "taxAmount" = NULLIF("sourceSnapshot"->>'taxAmount', '')::DECIMAL
WHERE "sourceSnapshot" IS NOT NULL
  AND "sourceSnapshot"->>'pricingType' = 'GRADE_TIER'
  AND jsonb_typeof("sourceSnapshot"->'gradePrice') = 'object';

UPDATE "financial_settlement_lines"
SET "pricingMethod" = 'FIXED',
    "pricingQuantityBasis" = "sourceSnapshot"->>'pricingQuantityBasis'
WHERE "pricingMethod" IS NULL
  AND "sourceSnapshot" IS NOT NULL
  AND "sourceSnapshot"->>'pricingType' = 'FIXED';
