-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_sellerId_fkey";

-- AlterTable
ALTER TABLE "content_industry_datasets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
