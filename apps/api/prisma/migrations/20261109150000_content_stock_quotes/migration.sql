-- CreateTable
CREATE TABLE "content_stock_symbols" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_stock_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_stock_quotes" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "tradeDate" DATE NOT NULL,
    "quoteTime" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(15,4) NOT NULL,
    "prevClose" DECIMAL(15,4),
    "changeAmount" DECIMAL(15,4),
    "changeRate" DECIMAL(9,4) NOT NULL,
    "floatMarketCap" DECIMAL(20,2),
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "source" TEXT NOT NULL DEFAULT 'EASTMONEY',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_stock_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_stock_symbols_status_sort_idx" ON "content_stock_symbols"("status", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "content_stock_symbols_market_code_key" ON "content_stock_symbols"("market", "code");

-- CreateIndex
CREATE INDEX "content_stock_quotes_tradeDate_idx" ON "content_stock_quotes"("tradeDate");

-- CreateIndex
CREATE UNIQUE INDEX "content_stock_quotes_symbolId_tradeDate_source_key" ON "content_stock_quotes"("symbolId", "tradeDate", "source");

-- AddForeignKey
ALTER TABLE "content_stock_quotes" ADD CONSTRAINT "content_stock_quotes_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "content_stock_symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 东方财富股票行情数据源：交易日 11:35（午间收盘）和 15:10（收盘后）各采集一次
INSERT INTO "content_data_sources" (
  "id", "code", "name", "type", "status", "schedule", "config", "createdAt", "updatedAt"
) VALUES (
  'content_source_eastmoney_stock_quote',
  'EASTMONEY_STOCK_QUOTE',
  '东方财富萤石成分股行情',
  'API',
  'ACTIVE',
  '35 11 * * 1-5 / 10 15 * * 1-5',
  '{"pageUrl":"https://quote.eastmoney.com/","endpoint":"https://push2.eastmoney.com/api/qt/ulist.np/get","fields":"最新价、涨跌幅、流通市值","note":"仅展示午间与收盘数据，不提供实时行情"}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "schedule" = EXCLUDED."schedule",
  "config" = EXCLUDED."config",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 初始成分股名单（沿用官网“萤石/氟化工概念股”名单，可在后台调整）
INSERT INTO "content_stock_symbols" ("id", "market", "code", "name", "tag", "sort", "status", "createdAt", "updatedAt") VALUES
  ('content_stock_sh_603505', 'SH', '603505', '金石资源', '核心萤石', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sh_600160', 'SH', '600160', '巨化股份', '氟化工', 20, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sz_002407', 'SZ', '002407', '多氟多', '氟化盐', 30, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sh_605020', 'SH', '605020', '永和股份', '氟聚合物', 40, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sz_002915', 'SZ', '002915', '中欣氟材', '氟材料', 50, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sh_600378', 'SH', '600378', '昊华科技', '氟化工', 60, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sz_300343', 'SZ', '300343', '联创股份', '含氟聚合物', 70, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sz_000830', 'SZ', '000830', '鲁西化工', '氟化工', 80, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_hk_00189', 'HK', '00189', '东岳集团', '氟聚合物', 90, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sh_688548', 'SH', '688548', '广钢气体', '电子特气', 100, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('content_stock_sz_002549', 'SZ', '002549', '凯美特气', '氟气体', 110, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("market", "code") DO NOTHING;
