CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(15,2) NOT NULL,
  "plannedDate" TIMESTAMP(3),
  "deliveryLocation" TEXT,
  "remarks" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_line_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "contractLineItemId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT,
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "unitPrice" DECIMAL(15,4) NOT NULL,
  "totalPrice" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_orderNo_key" ON "orders"("orderNo");
CREATE INDEX "orders_orderNo_idx" ON "orders"("orderNo");
CREATE INDEX "orders_contractId_idx" ON "orders"("contractId");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_type_idx" ON "orders"("type");
CREATE INDEX "order_line_items_orderId_idx" ON "order_line_items"("orderId");
CREATE INDEX "order_line_items_contractLineItemId_idx" ON "order_line_items"("contractLineItemId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
