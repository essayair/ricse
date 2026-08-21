import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const SOURCE_URL = 'https://businessanalytiq.com/procurementanalytics/index/hydrofluoric-acid-price-index/';
const PRODUCT_CODE = 'HYDROFLUORIC_ACID';

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const REGION_NAMES: Record<string, string> = {
  'North America': '北美', USA: '北美', Europe: '欧洲',
  'Northeast Asia': '东北亚', China: '东北亚', 'Southeast Asia': '东南亚', SEA: '东南亚',
};

const HISTORICAL_SNAPSHOTS = [
  {
    date: '2023-05-01', archiveTimestamp: '20230606062653',
    prices: { USA: 1.81, Europe: 2.26, China: 1.88, SEA: 2.30 },
  },
  {
    date: '2024-12-01', archiveTimestamp: '20241221185530',
    prices: { 'North America': 2.73, Europe: 2.67, 'Northeast Asia': 1.59, 'Southeast Asia': 2.30 },
  },
  {
    date: '2025-03-01', archiveTimestamp: '20250325154232',
    prices: { 'North America': 2.22, Europe: 2.25, 'Northeast Asia': 1.65, 'Southeast Asia': 2.17 },
  },
  {
    date: '2025-09-01', archiveTimestamp: '20250911092338',
    prices: { 'North America': 2.29, Europe: 2.47, 'Northeast Asia': 1.64, 'Southeast Asia': 2.53 },
  },
  {
    date: '2026-02-01', archiveTimestamp: '20260217091637',
    prices: { 'North America': 2.52, Europe: 2.60, 'Northeast Asia': 1.95, 'Southeast Asia': 2.32 },
  },
] as const;

interface ParsedPrice {
  sourceRegion: string;
  region: string;
  price: number;
  changeRate: number;
  direction: 'up' | 'down';
}

@Injectable()
export class BusinessAnalytiqCollectorService {
  private readonly logger = new Logger(BusinessAnalytiqCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sync() {
    const response = await fetch(SOURCE_URL, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'RICSE-Content-Worker/1.0 (+https://hgyunlian.com)',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Business Analytiq 请求失败：HTTP ${response.status}`);
    const parsed = this.parse(await response.text());
    const product = await this.prisma.contentProductType.upsert({
      where: { code: PRODUCT_CODE },
      update: { name: '国际氢氟酸', spec: '无水氟化氢价格指数', unit: '美元/公斤', status: 'ACTIVE' },
      create: { code: PRODUCT_CODE, name: '国际氢氟酸', spec: '无水氟化氢价格指数', unit: '美元/公斤', sort: 20, status: 'ACTIVE' },
    });

    for (const snapshot of HISTORICAL_SNAPSHOTS) {
      const archiveUrl = `https://web.archive.org/web/${snapshot.archiveTimestamp}id_/${SOURCE_URL}`;
      for (const [sourceRegion, price] of Object.entries(snapshot.prices)) {
        const region = REGION_NAMES[sourceRegion] || sourceRegion;
        const rawData: Prisma.InputJsonValue = {
          sourceUrl: SOURCE_URL,
          archiveUrl,
          sourceRegion,
          historicalBaseline: true,
        };
        await this.prisma.contentProductPrice.upsert({
          where: { productTypeId_businessDate_region_source_marketName: {
            productTypeId: product.id, businessDate: new Date(`${snapshot.date}T00:00:00.000Z`), region,
            source: 'BUSINESS_ANALYTIQ', marketName: region,
          } },
          update: {
            price: new Prisma.Decimal(price), rawData,
            remark: 'Business Analytiq 公开页面历史快照',
          },
          create: {
            productTypeId: product.id, businessDate: new Date(`${snapshot.date}T00:00:00.000Z`), region, marketName: region,
            spec: '区域价格指数', price: new Prisma.Decimal(price), unit: '美元/公斤',
            changeAmount: new Prisma.Decimal(0), source: 'BUSINESS_ANALYTIQ',
            remark: 'Business Analytiq 公开页面历史快照', rawData,
          },
        });
      }
    }

    for (const row of parsed.rows) {
      const previous = row.direction === 'up'
        ? row.price / (1 + row.changeRate / 100)
        : row.price / (1 - row.changeRate / 100);
      const changeAmount = row.price - previous;
      const rawData: Prisma.InputJsonValue = {
        sourceUrl: SOURCE_URL,
        sourceRegion: row.sourceRegion,
        changeRate: row.direction === 'up' ? row.changeRate : -row.changeRate,
        collectedAt: new Date().toISOString(),
      };
      await this.prisma.contentProductPrice.upsert({
        where: { productTypeId_businessDate_region_source_marketName: {
          productTypeId: product.id, businessDate: parsed.businessDate, region: row.region,
          source: 'BUSINESS_ANALYTIQ', marketName: row.region,
        } },
        update: {
          price: new Prisma.Decimal(row.price), changeAmount: new Prisma.Decimal(changeAmount.toFixed(4)),
          rawData, remark: 'Business Analytiq 公开月度价格摘要',
        },
        create: {
          productTypeId: product.id, businessDate: parsed.businessDate, region: row.region, marketName: row.region,
          spec: '区域价格指数', price: new Prisma.Decimal(row.price), unit: '美元/公斤',
          changeAmount: new Prisma.Decimal(changeAmount.toFixed(4)), source: 'BUSINESS_ANALYTIQ',
          remark: 'Business Analytiq 公开月度价格摘要', rawData,
        },
      });
    }
    const historicalSaved = HISTORICAL_SNAPSHOTS.reduce((sum, snapshot) => sum + Object.keys(snapshot.prices).length, 0);
    this.logger.log(`国际氢氟酸价格采集完成 month=${parsed.monthLabel} current=${parsed.rows.length} historical=${historicalSaved}`);
    return { saved: parsed.rows.length + historicalSaved, currentSaved: parsed.rows.length, historicalSaved, month: parsed.monthLabel, source: 'BUSINESS_ANALYTIQ' };
  }

  parse(html: string) {
    const heading = html.match(/Hydrofluoric Acid price\s+([A-Za-z]+)\s+(\d{4})/i);
    if (!heading) throw new ServiceUnavailableException('Business Analytiq 页面中未找到价格月份');
    const month = MONTHS[heading[1].toLowerCase()];
    const year = Number(heading[2]);
    if (!month || !Number.isInteger(year)) throw new ServiceUnavailableException('Business Analytiq 价格月份格式无效');
    const rows: ParsedPrice[] = [];
    const rowPattern = /<li>\s*([^:<]+):\s*US\$\s*([\d.]+)\s*\/\s*KG,\s*([\d.]+)%\s*(up|down)\s*<\/li>/gi;
    for (const match of html.matchAll(rowPattern)) {
      const sourceRegion = match[1].trim();
      const price = Number(match[2]);
      const changeRate = Number(match[3]);
      if (!Number.isFinite(price) || !Number.isFinite(changeRate)) continue;
      rows.push({ sourceRegion, region: REGION_NAMES[sourceRegion] || sourceRegion, price, changeRate, direction: match[4].toLowerCase() as 'up' | 'down' });
    }
    if (!rows.length) throw new ServiceUnavailableException('Business Analytiq 页面中未找到区域价格');
    return {
      businessDate: new Date(Date.UTC(year, month - 1, 1)),
      monthLabel: `${year}-${String(month).padStart(2, '0')}`,
      rows,
    };
  }
}
