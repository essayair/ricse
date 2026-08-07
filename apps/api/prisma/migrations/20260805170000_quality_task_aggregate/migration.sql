-- 到货质检任务：一个物流运单一条任务，机构检测报告作为任务子记录。
CREATE TABLE "quality_tasks" (
    "id" TEXT NOT NULL,
    "taskNo" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SAMPLING',
    "plannedReportCount" INTEGER NOT NULL DEFAULT 3,
    "sampledAt" TIMESTAMP(3),
    "samplerName" TEXT,
    "samplingMethod" TEXT,
    "handlerId" TEXT,
    "handledAt" TIMESTAMP(3),
    "finalConclusion" TEXT NOT NULL DEFAULT 'PENDING',
    "basisInspectionId" TEXT,
    "finalizedReportIds" JSONB,
    "finalizedReportCount" INTEGER NOT NULL DEFAULT 0,
    "decisionReason" TEXT,
    "decisionVersion" INTEGER NOT NULL DEFAULT 0,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "quality_tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quality_inspections" ADD COLUMN "qualityTaskId" TEXT;
ALTER TABLE "quality_inspections" ADD COLUMN "sampleNo" TEXT;

CREATE UNIQUE INDEX "quality_tasks_taskNo_key" ON "quality_tasks"("taskNo");
CREATE UNIQUE INDEX "quality_tasks_waybillId_key" ON "quality_tasks"("waybillId");
CREATE INDEX "quality_tasks_status_idx" ON "quality_tasks"("status");
CREATE INDEX "quality_tasks_finalConclusion_idx" ON "quality_tasks"("finalConclusion");
CREATE INDEX "quality_tasks_handlerId_idx" ON "quality_tasks"("handlerId");
CREATE INDEX "quality_tasks_decidedBy_idx" ON "quality_tasks"("decidedBy");
CREATE INDEX "quality_inspections_qualityTaskId_idx" ON "quality_inspections"("qualityTaskId");

-- 为所有已到达运单及已有机构报告的运单回填聚合任务。
WITH candidate_waybills AS (
  SELECT w."id", w."createdBy", w."arrivedAt", w."createdAt"
  FROM "waybills" w
  WHERE w."deletedAt" IS NULL
    AND (
      w."status" IN ('ARRIVED', 'SIGNED')
      OR EXISTS (
        SELECT 1
        FROM "weigh_tickets" wt
        JOIN "quality_inspections" qi ON qi."weighTicketId" = wt."id"
        WHERE wt."waybillId" = w."id" AND qi."deletedAt" IS NULL
      )
    )
), numbered AS (
  SELECT *, row_number() OVER (ORDER BY COALESCE("arrivedAt", "createdAt"), "id") AS seq
  FROM candidate_waybills
)
INSERT INTO "quality_tasks" (
  "id", "taskNo", "waybillId", "status", "plannedReportCount",
  "createdBy", "createdAt", "updatedAt"
)
SELECT
  'legacy_qt_' || md5("id"),
  'QT-LEGACY-' || lpad(seq::text, 6, '0'),
  "id",
  CASE WHEN EXISTS (
    SELECT 1 FROM "weigh_tickets" wt
    JOIN "quality_inspections" qi ON qi."weighTicketId" = wt."id"
    WHERE wt."waybillId" = numbered."id" AND qi."deletedAt" IS NULL
  ) THEN 'PENDING_DECISION' ELSE 'PENDING_SAMPLING' END,
  3,
  "createdBy",
  COALESCE("arrivedAt", "createdAt"),
  CURRENT_TIMESTAMP
FROM numbered;

UPDATE "quality_inspections" qi
SET "qualityTaskId" = qt."id",
    "sampleNo" = COALESCE(qi."sampleNo1", qi."sampleNo2", qi."sampleNo3")
FROM "weigh_tickets" wt
JOIN "quality_tasks" qt ON qt."waybillId" = wt."waybillId"
WHERE qi."weighTicketId" = wt."id";

ALTER TABLE "quality_inspections" ALTER COLUMN "qualityTaskId" SET NOT NULL;

-- 对历史已确认报告生成任务级结论，优先沿用已被入库作业采用的报告。
WITH chosen AS (
  SELECT DISTINCT ON (qt."id")
    qt."id" AS "taskId", qi."id" AS "inspectionId", qi."conclusion",
    qi."confirmedBy", qi."confirmedAt"
  FROM "quality_tasks" qt
  JOIN "quality_inspections" qi ON qi."qualityTaskId" = qt."id"
  LEFT JOIN "inbound_receipts" ir ON ir."qualityInspectionId" = qi."id" AND ir."deletedAt" IS NULL
  WHERE qi."deletedAt" IS NULL AND qi."status" = 'CONFIRMED'
  ORDER BY qt."id", (ir."id" IS NOT NULL) DESC, qi."confirmedAt" ASC NULLS LAST, qi."createdAt" ASC
)
UPDATE "quality_tasks" qt
SET "status" = 'COMPLETED',
    "finalConclusion" = chosen."conclusion",
    "basisInspectionId" = chosen."inspectionId",
    "finalizedReportIds" = jsonb_build_array(chosen."inspectionId"),
    "finalizedReportCount" = 1,
    "decisionReason" = '历史已确认质检单迁移生成',
    "decisionVersion" = 1,
    "decidedBy" = chosen."confirmedBy",
    "decidedAt" = chosen."confirmedAt"
FROM chosen
WHERE qt."id" = chosen."taskId";

ALTER TABLE "quality_tasks"
  ADD CONSTRAINT "quality_tasks_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "quality_tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "quality_tasks_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "quality_tasks_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "quality_tasks_basisInspectionId_fkey" FOREIGN KEY ("basisInspectionId") REFERENCES "quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quality_inspections"
  ADD CONSTRAINT "quality_inspections_qualityTaskId_fkey" FOREIGN KEY ("qualityTaskId") REFERENCES "quality_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
