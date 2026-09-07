-- 正在填写的合同允许先保存不完整草稿；提交审批前由业务校验确保交易对手方完整。
ALTER TABLE "contracts"
  ALTER COLUMN "sellerId" DROP NOT NULL;

ALTER TABLE "contracts"
  ADD COLUMN "draftData" JSONB;
