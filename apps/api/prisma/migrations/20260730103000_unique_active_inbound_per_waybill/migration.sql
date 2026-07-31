CREATE UNIQUE INDEX "inbound_receipts_one_active_per_waybill_idx"
ON "inbound_receipts"("waybillId")
WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED';
