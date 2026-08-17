-- 生产管理：生产方案、任务、原料批次分配、完工申报及产成品批次追溯。

CREATE TABLE "production_recipes" (
  "id" TEXT NOT NULL,
  "recipeNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerPartnerId" TEXT NOT NULL,
  "outputMaterialId" TEXT NOT NULL,
  "baseOutputQuantity" DECIMAL(15,3) NOT NULL DEFAULT 1,
  "expectedYieldRate" DECIMAL(10,4),
  "lossToleranceRate" DECIMAL(10,4) NOT NULL DEFAULT 5,
  "qualityRequired" BOOLEAN NOT NULL DEFAULT true,
  "processDescription" TEXT,
  "qualityRequirements" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "remark" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "production_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_recipe_inputs" (
  "id" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialRole" TEXT NOT NULL DEFAULT 'RAW',
  "quantity" DECIMAL(15,3) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_recipe_inputs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_tasks" (
  "id" TEXT NOT NULL,
  "taskNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'INTERNAL',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "recipeId" TEXT NOT NULL,
  "ownerPartnerId" TEXT NOT NULL,
  "processorOrganizationId" TEXT,
  "sourceWarehouseId" TEXT NOT NULL,
  "targetWarehouseId" TEXT NOT NULL,
  "outputMaterialId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceOrderId" TEXT,
  "sourceOrderNo" TEXT,
  "plannedOutputQuantity" DECIMAL(15,3) NOT NULL,
  "completedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "qualifiedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "actualYieldRate" DECIMAL(10,4),
  "lossToleranceRate" DECIMAL(10,4) NOT NULL DEFAULT 5,
  "qualityRequired" BOOLEAN NOT NULL DEFAULT true,
  "processingFeeRate" DECIMAL(15,2),
  "operatorName" TEXT,
  "plannedStartAt" TIMESTAMP(3),
  "plannedEndAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "actualStartAt" TIMESTAMP(3),
  "actualEndAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "production_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_task_inputs" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialRole" TEXT NOT NULL DEFAULT 'RAW',
  "plannedQuantity" DECIMAL(15,3) NOT NULL,
  "reservedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "issuedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "consumedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "returnedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT 'TON',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_task_inputs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_material_allocations" (
  "id" TEXT NOT NULL,
  "taskInputId" TEXT NOT NULL,
  "inventoryLotId" TEXT NOT NULL,
  "reservedQuantity" DECIMAL(15,3) NOT NULL,
  "issuedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "consumedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "returnedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_material_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_completions" (
  "id" TEXT NOT NULL,
  "completionNo" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_QC',
  "qualityConclusion" TEXT NOT NULL DEFAULT 'PENDING',
  "qualityRemark" TEXT,
  "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "qualityConfirmedBy" TEXT,
  "qualityConfirmedAt" TIMESTAMP(3),
  "postedBy" TEXT,
  "postedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_completions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_lots" ALTER COLUMN "businessInboundId" DROP NOT NULL;
ALTER TABLE "inventory_lots" ADD COLUMN "productionCompletionId" TEXT;

CREATE UNIQUE INDEX "production_recipes_recipeNo_key" ON "production_recipes"("recipeNo");
CREATE INDEX "production_recipes_ownerPartnerId_idx" ON "production_recipes"("ownerPartnerId");
CREATE INDEX "production_recipes_outputMaterialId_idx" ON "production_recipes"("outputMaterialId");
CREATE INDEX "production_recipes_status_idx" ON "production_recipes"("status");
CREATE UNIQUE INDEX "production_recipe_inputs_recipeId_materialId_key" ON "production_recipe_inputs"("recipeId", "materialId");
CREATE INDEX "production_recipe_inputs_materialId_idx" ON "production_recipe_inputs"("materialId");
CREATE UNIQUE INDEX "production_tasks_taskNo_key" ON "production_tasks"("taskNo");
CREATE INDEX "production_tasks_status_idx" ON "production_tasks"("status");
CREATE INDEX "production_tasks_mode_idx" ON "production_tasks"("mode");
CREATE INDEX "production_tasks_recipeId_idx" ON "production_tasks"("recipeId");
CREATE INDEX "production_tasks_ownerPartnerId_idx" ON "production_tasks"("ownerPartnerId");
CREATE INDEX "production_tasks_processorOrganizationId_idx" ON "production_tasks"("processorOrganizationId");
CREATE INDEX "production_tasks_sourceWarehouseId_idx" ON "production_tasks"("sourceWarehouseId");
CREATE INDEX "production_tasks_targetWarehouseId_idx" ON "production_tasks"("targetWarehouseId");
CREATE INDEX "production_tasks_outputMaterialId_idx" ON "production_tasks"("outputMaterialId");
CREATE INDEX "production_tasks_sourceOrderId_idx" ON "production_tasks"("sourceOrderId");
CREATE UNIQUE INDEX "production_task_inputs_taskId_materialId_key" ON "production_task_inputs"("taskId", "materialId");
CREATE INDEX "production_task_inputs_materialId_idx" ON "production_task_inputs"("materialId");
CREATE UNIQUE INDEX "production_material_allocations_taskInputId_inventoryLotId_key" ON "production_material_allocations"("taskInputId", "inventoryLotId");
CREATE INDEX "production_material_allocations_inventoryLotId_idx" ON "production_material_allocations"("inventoryLotId");
CREATE UNIQUE INDEX "production_completions_completionNo_key" ON "production_completions"("completionNo");
CREATE INDEX "production_completions_taskId_idx" ON "production_completions"("taskId");
CREATE INDEX "production_completions_materialId_idx" ON "production_completions"("materialId");
CREATE INDEX "production_completions_status_idx" ON "production_completions"("status");
CREATE INDEX "production_completions_qualityConclusion_idx" ON "production_completions"("qualityConclusion");
CREATE UNIQUE INDEX "inventory_lots_productionCompletionId_key" ON "inventory_lots"("productionCompletionId");

ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_outputMaterialId_fkey" FOREIGN KEY ("outputMaterialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_recipe_inputs" ADD CONSTRAINT "production_recipe_inputs_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "production_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_recipe_inputs" ADD CONSTRAINT "production_recipe_inputs_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "production_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_processorOrganizationId_fkey" FOREIGN KEY ("processorOrganizationId") REFERENCES "service_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_targetWarehouseId_fkey" FOREIGN KEY ("targetWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_outputMaterialId_fkey" FOREIGN KEY ("outputMaterialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_task_inputs" ADD CONSTRAINT "production_task_inputs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "production_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_task_inputs" ADD CONSTRAINT "production_task_inputs_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_material_allocations" ADD CONSTRAINT "production_material_allocations_taskInputId_fkey" FOREIGN KEY ("taskInputId") REFERENCES "production_task_inputs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_material_allocations" ADD CONSTRAINT "production_material_allocations_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_completions" ADD CONSTRAINT "production_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "production_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_completions" ADD CONSTRAINT "production_completions_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_completions" ADD CONSTRAINT "production_completions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_completions" ADD CONSTRAINT "production_completions_qualityConfirmedBy_fkey" FOREIGN KEY ("qualityConfirmedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_completions" ADD CONSTRAINT "production_completions_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_productionCompletionId_fkey" FOREIGN KEY ("productionCompletionId") REFERENCES "production_completions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 生产管理权限与标准岗位。
INSERT INTO "permissions" ("id", "code", "name", "module", "action", "createdAt", "updatedAt") VALUES
  ('perm_production_view', 'production.view', '查看生产管理', 'PRODUCTION', 'VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_production_manage', 'production.manage', '管理生产任务', 'PRODUCTION', 'MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_production_post', 'production.post', '生产领料与入库过账', 'PRODUCTION', 'POST', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "action" = EXCLUDED."action", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "roles" ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt") VALUES
  ('role_production_manager', 'PRODUCTION_MANAGER', '生产管理员', '负责生产方案、生产任务、投料、完工及生产批次追溯', 'BUSINESS', 'ACTIVE', true, 85, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "status" = 'ACTIVE', "isSystem" = true, "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE
  (r."code" = 'ADMIN' AND p."code" LIKE 'production.%') OR
  (r."code" = 'MANAGER' AND p."code" LIKE 'production.%') OR
  (r."code" = 'PRODUCTION_MANAGER' AND p."code" IN ('production.view', 'production.manage', 'production.post', 'inventory.view', 'quality.view', 'master_data.view')) OR
  (r."code" = 'WAREHOUSE_KEEPER' AND p."code" IN ('production.view', 'production.post')) OR
  (r."code" = 'QUALITY_OPERATOR' AND p."code" = 'production.view') OR
  (r."code" IN ('SALESPERSON', 'FINANCE_SPECIALIST') AND p."code" = 'production.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
