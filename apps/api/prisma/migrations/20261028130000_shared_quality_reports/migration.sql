-- Preserve all existing inspection/task relationships while allowing standalone reports.
ALTER TABLE "quality_inspections" ALTER COLUMN "qualityTaskId" DROP NOT NULL;
ALTER TABLE "contract_line_items" ADD COLUMN "priceRulesSnapshot" JSONB;
ALTER TABLE "contract_line_items" ADD COLUMN "salesPriceRulesSnapshot" JSONB;
ALTER TABLE "quality_inspections" ALTER COLUMN "weighTicketId" DROP NOT NULL;
ALTER TABLE "quality_inspections" ADD COLUMN "contractId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "materialId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "samplingGroupNo" TEXT;

CREATE TABLE "quality_inspection_task_links" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "qualityTaskId" TEXT NOT NULL,
  "linkedBy" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlinkedBy" TEXT,
  "unlinkedAt" TIMESTAMP(3),
  CONSTRAINT "quality_inspection_task_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quality_inspection_task_links_inspectionId_qualityTaskId_key" ON "quality_inspection_task_links"("inspectionId", "qualityTaskId");
CREATE INDEX "quality_inspection_task_links_qualityTaskId_idx" ON "quality_inspection_task_links"("qualityTaskId");
CREATE INDEX "quality_inspections_contractId_supplierId_businessUnitId_idx" ON "quality_inspections"("contractId", "supplierId", "businessUnitId");
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_task_links" ADD CONSTRAINT "quality_inspection_task_links_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "quality_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_task_links" ADD CONSTRAINT "quality_inspection_task_links_qualityTaskId_fkey" FOREIGN KEY ("qualityTaskId") REFERENCES "quality_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy reports retain their original task and ticket. Backfill link rows and scope once.
INSERT INTO "quality_inspection_task_links" ("id", "inspectionId", "qualityTaskId", "linkedBy", "linkedAt")
SELECT 'legacy-' || qi."id", qi."id", qi."qualityTaskId", qi."createdBy", qi."createdAt"
FROM "quality_inspections" qi WHERE qi."qualityTaskId" IS NOT NULL;

UPDATE "quality_inspections" qi SET
  "contractId" = o."contractId",
  "supplierId" = CASE WHEN c."type" = 'SALES' THEN c."signingPartnerId" ELSE c."sellerId" END,
  "businessUnitId" = c."businessUnitId"
FROM "quality_tasks" qt
JOIN "waybills" w ON w."id" = qt."waybillId"
JOIN "dispatch_notices" dn ON dn."id" = w."dispatchNoticeId"
JOIN "orders" o ON o."id" = dn."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
WHERE qi."qualityTaskId" = qt."id";
