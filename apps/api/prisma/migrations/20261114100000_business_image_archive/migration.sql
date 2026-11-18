CREATE TABLE "business_images" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "dispatchNoticeId" TEXT,
  "documentType" TEXT NOT NULL,
  "sourceOriginalName" TEXT NOT NULL,
  "originalSize" INTEGER NOT NULL,
  "photoCompressed" BOOLEAN NOT NULL DEFAULT false,
  "fileHash" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_images_id_fkey" FOREIGN KEY ("id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_images_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "business_images_dispatchNoticeId_fkey" FOREIGN KEY ("dispatchNoticeId") REFERENCES "dispatch_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "business_images_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "business_images_createdBy_clientRequestId_key" ON "business_images"("createdBy", "clientRequestId");
CREATE UNIQUE INDEX "business_images_contractId_fileHash_key" ON "business_images"("contractId", "fileHash");
CREATE INDEX "business_images_contractId_createdAt_idx" ON "business_images"("contractId", "createdAt");
CREATE INDEX "business_images_dispatchNoticeId_idx" ON "business_images"("dispatchNoticeId");
CREATE INDEX "business_images_documentType_idx" ON "business_images"("documentType");

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "description", "createdAt", "updatedAt") VALUES
 ('perm_business_image_view', 'business_image.view', '查看业务影像', 'BUSINESS_IMAGE', 'VIEW', '合同范围内集中查看影像；原单据附件另校验所属业务的查看权限', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 ('perm_business_image_manage', 'business_image.manage', '归档维护业务影像', 'BUSINESS_IMAGE', 'MANAGE', '上传、核对名称、维护仅归档资料及按原业务权限关联单据', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 沿用现有角色的授权范围；不为视频监控角色授予交易资料权限。
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p."id" FROM "role_permissions" rp
JOIN "permissions" source ON source."id" = rp."permissionId"
JOIN "permissions" p ON p."code" = 'business_image.view'
WHERE source."code" = 'contract.view'
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p."id" FROM "role_permissions" rp
JOIN "permissions" source ON source."id" = rp."permissionId"
JOIN "permissions" p ON p."code" = 'business_image.manage'
WHERE source."code" IN ('contract.create', 'contract.edit', 'execution.manage', 'logistics.manage', 'quality.manage', 'inventory.manage', 'settlement.create', 'settlement.payment.apply', 'settlement.receipt.register')
ON CONFLICT DO NOTHING;
