ALTER TABLE "partners"
ADD COLUMN "shortCode" TEXT,
ADD COLUMN "orgType" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "legalIdCard" TEXT,
ADD COLUMN "controller" TEXT,
ADD COLUMN "controllerPhone" TEXT,
ADD COLUMN "province" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "estDate" TIMESTAMP(3),
ADD COLUMN "regCapital" DECIMAL(15,2),
ADD COLUMN "taxType" TEXT,
ADD COLUMN "taxRating" TEXT,
ADD COLUMN "invoiceType" TEXT,
ADD COLUMN "industry" TEXT,
ADD COLUMN "corpType" TEXT,
ADD COLUMN "bizScope" TEXT,
ADD COLUMN "tradingGoods" TEXT,
ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "country" TEXT,
ADD COLUMN "legalPersonType" TEXT,
ADD COLUMN "controllerTitle" TEXT,
ADD COLUMN "regNo" TEXT,
ADD COLUMN "regCurrency" TEXT,
ADD COLUMN "revenueScale" TEXT,
ADD COLUMN "groupName" TEXT,
ADD COLUMN "isParent" BOOLEAN,
ADD COLUMN "relatedPartyType" TEXT,
ADD COLUMN "licenseType" TEXT,
ADD COLUMN "licenseExpiry" TIMESTAMP(3),
ADD COLUMN "mainBiz" TEXT,
ADD COLUMN "equityStructure" TEXT,
ADD COLUMN "intro" TEXT,
ADD COLUMN "createdBy" TEXT;

ALTER TABLE "partners"
ADD CONSTRAINT "partners_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
