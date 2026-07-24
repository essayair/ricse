ALTER TABLE "orders"
ADD COLUMN "name" TEXT;

UPDATE "orders"
SET "name" = CASE
  WHEN "type" = 'PURCHASE' THEN '采购批次-' || "orderNo"
  ELSE '销售批次-' || "orderNo"
END;

ALTER TABLE "orders"
ALTER COLUMN "name" SET NOT NULL;
