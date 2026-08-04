-- 库存主体采用采购合同的我方签约主体，并与物理仓库维度相互独立。
ALTER TABLE "business_inbounds" ADD COLUMN "ownerPartnerId" TEXT;
ALTER TABLE "inventory_lots" ADD COLUMN "ownerPartnerId" TEXT;
ALTER TABLE "outbound_orders" ADD COLUMN "ownerPartnerId" TEXT;

UPDATE "business_inbounds" b
SET "ownerPartnerId" = c."signingPartnerId"
FROM "inbound_receipts" r
JOIN "waybills" w ON w."id" = r."waybillId"
JOIN "dispatch_notices" n ON n."id" = w."dispatchNoticeId"
JOIN "orders" o ON o."id" = n."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
WHERE b."receiptId" = r."id";

UPDATE "inventory_lots" l
SET "ownerPartnerId" = b."ownerPartnerId"
FROM "business_inbounds" b
WHERE l."businessInboundId" = b."id";

UPDATE "outbound_orders" oo
SET "ownerPartnerId" = c."signingPartnerId"
FROM "dispatch_notices" n
JOIN "orders" o ON o."id" = n."orderId"
JOIN "contracts" c ON c."id" = o."contractId"
WHERE oo."dispatchNoticeId" = n."id";

CREATE INDEX "business_inbounds_ownerPartnerId_idx" ON "business_inbounds"("ownerPartnerId");
CREATE INDEX "inventory_lots_ownerPartnerId_idx" ON "inventory_lots"("ownerPartnerId");
CREATE INDEX "outbound_orders_ownerPartnerId_idx" ON "outbound_orders"("ownerPartnerId");

ALTER TABLE "business_inbounds"
  ADD CONSTRAINT "business_inbounds_ownerPartnerId_fkey"
  FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_lots"
  ADD CONSTRAINT "inventory_lots_ownerPartnerId_fkey"
  FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_orders"
  ADD CONSTRAINT "outbound_orders_ownerPartnerId_fkey"
  FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
