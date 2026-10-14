-- 产业数据库一期：静态产业资料，与交易合作伙伴完全独立。
CREATE TABLE "industry_fluorite_producers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "province" TEXT,
  "city" TEXT,
  "address" TEXT,
  "mainProducts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "designCapacity" DECIMAL(18,4),
  "effectiveCapacity" DECIMAL(18,4),
  "capacityUnit" TEXT NOT NULL DEFAULT '万吨/年',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "dataYear" INTEGER,
  "source" TEXT,
  "description" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_fluorite_producers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "industry_fluorite_producers_name_key" ON "industry_fluorite_producers"("name");
CREATE INDEX "industry_fluorite_producers_province_status_idx" ON "industry_fluorite_producers"("province", "status");
CREATE INDEX "industry_fluorite_producers_dataYear_idx" ON "industry_fluorite_producers"("dataYear");

CREATE TABLE "industry_fluorochemical_producers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "province" TEXT,
  "city" TEXT,
  "address" TEXT,
  "productCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mainProducts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "dataYear" INTEGER,
  "source" TEXT,
  "description" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_fluorochemical_producers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "industry_fluorochemical_producers_name_key" ON "industry_fluorochemical_producers"("name");
CREATE INDEX "industry_fluorochemical_producers_province_status_idx" ON "industry_fluorochemical_producers"("province", "status");
CREATE INDEX "industry_fluorochemical_producers_dataYear_idx" ON "industry_fluorochemical_producers"("dataYear");

CREATE TABLE "industry_mine_resources" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "operatorName" TEXT,
  "province" TEXT,
  "city" TEXT,
  "address" TEXT,
  "mineralType" TEXT,
  "reserveAmount" DECIMAL(18,4),
  "reserveUnit" TEXT NOT NULL DEFAULT '万吨',
  "averageGrade" DECIMAL(10,4),
  "miningCapacity" DECIMAL(18,4),
  "capacityUnit" TEXT NOT NULL DEFAULT '万吨/年',
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "dataYear" INTEGER,
  "source" TEXT,
  "description" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_mine_resources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "industry_mine_resources_province_status_idx" ON "industry_mine_resources"("province", "status");
CREATE INDEX "industry_mine_resources_operatorName_idx" ON "industry_mine_resources"("operatorName");

CREATE TABLE "industry_capacity_projects" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "province" TEXT,
  "city" TEXT,
  "address" TEXT,
  "productName" TEXT NOT NULL,
  "designCapacity" DECIMAL(18,4),
  "effectiveCapacity" DECIMAL(18,4),
  "plannedCapacity" DECIMAL(18,4),
  "capacityUnit" TEXT NOT NULL DEFAULT '万吨/年',
  "commissioningDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "dataYear" INTEGER,
  "source" TEXT,
  "description" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_capacity_projects_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "industry_capacity_projects_companyName_idx" ON "industry_capacity_projects"("companyName");
CREATE INDEX "industry_capacity_projects_productName_status_idx" ON "industry_capacity_projects"("productName", "status");
CREATE INDEX "industry_capacity_projects_province_dataYear_idx" ON "industry_capacity_projects"("province", "dataYear");

CREATE TABLE "industry_parks" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "province" TEXT,
  "city" TEXT,
  "address" TEXT,
  "level" TEXT,
  "focusIndustries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "latitude" DECIMAL(10,6),
  "longitude" DECIMAL(10,6),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "dataYear" INTEGER,
  "source" TEXT,
  "description" TEXT,
  "remark" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "industry_parks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "industry_parks_name_key" ON "industry_parks"("name");
CREATE INDEX "industry_parks_province_status_idx" ON "industry_parks"("province", "status");

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "createdAt", "updatedAt") VALUES
  ('perm_industry_database_view', 'industry.database.view', '查看产业数据库', 'INDUSTRY_DATABASE', 'VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_industry_database_manage', 'industry.database.manage', '维护产业数据库', 'INDUSTRY_DATABASE', 'MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "action" = EXCLUDED."action", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'CONTENT_OPERATOR') AND p."module" = 'INDUSTRY_DATABASE'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
