-- 历史“待认领”收款尚未完成业务认领，不应预生成等额认领明细。
DELETE FROM "fund_claims" claim
USING "fund_transactions" fund
WHERE claim."fundTransactionId" = fund."id"
  AND claim."id" = 'legacy-claim-' || fund."id"
  AND fund."status" = 'PENDING_CLAIM';
