-- 内容运营中心：资讯、价格、官网咨询、供需、媒体、数据源、任务和微信身份。

CREATE TABLE "content_categories" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_articles" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "categoryId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'NEWS',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "content" TEXT NOT NULL DEFAULT '',
  "coverUrl" TEXT,
  "source" TEXT,
  "sourceHash" TEXT,
  "author" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "publishAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "createdById" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "productName" TEXT,
  "spec" TEXT,
  "quantity" TEXT,
  "priceText" TEXT,
  "region" TEXT,
  "deliveryMethod" TEXT,
  "requirements" TEXT,
  "company" TEXT,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_product_types" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "spec" TEXT,
  "unit" TEXT NOT NULL DEFAULT '元/吨',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_product_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_product_prices" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "productTypeId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "region" TEXT NOT NULL,
  "marketName" TEXT,
  "spec" TEXT,
  "price" DECIMAL(15,4) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '元/吨',
  "changeAmount" DECIMAL(15,4),
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "remark" TEXT,
  "rawData" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_product_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "website_contacts" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT,
  "message" TEXT NOT NULL,
  "sourcePage" TEXT,
  "sourceIp" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "assigneeId" TEXT,
  "followUpNote" TEXT,
  "handledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "website_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supply_demand_posts" (
  "id" TEXT NOT NULL,
  "legacyId" TEXT,
  "type" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "spec" TEXT,
  "quantity" TEXT,
  "priceText" TEXT,
  "region" TEXT,
  "description" TEXT,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "company" TEXT,
  "wechatOpenId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "rejectReason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'USER',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supply_demand_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_assets" (
  "id" TEXT NOT NULL,
  "articleId" TEXT,
  "objectKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'ATTACHMENT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_data_sources" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "schedule" TEXT,
  "config" JSONB,
  "lastSuccessAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_data_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_jobs" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "type" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wechat_identities" (
  "id" TEXT NOT NULL,
  "openId" TEXT NOT NULL,
  "unionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastLogin" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wechat_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_categories_legacyId_key" ON "content_categories"("legacyId");
