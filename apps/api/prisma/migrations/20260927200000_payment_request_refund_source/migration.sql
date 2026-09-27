-- 客户退款、客户保证金退回也必须经过付款申请，申请单关联原收款流水。

ALTER TABLE "payment_requests" ADD COLUMN "relatedTransactionId" TEXT;

CREATE INDEX "payment_requests_relatedTransactionId_idx"
  ON "payment_requests"("relatedTransactionId");

ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_relatedTransactionId_fkey"
  FOREIGN KEY ("relatedTransactionId") REFERENCES "fund_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "permissions"
SET "description" = '从采购应付或销售退款场景发起付款申请', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'settlement.payment.apply';
