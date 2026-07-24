ALTER TABLE "weigh_tickets"
  ADD COLUMN "ticketDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "plateNo" TEXT,
  ADD COLUMN "materialName" TEXT,
  ADD COLUMN "materialSpec" TEXT,
  ADD COLUMN "shipperName" TEXT,
  ADD COLUMN "receiverName" TEXT,
  ADD COLUMN "packageCount" INTEGER,
  ADD COLUMN "driverName" TEXT,
  ADD COLUMN "weighmasterName" TEXT,
  ADD COLUMN "printedAt" TIMESTAMP(3);

UPDATE "weigh_tickets" wt
SET
  "plateNo" = w."plateNo",
  "driverName" = w."driverName",
  "ticketDate" = wt."createdAt",
  "weighmasterName" = u."name"
FROM "waybills" w, "users" u
WHERE wt."waybillId" = w."id" AND wt."createdBy" = u."id";

UPDATE "weigh_tickets" wt
SET "materialName" = source."materialName"
FROM (
  SELECT "waybillId", string_agg(COALESCE("materialName", "materialId"), '、' ORDER BY "createdAt") AS "materialName"
  FROM "waybill_line_items"
  GROUP BY "waybillId"
) source
WHERE wt."waybillId" = source."waybillId";

CREATE INDEX "weigh_tickets_ticketDate_idx" ON "weigh_tickets"("ticketDate");
