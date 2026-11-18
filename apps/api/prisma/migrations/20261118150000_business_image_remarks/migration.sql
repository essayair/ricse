-- 可空字段，兼容已有归档资料及不提交备注的旧客户端。
ALTER TABLE "business_images" ADD COLUMN "remarks" TEXT;
