-- The attachment table existed in the development database before migrations
-- tracked it. Create it for clean/shadow databases and preserve existing data.
CREATE TABLE IF NOT EXISTS "attachments" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT,
  "contractId" TEXT,
  "waybillId" TEXT,
  "weighTicketId" TEXT,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "waybillId" TEXT;
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "weighTicketId" TEXT;

CREATE INDEX IF NOT EXISTS "attachments_partnerId_idx" ON "attachments"("partnerId");
CREATE INDEX IF NOT EXISTS "attachments_contractId_idx" ON "attachments"("contractId");
CREATE INDEX IF NOT EXISTS "attachments_waybillId_idx" ON "attachments"("waybillId");
CREATE INDEX IF NOT EXISTS "attachments_weighTicketId_idx" ON "attachments"("weighTicketId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_partnerId_fkey') THEN
    ALTER TABLE "attachments" ADD CONSTRAINT "attachments_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_contractId_fkey') THEN
    ALTER TABLE "attachments" ADD CONSTRAINT "attachments_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_waybillId_fkey') THEN
    ALTER TABLE "attachments" ADD CONSTRAINT "attachments_waybillId_fkey"
      FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_weighTicketId_fkey') THEN
    ALTER TABLE "attachments" ADD CONSTRAINT "attachments_weighTicketId_fkey"
      FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
