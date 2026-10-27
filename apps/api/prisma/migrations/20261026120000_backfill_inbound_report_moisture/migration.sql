-- 旧版按实物计价入库单未保存报告实测水分。仅补全已确认报告中唯一、有效的水分指标；不重算数量或改写原有非空快照。
WITH single_moisture AS (
  SELECT indicator."inspectionId", MAX(indicator."measuredValue") AS "measuredValue"
  FROM "quality_inspection_indicators" indicator
  JOIN "quality_inspections" report ON report.id = indicator."inspectionId"
  WHERE report.status = 'CONFIRMED'
    AND report."deletedAt" IS NULL
    AND (
      UPPER(TRIM(indicator.code)) IN ('MOISTURE', 'WATER', 'H2O')
      OR TRIM(indicator.code) = '水分'
      OR indicator.name LIKE '%水分%'
    )
  GROUP BY indicator."inspectionId"
  HAVING COUNT(*) = 1
    AND MIN(TRIM(indicator.unit)) IN ('%', '％')
    AND MIN(indicator."measuredValue") >= 0
    AND MAX(indicator."measuredValue") < 100
)
UPDATE "inbound_receipts" receipt
SET "measuredMoisturePct" = moisture."measuredValue"
FROM single_moisture moisture
WHERE receipt."qualityInspectionId" = moisture."inspectionId"
  AND receipt.status IN ('RECEIVED', 'POSTED')
  AND receipt."deletedAt" IS NULL
  AND receipt."measuredMoisturePct" IS NULL;
