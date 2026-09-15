-- Prisma 的 @updatedAt 由客户端维护，不依赖数据库默认值。
ALTER TABLE "business_units" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "user_business_units" ALTER COLUMN "updatedAt" DROP DEFAULT;