CREATE UNIQUE INDEX "content_categories_code_key" ON "content_categories"("code");
CREATE INDEX "content_categories_status_sort_idx" ON "content_categories"("status", "sort");
CREATE UNIQUE INDEX "content_articles_legacyId_key" ON "content_articles"("legacyId");
CREATE INDEX "content_articles_type_status_publishAt_idx" ON "content_articles"("type", "status", "publishAt");
CREATE INDEX "content_articles_categoryId_status_idx" ON "content_articles"("categoryId", "status");
CREATE INDEX "content_articles_createdAt_idx" ON "content_articles"("createdAt");
CREATE UNIQUE INDEX "content_product_types_legacyId_key" ON "content_product_types"("legacyId");
CREATE UNIQUE INDEX "content_product_types_code_key" ON "content_product_types"("code");
CREATE INDEX "content_product_types_status_sort_idx" ON "content_product_types"("status", "sort");
CREATE UNIQUE INDEX "content_product_prices_legacyId_key" ON "content_product_prices"("legacyId");
CREATE UNIQUE INDEX "content_product_prices_productTypeId_businessDate_region_source_marketName_key" ON "content_product_prices"("productTypeId", "businessDate", "region", "source", "marketName");
CREATE INDEX "content_product_prices_businessDate_region_idx" ON "content_product_prices"("businessDate", "region");
CREATE INDEX "content_product_prices_productTypeId_businessDate_idx" ON "content_product_prices"("productTypeId", "businessDate");
CREATE UNIQUE INDEX "website_contacts_legacyId_key" ON "website_contacts"("legacyId");
CREATE INDEX "website_contacts_status_createdAt_idx" ON "website_contacts"("status", "createdAt");
CREATE INDEX "website_contacts_phone_idx" ON "website_contacts"("phone");
CREATE UNIQUE INDEX "supply_demand_posts_legacyId_key" ON "supply_demand_posts"("legacyId");
CREATE INDEX "supply_demand_posts_type_status_publishedAt_idx" ON "supply_demand_posts"("type", "status", "publishedAt");
CREATE INDEX "supply_demand_posts_wechatOpenId_createdAt_idx" ON "supply_demand_posts"("wechatOpenId", "createdAt");
CREATE UNIQUE INDEX "content_assets_objectKey_key" ON "content_assets"("objectKey");
CREATE INDEX "content_assets_articleId_purpose_idx" ON "content_assets"("articleId", "purpose");
CREATE UNIQUE INDEX "content_data_sources_code_key" ON "content_data_sources"("code");
CREATE INDEX "content_data_sources_status_type_idx" ON "content_data_sources"("status", "type");
CREATE UNIQUE INDEX "content_jobs_businessKey_key" ON "content_jobs"("businessKey");
CREATE INDEX "content_jobs_status_scheduledAt_idx" ON "content_jobs"("status", "scheduledAt");
CREATE INDEX "content_jobs_sourceId_createdAt_idx" ON "content_jobs"("sourceId", "createdAt");
CREATE UNIQUE INDEX "wechat_identities_openId_key" ON "wechat_identities"("openId");
CREATE INDEX "wechat_identities_unionId_idx" ON "wechat_identities"("unionId");

ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_product_prices" ADD CONSTRAINT "content_product_prices_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "content_product_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "content_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "name", "module", "action", "createdAt", "updatedAt") VALUES
  ('perm_content_article_view', 'content.article.view', '查看资讯', 'CONTENT', 'ARTICLE_VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_article_manage', 'content.article.manage', '管理资讯与栏目', 'CONTENT', 'ARTICLE_MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_article_publish', 'content.article.publish', '发布与下线资讯', 'CONTENT', 'ARTICLE_PUBLISH', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_article_delete', 'content.article.delete', '删除资讯草稿', 'CONTENT', 'ARTICLE_DELETE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_supply_view', 'content.supply-demand.view', '查看供需信息', 'CONTENT', 'SUPPLY_VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_supply_review', 'content.supply-demand.review', '审核供需信息', 'CONTENT', 'SUPPLY_REVIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_price_view', 'content.price.view', '查看价格行情', 'CONTENT', 'PRICE_VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_price_manage', 'content.price.manage', '管理价格行情', 'CONTENT', 'PRICE_MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_contact_view', 'content.contact.view', '查看官网咨询', 'CONTENT', 'CONTACT_VIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_contact_manage', 'content.contact.manage', '处理官网咨询', 'CONTENT', 'CONTACT_MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_datasource_manage', 'content.datasource.manage', '管理内容数据源', 'CONTENT', 'DATASOURCE_MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_content_collection_manage', 'content.collection.manage', '管理采集与AI任务', 'CONTENT', 'COLLECTION_MANAGE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module", "action" = EXCLUDED."action", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "roles" ("id", "code", "name", "description", "type", "status", "isSystem", "sort", "createdAt", "updatedAt") VALUES
  ('role_content_operator', 'CONTENT_OPERATOR', '内容运营', '负责官网、小程序资讯、供需、价格、咨询及采集任务运营', 'BUSINESS', 'ACTIVE', true, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "status" = 'ACTIVE', "isSystem" = true, "sort" = EXCLUDED."sort", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('ADMIN', 'CONTENT_OPERATOR') AND p."module" = 'CONTENT'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "content_data_sources" ("id", "code", "name", "type", "status", "schedule", "createdAt", "updatedAt") VALUES
  ('content_source_legacy_news', 'LEGACY_NEWS', '旧官网资讯', 'API', 'ACTIVE', '*/30 * * * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_source_baiinfo', 'BAIINFO_FLUORITE', '百川萤石行情', 'BAIINFO', 'ACTIVE', '0 6 * * *', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_source_manual_excel', 'FLUORITE_EXCEL', '萤石产业数据文件', 'EXCEL', 'ACTIVE', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
