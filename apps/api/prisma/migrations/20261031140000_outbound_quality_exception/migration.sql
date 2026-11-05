ALTER TABLE "outbound_receipts"
  ADD COLUMN "qualityExceptionReason" TEXT,
  ADD COLUMN "qualityExceptionDetails" TEXT,
  ADD COLUMN "qualityExceptionBy" TEXT,
  ADD COLUMN "qualityExceptionAt" TIMESTAMP(3);
