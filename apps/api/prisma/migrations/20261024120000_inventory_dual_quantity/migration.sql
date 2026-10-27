ALTER TABLE "materials" ADD COLUMN "pricingQuantityBasis" TEXT NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE "inbound_receipts" ADD COLUMN "pricingQuantity" DECIMAL(15,3), ADD COLUMN "pricingQuantityBasis" TEXT, ADD COLUMN "measuredMoisturePct" DECIMAL(7,4);
ALTER TABLE "business_inbounds" ADD COLUMN "pricingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "pricingQuantityBasis" TEXT NOT NULL DEFAULT 'PHYSICAL', ADD COLUMN "measuredMoisturePct" DECIMAL(7,4);
ALTER TABLE "inventory_lots" ADD COLUMN "pricingInitialQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "pricingAvailableQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "pricingQuantityBasis" TEXT NOT NULL DEFAULT 'PHYSICAL', ADD COLUMN "quantitySource" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "inventory_ledgers" ADD COLUMN "pricingQuantityChange" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "pricingBalanceAfter" DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE "outbound_receipts" ADD COLUMN "pricingQuantity" DECIMAL(15,3);
ALTER TABLE "outbound_receipt_allocations" ADD COLUMN "pricingQuantity" DECIMAL(15,3);
ALTER TABLE "sales_outbounds" ADD COLUMN "pricingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE "sales_outbound_lines" ADD COLUMN "pricingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "pricingBalanceAfter" DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_reversal_lines" ADD COLUMN "sourcePricingQuantity" DECIMAL(15,3), ADD COLUMN "pricingQuantity" DECIMAL(15,3), ADD COLUMN "pricingBalanceAfter" DECIMAL(15,3);
ALTER TABLE "production_material_allocations" ADD COLUMN "issuedPricingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0, ADD COLUMN "returnedPricingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0;

-- 历史数值不重新推算：只有单数量可证明，先沿用并显式标记待核对。
UPDATE "inbound_receipts" SET "pricingQuantity" = "receivedQuantity", "pricingQuantityBasis" = 'PHYSICAL' WHERE "receivedQuantity" IS NOT NULL;
UPDATE "business_inbounds" SET "pricingQuantity" = "quantity";
UPDATE "inventory_lots" SET "pricingInitialQuantity" = "initialQuantity", "pricingAvailableQuantity" = "availableQuantity", "quantitySource" = 'LEGACY_UNVERIFIED';
UPDATE "inventory_ledgers" SET "pricingQuantityChange" = "quantityChange", "pricingBalanceAfter" = "balanceAfter";
UPDATE "outbound_receipts" SET "pricingQuantity" = "outboundQuantity" WHERE "outboundQuantity" IS NOT NULL;
UPDATE "outbound_receipt_allocations" SET "pricingQuantity" = "quantity";
UPDATE "sales_outbounds" SET "pricingQuantity" = "quantity";
UPDATE "sales_outbound_lines" SET "pricingQuantity" = "quantity", "pricingBalanceAfter" = "balanceAfter";
UPDATE "inventory_reversal_lines" SET "sourcePricingQuantity" = "sourceQuantity", "pricingQuantity" = "quantity", "pricingBalanceAfter" = "balanceAfter";
UPDATE "production_material_allocations" SET "issuedPricingQuantity" = "issuedQuantity", "returnedPricingQuantity" = "returnedQuantity";
