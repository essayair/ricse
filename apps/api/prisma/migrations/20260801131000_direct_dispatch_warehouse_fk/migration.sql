ALTER TABLE "outbound_orders"
  DROP CONSTRAINT "outbound_orders_warehouseId_fkey";

ALTER TABLE "outbound_orders"
  ADD CONSTRAINT "outbound_orders_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
