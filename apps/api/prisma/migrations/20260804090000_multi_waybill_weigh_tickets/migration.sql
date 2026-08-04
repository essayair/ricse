-- 一张物流运单可分别保留发货端和收货端的多张有效磅单，并独立选择库存与结算依据。
ALTER TABLE "weigh_tickets"
  ADD COLUMN "weighingStage" TEXT NOT NULL DEFAULT 'RECEIVING',
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isSupplementary" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "previousTicketId" TEXT,
  ADD COLUMN "additionReason" TEXT;

UPDATE "weigh_tickets"
SET "weighingStage" = CASE WHEN "direction" = 'OUTBOUND' THEN 'SHIPPING' ELSE 'RECEIVING' END;

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "waybillId", "weighingStage" ORDER BY "createdAt", "id") AS seq
  FROM "weigh_tickets"
  WHERE "deletedAt" IS NULL AND "status" <> 'VOIDED'
)
UPDATE "weigh_tickets" wt
SET "sequence" = ranked.seq,
    "isSupplementary" = ranked.seq > 1
FROM ranked
WHERE wt."id" = ranked."id";

CREATE INDEX "weigh_tickets_waybillId_weighingStage_idx"
  ON "weigh_tickets"("waybillId", "weighingStage");
CREATE INDEX "weigh_tickets_previousTicketId_idx" ON "weigh_tickets"("previousTicketId");

ALTER TABLE "weigh_tickets"
  ADD CONSTRAINT "weigh_tickets_previousTicketId_fkey"
  FOREIGN KEY ("previousTicketId") REFERENCES "weigh_tickets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "waybill_weight_selections" (
  "id" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "weighTicketId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "reason" TEXT,
  "isCurrent" BOOLEAN NOT NULL DEFAULT TRUE,
  "selectedBy" TEXT NOT NULL,
  "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waybill_weight_selections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "waybill_weight_selections_waybillId_purpose_isCurrent_idx"
  ON "waybill_weight_selections"("waybillId", "purpose", "isCurrent");
CREATE INDEX "waybill_weight_selections_weighTicketId_idx"
  ON "waybill_weight_selections"("weighTicketId");
CREATE INDEX "waybill_weight_selections_selectedBy_idx"
  ON "waybill_weight_selections"("selectedBy");
CREATE UNIQUE INDEX "waybill_weight_selections_current_key"
  ON "waybill_weight_selections"("waybillId", "purpose") WHERE "isCurrent" = TRUE;

ALTER TABLE "waybill_weight_selections"
  ADD CONSTRAINT "waybill_weight_selections_waybillId_fkey"
  FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "waybill_weight_selections_weighTicketId_fkey"
  FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "waybill_weight_selections_selectedBy_fkey"
  FOREIGN KEY ("selectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
