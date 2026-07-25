-- DropIndex
DROP INDEX "partners_code_key";

-- AlterTable
ALTER TABLE "approvals" ALTER COLUMN "status" SET DEFAULT 'WAITING';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "deliveryLocation" TEXT,
ADD COLUMN     "deliveryMethod" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "externalNo" TEXT,
ADD COLUMN     "impurityRule" TEXT,
ADD COLUMN     "moistureRule" TEXT,
ADD COLUMN     "overfillPct" DECIMAL(5,2),
ADD COLUMN     "paymentDays" INTEGER,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "prepayPct" DECIMAL(5,2),
ADD COLUMN     "pricingType" TEXT,
ADD COLUMN     "settlementBasis" TEXT,
ADD COLUMN     "shortfallPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "hsCode" TEXT,
ADD COLUMN     "internalCode" TEXT,
ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qcTemplate" TEXT,
ADD COLUMN     "specs" JSONB,
ADD COLUMN     "taxCode" TEXT,
ALTER COLUMN "grade" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "businessGroupId" TEXT,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INTERNAL',
    "partnerId" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_group_companies" (
    "businessGroupId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "business_group_companies_pkey" PRIMARY KEY ("businessGroupId","companyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "departments_companyId_idx" ON "departments"("companyId");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");

-- CreateIndex
CREATE INDEX "business_inbounds_inboundNo_idx" ON "business_inbounds"("inboundNo");

-- CreateIndex
CREATE INDEX "inbound_receipts_receiptNo_idx" ON "inbound_receipts"("receiptNo");

-- CreateIndex
CREATE INDEX "outbound_receipts_receiptNo_idx" ON "outbound_receipts"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_group_companies" ADD CONSTRAINT "business_group_companies_businessGroupId_fkey" FOREIGN KEY ("businessGroupId") REFERENCES "business_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_group_companies" ADD CONSTRAINT "business_group_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "outbound_receipt_allocations_outboundReceiptId_inventoryLotId_k" RENAME TO "outbound_receipt_allocations_outboundReceiptId_inventoryLot_key";
