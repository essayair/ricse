-- 双边合同两侧联系人独立保存；历史共用联系人不推断归属、不改写。
ALTER TABLE "contracts"
  ADD COLUMN "purchaseContactPerson" TEXT,
  ADD COLUMN "purchaseContactPhone" TEXT,
  ADD COLUMN "salesContactPerson" TEXT,
  ADD COLUMN "salesContactPhone" TEXT;
