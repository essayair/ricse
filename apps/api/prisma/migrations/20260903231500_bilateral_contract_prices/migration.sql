-- 双边合同需要分别保存采购端和销售端价格。
-- 既有 unitPrice/totalPrice 继续作为采购端价格，保证历史采购执行数据兼容。
ALTER TABLE "contract_line_items"
  ADD COLUMN "salesUnitPrice" DECIMAL(15,4),
  ADD COLUMN "salesTotalPrice" DECIMAL(15,2);
