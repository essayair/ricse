ALTER TABLE "waybills"
  ADD COLUMN "salesCompletionCustomerTicketId" TEXT,
  ADD COLUMN "salesCompletionShippingTicketId" TEXT,
  ADD COLUMN "salesCompletionCustomerWeight" DECIMAL(15,3),
  ADD COLUMN "salesCompletionShippingWeight" DECIMAL(15,3),
  ADD COLUMN "salesCompletionWeightVariance" DECIMAL(15,3);

CREATE INDEX "waybills_salesCompletionCustomerTicketId_idx" ON "waybills"("salesCompletionCustomerTicketId");
