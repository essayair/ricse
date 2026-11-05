ALTER TABLE "weigh_tickets"
  ADD COLUMN "weightEntrySource" TEXT NOT NULL DEFAULT 'RECORDS',
  ADD COLUMN "enteredGrossWeight" DECIMAL(15,3),
  ADD COLUMN "enteredTareWeight" DECIMAL(15,3),
  ADD COLUMN "enteredNetWeight" DECIMAL(15,3),
  ADD COLUMN "weightOverrideReason" TEXT;
