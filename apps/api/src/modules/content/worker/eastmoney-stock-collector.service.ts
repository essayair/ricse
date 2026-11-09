import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const EASTMONEY_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const FIELDS = 'f2,f3,f4,f12,f13,f14,f18,f21,f124';
/** 东方财富市场编号：沪市 1、深市 0、港股 116 */
const MARKET_ID: Record<string, number> = { SH: 1, SZ: 0, HK: 116 };

export interface StockSymbolRef { id: string; market: string; code: string }

export interface ParsedStockQuote {
  symbolId: string;
  market: string;
  code: string;
  name: string;
  price: number;
  prevClose: number | null;
  changeAmount: number | null;
  changeRate: number;
  floatMarketCap: number | null;
  currency: 'CNY' | 'HKD';
  quoteTime: Date;
  tradeDate: string;
}

export interface ParseResult {
  quotes: ParsedStockQuote[];
  /** 来源没有返回的股票（代码错误、退市等） */
  missing: string[];
  /** 来源返回但没有有效价格的股票（停牌等） */
  suspended: string[];
}

@Injectable()
export class EastmoneyStockCollectorService {
  private readonly logger = new Logger(EastmoneyStockCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sync() {
    const symbols = await this.prisma.contentStockSymbol.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      select: { id: true, market: true, code: true },
    });
    if (!symbols.length) return { saved: 0, source: 'EASTMONEY', message: '成分股名单为空，未执行采集', missing: [], suspended: [] };

    const url = this.buildUrl(symbols);
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'RICSE-Content-Worker/1.0 (+https://hgyunlian.com)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new ServiceUnavailableException(`东方财富行情接口返回 HTTP ${response.status}`);
    const { quotes, missing, suspended } = this.parse(await response.json(), symbols);
    if (!quotes.length) {
      throw new ServiceUnavailableException(`东方财富未返回任何有效行情（未返回：${missing.join('、') || '无'}；无有效价格：${suspended.join('、') || '无'}）`);
    }

    const collectedAt = new Date().toISOString();
    await this.prisma.$transaction(quotes.map((quote) => {
      const tradeDate = new Date(`${quote.tradeDate}T00:00:00.000Z`);
      const data = {
        quoteTime: quote.quoteTime,
        name: quote.name,
        price: new Prisma.Decimal(quote.price),
        prevClose: quote.prevClose === null ? null : new Prisma.Decimal(quote.prevClose),
        changeAmount: quote.changeAmount === null ? null : new Prisma.Decimal(quote.changeAmount),
        changeRate: new Prisma.Decimal(quote.changeRate),
        floatMarketCap: quote.floatMarketCap === null ? null : new Prisma.Decimal(quote.floatMarketCap),
        currency: quote.currency,
        rawData: { sourceUrl: EASTMONEY_QUOTE_URL, market: quote.market, code: quote.code, collectedAt } as Prisma.InputJsonValue,
      };
      return this.prisma.contentStockQuote.upsert({
        where: { symbolId_tradeDate_source: { symbolId: quote.symbolId, tradeDate, source: 'EASTMONEY' } },
        update: data,
        create: { ...data, symbolId: quote.symbolId, tradeDate, source: 'EASTMONEY' },
      });
    }));

    const latestQuoteTime = quotes.reduce((latest, item) => item.quoteTime > latest ? item.quoteTime : latest, quotes[0].quoteTime);
    this.logger.log(`成分股行情采集完成 saved=${quotes.length} missing=${missing.length} suspended=${suspended.length}`);
    return {
      saved: quotes.length,
      source: 'EASTMONEY',
      quoteTime: latestQuoteTime.toISOString(),
      tradeDates: [...new Set(quotes.map((item) => item.tradeDate))],
      missing,
      suspended,
    };
  }

  buildUrl(symbols: Array<Pick<StockSymbolRef, 'market' | 'code'>>) {
    const secids = symbols.map((item) => {
      const marketId = MARKET_ID[item.market];
      if (marketId === undefined) throw new ServiceUnavailableException(`不支持的市场：${item.market}`);
      return `${marketId}.${item.code}`;
    });
    const params = new URLSearchParams({ fltt: '2', invt: '2', fields: FIELDS, secids: secids.join(',') });
    return `${EASTMONEY_QUOTE_URL}?${params}`;
  }

  parse(payload: unknown, symbols: StockSymbolRef[]): ParseResult {
    const body = payload as { rc?: number; data?: { diff?: unknown } } | null;
    if (!body || body.rc !== 0) throw new ServiceUnavailableException('东方财富行情接口返回异常状态');
    const rows = body.data?.diff;
    if (!Array.isArray(rows)) throw new ServiceUnavailableException('东方财富行情接口返回格式不是列表');

    const byKey = new Map(symbols.map((item) => [`${MARKET_ID[item.market]}.${item.code}`, item]));
    const seen = new Set<string>();
    const quotes: ParsedStockQuote[] = [];
    const suspended: string[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const key = `${row.f13}.${row.f12}`;
      const symbol = byKey.get(key);
      if (!symbol) continue;
      seen.add(key);
      const price = this.number(row.f2);
      const changeRate = this.number(row.f3);
      const timestamp = this.number(row.f124);
      if (price === null || price <= 0 || changeRate === null || timestamp === null || timestamp <= 0) {
        suspended.push(symbol.code);
        continue;
      }
      const quoteTime = new Date(timestamp * 1000);
      quotes.push({
        symbolId: symbol.id,
        market: symbol.market,
        code: symbol.code,
        name: String(row.f14 || symbol.code).trim(),
        price,
        prevClose: this.number(row.f18),
        changeAmount: this.number(row.f4),
        changeRate,
        floatMarketCap: this.number(row.f21),
        currency: symbol.market === 'HK' ? 'HKD' : 'CNY',
        quoteTime,
        tradeDate: this.shanghaiDate(quoteTime),
      });
    }
    const missing = symbols.filter((item) => !seen.has(`${MARKET_ID[item.market]}.${item.code}`)).map((item) => item.code);
    return { quotes, missing, suspended };
  }

  /** 行情所属交易日按北京时间计算，非交易日采到的上一交易日数据会写回同一条快照 */
  shanghaiDate(value: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  }

  private number(value: unknown) {
    if (value === null || value === undefined || value === '' || value === '-') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
