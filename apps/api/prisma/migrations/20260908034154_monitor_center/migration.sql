-- CreateTable
CREATE TABLE "monitor_platforms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "appSecret" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://open.ys7.com',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "monitor_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_sites" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "monitor_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_cameras" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceSerial" TEXT NOT NULL,
    "channelNo" INTEGER NOT NULL DEFAULT 1,
    "verifyCode" TEXT,
    "streamQuality" TEXT NOT NULL DEFAULT 'hd',
    "ptzSupport" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "statusSyncAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "monitor_cameras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monitor_platforms_code_key" ON "monitor_platforms"("code");

-- CreateIndex
CREATE INDEX "monitor_platforms_status_idx" ON "monitor_platforms"("status");

-- CreateIndex
CREATE INDEX "monitor_sites_platformId_status_idx" ON "monitor_sites"("platformId", "status");

-- CreateIndex
CREATE INDEX "monitor_sites_warehouseId_idx" ON "monitor_sites"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "monitor_sites_platformId_code_key" ON "monitor_sites"("platformId", "code");

-- CreateIndex
CREATE INDEX "monitor_cameras_siteId_status_idx" ON "monitor_cameras"("siteId", "status");

-- CreateIndex
CREATE INDEX "monitor_cameras_deviceSerial_idx" ON "monitor_cameras"("deviceSerial");

-- CreateIndex
CREATE UNIQUE INDEX "monitor_cameras_siteId_code_key" ON "monitor_cameras"("siteId", "code");

