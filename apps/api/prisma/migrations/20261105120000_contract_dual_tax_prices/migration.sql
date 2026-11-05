ALTER TABLE "contract_line_items"
  ADD COLUMN "unitPriceExTax" DECIMAL(15,4),
  ADD COLUMN "taxRatePct" DECIMAL(5,2),
  ADD COLUMN "salesUnitPriceExTax" DECIMAL(15,4);
