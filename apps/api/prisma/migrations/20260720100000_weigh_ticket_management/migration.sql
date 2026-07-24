CREATE TABLE "weigh_tickets" (
  "id" TEXT NOT NULL,
  "ticketNo" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dataSource" TEXT NOT NULL DEFAULT 'MANUAL',
  "plannedQuantity" DECIMAL(15,3) NOT NULL,
  "selectedGrossRecordId" TEXT,
  "selectedTareRecordId" TEXT,
  "grossWeight" DECIMAL(15,3),
  "tareWeight" DECIMAL(15,3),
  "netWeight" DECIMAL(15,3),
  "shippingWeight" DECIMAL(15,3),
  "receivingWeight" DECIMAL(15,3),
  "customerWeight" DECIMAL(15,3),
  "thirdPartyWeight" DECIMAL(15,3),
  "manualWeight" DECIMAL(15,3),
  "settlementBasis" TEXT NOT NULL DEFAULT 'RECEIVING',
  "settlementWeight" DECIMAL(15,3),
  "varianceWeight" DECIMAL(15,3),
  "varianceRate" DECIMAL(10,4),
  "toleranceRate" DECIMAL(10,4) NOT NULL DEFAULT 0.5,
  "abnormal" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "reviewRemark" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "weigh_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weigh_records" (
  "id" TEXT NOT NULL,
  "weighTicketId" TEXT NOT NULL,
  "weighingType" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "weight" DECIMAL(15,3) NOT NULL,
  "dataSource" TEXT NOT NULL DEFAULT 'MANUAL',
  "weighedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "operatorId" TEXT NOT NULL,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weigh_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weigh_tickets_ticketNo_key" ON "weigh_tickets"("ticketNo");
CREATE INDEX "weigh_tickets_ticketNo_idx" ON "weigh_tickets"("ticketNo");
CREATE INDEX "weigh_tickets_waybillId_idx" ON "weigh_tickets"("waybillId");
CREATE INDEX "weigh_tickets_status_idx" ON "weigh_tickets"("status");
CREATE INDEX "weigh_tickets_abnormal_idx" ON "weigh_tickets"("abnormal");
CREATE UNIQUE INDEX "weigh_records_weighTicketId_sequence_key" ON "weigh_records"("weighTicketId", "sequence");
CREATE INDEX "weigh_records_weighTicketId_idx" ON "weigh_records"("weighTicketId");
CREATE INDEX "weigh_records_weighingType_idx" ON "weigh_records"("weighingType");

ALTER TABLE "weigh_tickets" ADD CONSTRAINT "weigh_tickets_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weigh_tickets" ADD CONSTRAINT "weigh_tickets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weigh_tickets" ADD CONSTRAINT "weigh_tickets_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "weigh_records" ADD CONSTRAINT "weigh_records_weighTicketId_fkey" FOREIGN KEY ("weighTicketId") REFERENCES "weigh_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weigh_records" ADD CONSTRAINT "weigh_records_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
