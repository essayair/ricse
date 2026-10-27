ALTER TABLE "inbound_receipts"
  ADD COLUMN "qualityExceptionReason" TEXT,
  ADD COLUMN "qualityExceptionAcceptedBy" TEXT,
  ADD COLUMN "qualityExceptionAcceptedAt" TIMESTAMP(3);

-- 迁移前已完成现场收货的异常单据，保留其既有人工确认事实，避免阻断后续过账。
UPDATE "inbound_receipts"
SET "qualityExceptionReason" = '历史单据：迁移前已确认收货',
    "qualityExceptionAcceptedBy" = "createdBy",
    "qualityExceptionAcceptedAt" = COALESCE("receivedAt", "updatedAt")
WHERE "status" IN ('RECEIVED', 'POSTED')
  AND "acceptanceConclusion" IS NOT NULL
  AND "acceptanceConclusion" NOT IN ('PASS', 'LEGACY');