-- AddForeignKey
ALTER TABLE "monitor_sites" ADD CONSTRAINT "monitor_sites_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "monitor_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_sites" ADD CONSTRAINT "monitor_sites_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_cameras" ADD CONSTRAINT "monitor_cameras_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "monitor_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ========== 监控权限 ==========

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "createdAt", "updatedAt") VALUES
  ('perm_monitor_view', 'monitor.view', '查看监控点位', 'MONITOR', 'VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_monitor_manage', 'monitor.manage', '管理监控平台与点位', 'MONITOR', 'MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 系统管理员：全部监控权限
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'ADMIN' AND p."code" IN ('monitor.view', 'monitor.manage')
ON CONFLICT DO NOTHING;

-- 现场与仓储岗位：查看监控
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('QUALITY_OPERATOR', 'WAREHOUSE_KEEPER', 'MANAGER') AND p."code" = 'monitor.view'
ON CONFLICT DO NOTHING;

-- 主数据管理员：维护监控配置
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'MASTER_DATA_ADMIN' AND p."code" IN ('monitor.view', 'monitor.manage')
ON CONFLICT DO NOTHING;

-- ========== 存量点位迁移 ==========
-- 点位来自官网 website/src/views/smon/index.vue 的硬编码配置。
-- 平台凭据不写入迁移：由管理员在「监控录像 → 平台账号」录入，或通过 EZVIZ_APP_KEY / EZVIZ_APP_SECRET 播种。

INSERT INTO "monitor_platforms" ("id", "code", "name", "appKey", "appSecret", "baseUrl", "status", "remark", "createdAt", "updatedAt") VALUES
  ('mplat_ezviz', 'EZVIZ', '萤石云开放平台', '', '', 'https://open.ys7.com', 'INACTIVE', '需在「监控录像 → 平台账号」录入 appKey / appSecret 后启用', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "monitor_sites" ("id", "platformId", "code", "name", "sortOrder", "status", "createdAt", "updatedAt") VALUES
  ('msite_panorama', 'mplat_ezviz', 'panorama', '玉门仓监控-全景', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('msite_interior', 'mplat_ezviz', 'interior', '玉门仓监控-内部', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('msite_exterior', 'mplat_ezviz', 'exterior', '玉门仓监控-外部', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('msite_lab', 'mplat_ezviz', 'lab', '玉门仓监控-化验室', 30, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("platformId", "code") DO NOTHING;

INSERT INTO "monitor_cameras" ("id", "siteId", "code", "name", "deviceSerial", "channelNo", "verifyCode", "streamQuality", "ptzSupport", "purpose", "sortOrder", "status", "createdAt", "updatedAt") VALUES
  ('mcam_panorama_gk_3', 'msite_panorama', 'gk-3', '广角摄像头全景', 'GK9665972', 3, 'Kd147258', 'hd', true, 'WAREHOUSE', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_panorama_gk_2', 'msite_panorama', 'gk-2', '广角摄像头主摄', 'GK9665972', 2, 'Kd147258', 'hd', true, 'WAREHOUSE', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_panorama_gk_1', 'msite_panorama', 'gk-1', '东区360摄像头', 'GK9665972', 1, 'Kd147258', 'hd', true, 'WAREHOUSE', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_panorama_gk_4', 'msite_panorama', 'gk-4', '西区360摄像头', 'GK9665972', 4, 'Kd147258', 'hd', true, 'WAREHOUSE', 30, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_panorama_gk_5', 'msite_panorama', 'gk-5', '电子地磅摄像头', 'GK9665972', 5, 'Kd147258', 'hd', true, 'WEIGHBRIDGE', 40, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_4', 'msite_interior', 'ckb-4', '内部摄像头-04', 'GQ5318128', 4, 'Kd147258', 'hd', false, 'WAREHOUSE', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_5', 'msite_interior', 'ckb-5', '内部摄像头-05', 'GQ5318128', 5, 'Kd147258', 'hd', false, 'WAREHOUSE', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_7', 'msite_interior', 'ckb-7', '内部摄像头-07', 'GQ5318128', 7, 'Kd147258', 'hd', false, 'WAREHOUSE', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_8', 'msite_interior', 'ckb-8', '内部摄像头-08', 'GQ5318128', 8, 'Kd147258', 'hd', false, 'WAREHOUSE', 30, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_9', 'msite_interior', 'ckb-9', '内部摄像头-09', 'GQ5318128', 9, 'Kd147258', 'hd', false, 'WAREHOUSE', 40, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_10', 'msite_interior', 'ckb-10', '内部摄像头-10', 'GQ5318128', 10, 'Kd147258', 'hd', false, 'WAREHOUSE', 50, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_12', 'msite_interior', 'ckb-12', '内部摄像头-12', 'GQ5318128', 12, 'Kd147258', 'hd', false, 'WAREHOUSE', 60, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_interior_ckb_13', 'msite_interior', 'ckb-13', '内部摄像头-13', 'GQ5318128', 13, 'Kd147258', 'hd', false, 'WAREHOUSE', 70, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_exterior_ext_1', 'msite_exterior', 'ext-1', '外部摄像头-01', 'GQ5318128', 1, 'Kd147258', 'hd', false, 'WAREHOUSE', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_exterior_ext_2', 'msite_exterior', 'ext-2', '外部摄像头-02', 'GQ5318128', 2, 'Kd147258', 'hd', false, 'WAREHOUSE', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_exterior_ext_3', 'msite_exterior', 'ext-3', '外部摄像头-03', 'GQ5318128', 3, 'Kd147258', 'hd', false, 'WAREHOUSE', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_exterior_ext_6', 'msite_exterior', 'ext-6', '外部摄像头-06', 'GQ5318128', 6, 'Kd147258', 'hd', false, 'WAREHOUSE', 30, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_exterior_ext_11', 'msite_exterior', 'ext-11', '外部摄像头-11', 'GQ5318128', 11, 'Kd147258', 'hd', false, 'WAREHOUSE', 40, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_lab_lab_1', 'msite_lab', 'lab-1', '化验室摄像头-01', 'GQ5318124', 1, 'Kd147258', 'hd', false, 'LAB', 0, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_lab_lab_3', 'msite_lab', 'lab-3', '化验室摄像头-03', 'GQ5318124', 3, 'Kd147258', 'hd', false, 'LAB', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mcam_lab_lab_4', 'msite_lab', 'lab-4', '化验室摄像头-04', 'GQ5318124', 4, 'Kd147258', 'hd', false, 'LAB', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("siteId", "code") DO NOTHING;
