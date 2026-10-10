-- 付款单支持凭证 OCR、计划/实际账户差异留痕，并允许一张付款申请分次付款。

DROP INDEX IF EXISTS "fund_transactions_paymentRequestId_key";

ALTER TABLE "fund_transactions"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY',
  ADD COLUMN "paymentPurpose" TEXT,
  ADD COLUMN "bankAccountDifferenceReason" TEXT,
  ADD COLUMN "recognitionProvider" TEXT,
  ADD COLUMN "recognitionRawText" TEXT;

CREATE INDEX IF NOT EXISTS "fund_transactions_paymentRequestId_idx"
  ON "fund_transactions"("paymentRequestId");

