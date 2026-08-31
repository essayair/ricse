-- 第一阶段质检标准、过磅任务及统一影像证据基础。

ALTER TABLE "materials" ADD COLUMN "qualityTemplateId" TEXT;

ALTER TABLE "quality_tasks"
  ADD COLUMN "qualityTemplateId" TEXT,
  ADD COLUMN "templateSnapshot" JSONB;
ALTER TABLE "quality_tasks" ALTER COLUMN "plannedReportCount" SET DEFAULT 1;

ALTER TABLE "quality_inspection_indicators"
  ADD COLUMN "indicatorDefinitionId" TEXT,
  ADD COLUMN "methodId" TEXT,
  ADD COLUMN "methodCode" TEXT,
  ADD COLUMN "methodName" TEXT;

ALTER TABLE "attachments"
  ADD COLUMN "weighTaskId" TEXT,
  ADD COLUMN "qualityTaskId" TEXT,
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'WEB_UPLOAD',
  ADD COLUMN "evidenceNode" TEXT,
  ADD COLUMN "capturedAt" TIMESTAMP(3),
  ADD COLUMN "uploadedBy" TEXT,
  ADD COLUMN "fileHash" TEXT,
  ADD COLUMN "watermarkText" TEXT;

CREATE TABLE "quality_indicator_definitions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT,
  "defaultUnit" TEXT NOT NULL DEFAULT '%',
  "dataType" TEXT NOT NULL DEFAULT 'NUMBER',
  "decimalPlaces" INTEGER NOT NULL DEFAULT 4,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_indicator_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_methods" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "standardNo" TEXT,
  "standardVersion" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_indicator_methods" (
  "id" TEXT NOT NULL,
  "indicatorId" TEXT NOT NULL,
  "methodId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_indicator_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_templates" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "materialCategoryId" TEXT,
  "businessScene" TEXT NOT NULL DEFAULT 'GENERAL',
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_template_items" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "indicatorId" TEXT NOT NULL,
  "defaultMethodId" TEXT,
  "operator" TEXT NOT NULL DEFAULT 'GTE',
  "standardValue" DECIMAL(15,4),
  "upperValue" DECIMAL(15,4),
  "fuseValue" DECIMAL(15,4),
  "unit" TEXT NOT NULL DEFAULT '%',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "core" BOOLEAN NOT NULL DEFAULT false,
  "participates" BOOLEAN NOT NULL DEFAULT true,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quality_template_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_method_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "indicatorId" TEXT NOT NULL,
  "methodId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_method_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weigh_tasks" (
  "id" TEXT NOT NULL,
  "taskNo" TEXT NOT NULL,
  "waybillId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_WEIGHING',
  "plannedQuantity" DECIMAL(15,3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "weigh_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quality_indicator_definitions_code_key" ON "quality_indicator_definitions"("code");
CREATE INDEX "quality_indicator_definitions_status_idx" ON "quality_indicator_definitions"("status");
CREATE INDEX "quality_indicator_definitions_name_idx" ON "quality_indicator_definitions"("name");
CREATE UNIQUE INDEX "quality_methods_code_key" ON "quality_methods"("code");
CREATE INDEX "quality_methods_status_idx" ON "quality_methods"("status");
CREATE INDEX "quality_methods_name_idx" ON "quality_methods"("name");
CREATE UNIQUE INDEX "quality_indicator_methods_indicatorId_methodId_key" ON "quality_indicator_methods"("indicatorId", "methodId");
CREATE INDEX "quality_indicator_methods_methodId_idx" ON "quality_indicator_methods"("methodId");
CREATE UNIQUE INDEX "quality_templates_code_key" ON "quality_templates"("code");
CREATE INDEX "quality_templates_materialCategoryId_idx" ON "quality_templates"("materialCategoryId");
CREATE INDEX "quality_templates_businessScene_status_idx" ON "quality_templates"("businessScene", "status");
CREATE UNIQUE INDEX "quality_template_items_templateId_indicatorId_key" ON "quality_template_items"("templateId", "indicatorId");
CREATE INDEX "quality_template_items_indicatorId_idx" ON "quality_template_items"("indicatorId");
CREATE INDEX "quality_template_items_defaultMethodId_idx" ON "quality_template_items"("defaultMethodId");
CREATE UNIQUE INDEX "quality_method_preferences_userId_materialId_indicatorId_key" ON "quality_method_preferences"("userId", "materialId", "indicatorId");
CREATE INDEX "quality_method_preferences_methodId_idx" ON "quality_method_preferences"("methodId");
CREATE UNIQUE INDEX "weigh_tasks_taskNo_key" ON "weigh_tasks"("taskNo");
CREATE UNIQUE INDEX "weigh_tasks_waybillId_key" ON "weigh_tasks"("waybillId");
CREATE INDEX "weigh_tasks_status_idx" ON "weigh_tasks"("status");
CREATE INDEX "materials_qualityTemplateId_idx" ON "materials"("qualityTemplateId");
CREATE INDEX "quality_tasks_qualityTemplateId_idx" ON "quality_tasks"("qualityTemplateId");
CREATE INDEX "quality_inspection_indicators_indicatorDefinitionId_idx" ON "quality_inspection_indicators"("indicatorDefinitionId");
CREATE INDEX "quality_inspection_indicators_methodId_idx" ON "quality_inspection_indicators"("methodId");
CREATE INDEX "attachments_weighTaskId_idx" ON "attachments"("weighTaskId");
CREATE INDEX "attachments_qualityTaskId_idx" ON "attachments"("qualityTaskId");
CREATE INDEX "attachments_uploadedBy_idx" ON "attachments"("uploadedBy");
CREATE INDEX "attachments_sourceType_idx" ON "attachments"("sourceType");

ALTER TABLE "materials" ADD CONSTRAINT "materials_qualityTemplateId_fkey" FOREIGN KEY ("qualityTemplateId") REFERENCES "quality_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_tasks" ADD CONSTRAINT "quality_tasks_qualityTemplateId_fkey" FOREIGN KEY ("qualityTemplateId") REFERENCES "quality_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_indicators" ADD CONSTRAINT "quality_inspection_indicators_indicatorDefinitionId_fkey" FOREIGN KEY ("indicatorDefinitionId") REFERENCES "quality_indicator_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_inspection_indicators" ADD CONSTRAINT "quality_inspection_indicators_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "quality_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_weighTaskId_fkey" FOREIGN KEY ("weighTaskId") REFERENCES "weigh_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_qualityTaskId_fkey" FOREIGN KEY ("qualityTaskId") REFERENCES "quality_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_indicator_methods" ADD CONSTRAINT "quality_indicator_methods_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "quality_indicator_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_indicator_methods" ADD CONSTRAINT "quality_indicator_methods_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "quality_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_templates" ADD CONSTRAINT "quality_templates_materialCategoryId_fkey" FOREIGN KEY ("materialCategoryId") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_template_items" ADD CONSTRAINT "quality_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "quality_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_template_items" ADD CONSTRAINT "quality_template_items_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "quality_indicator_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quality_template_items" ADD CONSTRAINT "quality_template_items_defaultMethodId_fkey" FOREIGN KEY ("defaultMethodId") REFERENCES "quality_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quality_method_preferences" ADD CONSTRAINT "quality_method_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_method_preferences" ADD CONSTRAINT "quality_method_preferences_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_method_preferences" ADD CONSTRAINT "quality_method_preferences_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "quality_indicator_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_method_preferences" ADD CONSTRAINT "quality_method_preferences_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "quality_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weigh_tasks" ADD CONSTRAINT "weigh_tasks_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weigh_tasks" ADD CONSTRAINT "weigh_tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 初始指标与方法只作为可编辑基础数据，不限制业务人员后续扩展。
INSERT INTO "quality_indicator_definitions" ("id", "code", "name", "symbol", "defaultUnit", "status", "updatedAt") VALUES
  ('qind_caf2', 'CAF2', 'CaF₂含量', 'CaF₂', '%', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qind_sio2', 'SIO2', 'SiO₂含量', 'SiO₂', '%', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qind_moisture', 'MOISTURE', '水分', NULL, '%', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qind_granularity', 'GRANULARITY', '粒度', NULL, '%', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qind_impurity', 'IMPURITY', '杂质', NULL, '%', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "quality_methods" ("id", "code", "name", "description", "status", "updatedAt") VALUES
  ('qm_chemical_titration', 'CHEMICAL_TITRATION', '化学滴定法', '化学滴定检测', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qm_xrf', 'XRF', 'X射线荧光法', 'X射线荧光检测', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qm_drying', 'DRYING', '烘干法', '水分烘干检测', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qm_screening', 'SCREENING', '筛分法', '粒度筛分检测', 'ACTIVE', CURRENT_TIMESTAMP),
  ('qm_external', 'EXTERNAL_STANDARD', '外部检测机构方法', '按检测机构报告所列方法执行', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "quality_indicator_methods" ("id", "indicatorId", "methodId", "isDefault", "updatedAt") VALUES
  ('qim_caf2_titration', 'qind_caf2', 'qm_chemical_titration', true, CURRENT_TIMESTAMP),
  ('qim_caf2_xrf', 'qind_caf2', 'qm_xrf', false, CURRENT_TIMESTAMP),
  ('qim_sio2_xrf', 'qind_sio2', 'qm_xrf', true, CURRENT_TIMESTAMP),
  ('qim_moisture_drying', 'qind_moisture', 'qm_drying', true, CURRENT_TIMESTAMP),
  ('qim_granularity_screen', 'qind_granularity', 'qm_screening', true, CURRENT_TIMESTAMP),
  ('qim_impurity_external', 'qind_impurity', 'qm_external', true, CURRENT_TIMESTAMP)
ON CONFLICT ("indicatorId", "methodId") DO NOTHING;

-- 为已经具备车辆信息的历史运单补建过磅任务，状态根据现有磅单自动推断。
WITH source AS (
  SELECT
    w."id",
    w."totalQuantity",
    w."createdBy",
    w."createdAt",
    row_number() OVER (ORDER BY w."createdAt", w."id") AS rn,
    CASE
      WHEN w."status" = 'CANCELLED' THEN 'VOIDED'
      WHEN EXISTS (SELECT 1 FROM "weigh_tickets" t WHERE t."waybillId" = w."id" AND t."deletedAt" IS NULL AND t."status" = 'REVIEWED' AND t."abnormal" = true) THEN 'EXCEPTION'
      WHEN EXISTS (SELECT 1 FROM "weigh_tickets" t WHERE t."waybillId" = w."id" AND t."deletedAt" IS NULL AND t."status" = 'REVIEWED') THEN 'COMPLETED'
      WHEN EXISTS (SELECT 1 FROM "weigh_tickets" t WHERE t."waybillId" = w."id" AND t."deletedAt" IS NULL AND t."status" = 'COMPLETED') THEN 'PENDING_CONFIRMATION'
      WHEN EXISTS (SELECT 1 FROM "weigh_tickets" t WHERE t."waybillId" = w."id" AND t."deletedAt" IS NULL) THEN 'IN_PROGRESS'
      ELSE 'PENDING_WEIGHING'
    END AS task_status
  FROM "waybills" w
  WHERE w."deletedAt" IS NULL AND (w."vehicleId" IS NOT NULL OR NULLIF(w."plateNo", '') IS NOT NULL)
)
INSERT INTO "weigh_tasks" ("id", "taskNo", "waybillId", "status", "plannedQuantity", "createdBy", "createdAt", "updatedAt")
SELECT
  'wt_' || substr(md5("id"), 1, 24),
  'WT-MIG-' || lpad(rn::text, 6, '0'),
  "id",
  task_status,
  "totalQuantity",
  "createdBy",
  "createdAt",
  CURRENT_TIMESTAMP
FROM source
ON CONFLICT ("waybillId") DO NOTHING;
