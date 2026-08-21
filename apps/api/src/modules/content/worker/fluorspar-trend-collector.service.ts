import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const PRODUCT_CODE = 'FLUORSPAR_TREND_INDEX';
const SOURCES = [
  { region: '华中', db: 'cn_vp', url: 'https://fluorspar.com/wp-content/themes/classy-news/inc/getdata.php?type=year&db=cn_vp' },
  { region: '华东', db: 'eu_fv', url: 'https://fluorspar.com/wp-content/themes/classy-news/inc/getdata.php?type=year&db=eu_fv' },
  { region: '北方', db: 'eu_vp', url: 'https://fluorspar.com/wp-content/themes/classy-news/inc/getdata.php?type=year&db=eu_vp' },
] as const;

interface TrendPoint { date: string; price: number }

@Injectable()
export class FluorsparTrendCollectorService {
  private readonly logger = new Logger(FluorsparTrendCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sync() {
    const product = await this.prisma.contentProductType.upsert({
      where: { code: PRODUCT_CODE },
      update: { name: '萤石价格趋势指数', spec: 'fluorspar.com 区域年度趋势', unit: '美元/吨', status: 'ACTIVE' },
      create: { code: PRODUCT_CODE, name: '萤石价格趋势指数', spec: 'fluorspar.com 区域年度趋势', unit: '美元/吨', sort: 15, status: 'ACTIVE' },
    });
    const result: Array<{ region: string; saved: number; latestDate: string | null; error?: string }> = [];

    for (const source of SOURCES) {
      try {
        const response = await fetch(source.url, {
          headers: { accept: 'application/json', 'user-agent': 'RICSE-Content-Worker/1.0 (+https://hgyunlian.com)' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const points = this.parse(await response.json());
        for (let offset = 0; offset < points.length; offset += 50) {
          const batch = points.slice(offset, offset + 50);
          await Promise.all(batch.map((point, index) => {
            const absoluteIndex = offset + index;
            const previous = absoluteIndex > 0 ? points[absoluteIndex - 1].price : point.price;
            const change = point.price - previous;
            const changeRate = previous ? Number(((change / previous) * 100).toFixed(2)) : 0;
            const rawData: Prisma.InputJsonValue = {
              sourceUrl: source.url, sourceDb: source.db, changeRate,
              qualityFlag: Math.abs(changeRate) >= 10 ? 'LARGE_CHANGE' : null,
              collectedAt: new Date().toISOString(),
            };
            const businessDate = new Date(`${point.date}T00:00:00.000Z`);
            return this.prisma.contentProductPrice.upsert({
              where: { productTypeId_businessDate_region_source_marketName: {
                productTypeId: product.id, businessDate, region: source.region,
                source: 'FLUORSPAR_COM', marketName: source.region,
              } },
              update: { price: new Prisma.Decimal(point.price), changeAmount: new Prisma.Decimal(change.toFixed(4)), rawData },
              create: {
                productTypeId: product.id, businessDate, region: source.region, marketName: source.region,
                spec: '区域价格趋势', price: new Prisma.Decimal(point.price), unit: '美元/吨',
                changeAmount: new Prisma.Decimal(change.toFixed(4)), source: 'FLUORSPAR_COM',
                remark: 'fluorspar.com 年度区域价格趋势', rawData,
              },
            });
          }));
        }
        result.push({ region: source.region, saved: points.length, latestDate: points.at(-1)?.date || null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.push({ region: source.region, saved: 0, latestDate: null, error: message });
        this.logger.warn(`萤石趋势采集失败 region=${source.region}: ${message}`);
      }
    }
    if (result.every((item) => item.error)) throw new ServiceUnavailableException('fluorspar.com 三个区域趋势均采集失败');
    const saved = result.reduce((total, item) => total + item.saved, 0);
    this.logger.log(`萤石区域趋势采集完成 saved=${saved}`);
    return { saved, source: 'FLUORSPAR_COM', regions: result };
  }

  parse(payload: unknown): TrendPoint[] {
    if (!Array.isArray(payload)) throw new ServiceUnavailableException('fluorspar.com 返回格式不是数组');
    const unique = new Map<string, number>();
    for (const row of payload) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const date = String(row[0]);
      const price = Number(row[1]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price < 0) continue;
      const parsedDate = new Date(`${date}T00:00:00.000Z`);
      if (!Number.isFinite(parsedDate.getTime()) || parsedDate.getTime() > Date.now() + 86400000) continue;
      unique.set(date, price);
    }
    const points = [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, price]) => ({ date, price }));
    if (!points.length) throw new ServiceUnavailableException('fluorspar.com 未返回有效趋势数据');
    return points;
  }
}
