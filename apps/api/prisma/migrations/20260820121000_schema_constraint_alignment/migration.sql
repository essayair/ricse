-- PostgreSQL truncates identifiers longer than 63 bytes. Rename the generated
-- content price unique index to Prisma's deterministic truncated name.
ALTER INDEX IF EXISTS "content_product_prices_productTypeId_businessDate_region_source"
  RENAME TO "content_product_prices_productTypeId_businessDate_region_so_key";

-- Align the historical inbound inventory foreign key with the current optional
-- Prisma relation. This drift predates the content module and otherwise causes
-- every subsequent `prisma migrate dev` to request an unrelated migration.
ALTER TABLE "inventory_lots"
  DROP CONSTRAINT IF EXISTS "inventory_lots_businessInboundId_fkey";
ALTER TABLE "inventory_lots"
  ADD CONSTRAINT "inventory_lots_businessInboundId_fkey"
  FOREIGN KEY ("businessInboundId") REFERENCES "business_inbounds"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
