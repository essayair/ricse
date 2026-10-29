-- Old task-bound reports did not persist materialId. Preserve their original
-- waybill material so a shared report cannot later be linked to another SKU.
UPDATE "quality_inspections" qi
SET "materialId" = (
  SELECT li."materialId"
  FROM "weigh_tickets" wt
  JOIN "waybill_line_items" li ON li."waybillId" = wt."waybillId"
  WHERE wt."id" = qi."weighTicketId"
  ORDER BY li."createdAt" ASC, li."id" ASC
  LIMIT 1
)
WHERE qi."materialId" IS NULL AND qi."weighTicketId" IS NOT NULL;
