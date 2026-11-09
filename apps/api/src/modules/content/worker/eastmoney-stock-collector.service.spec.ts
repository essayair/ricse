import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { EastmoneyStockCollectorService } from './eastmoney-stock-collector.service';

describe('EastmoneyStockCollectorService', () => {
  const service = new EastmoneyStockCollectorService(mockDeep<PrismaService>());
  const symbols = [
    { id: 's1', market: 'SH', code: '603505' },
    { id: 's2', market: 'SZ', code: '002407' },
    { id: 's3', market: 'HK', code: '00189' },
    { id: 's4', market: 'SZ', code: '300343' },
    { id: 's5', market: 'SH', code: '600000' },
  ];

  it('builds secids with Shanghai, Shenzhen and Hong Kong market prefixes', () => {
    const url = new URL(service.buildUrl(symbols));
    expect(url.searchParams.get('secids')).toBe('1.603505,0.002407,116.00189,0.300343,1.600000');
    expect(url.searchParams.get('fltt')).toBe('2');
  });

  it('rejects an unsupported market', () => {
    expect(() => service.buildUrl([{ market: 'BJ', code: '830000' }])).toThrow('不支持的市场');
  });

  it('parses quotes, marks suspended and missing symbols and derives the Beijing trade date', () => {
    const result = service.parse({
      rc: 0,
      data: {
        diff: [
          { f2: 12.21, f3: -1.29, f4: -0.16, f12: '603505', f13: 1, f14: '金石资源', f18: 12.37, f21: 10276776207, f124: 1794209066 },
          { f2: 9.13, f3: -1.08, f4: -0.1, f12: '00189', f13: 116, f14: '东岳集团', f18: 9.23, f21: 15819657246, f124: 1794209100 },
          { f2: '-', f3: '-', f4: '-', f12: '300343', f13: 0, f14: '联创股份', f18: 4.64, f21: '-', f124: 1794209040 },
          { f2: 22.89, f3: -1.34, f4: -0.31, f12: '002407', f13: 0, f14: '多氟多', f18: 23.2, f21: 24742219795, f124: 1794209085 },
          { f2: 99, f3: 1, f12: '999999', f13: 1, f14: '不在名单', f124: 1794209085 },
        ],
      },
    }, symbols);

    expect(result.quotes.map((item) => item.code)).toEqual(['603505', '00189', '002407']);
    expect(result.quotes[0]).toMatchObject({ symbolId: 's1', name: '金石资源', price: 12.21, changeRate: -1.29, prevClose: 12.37, currency: 'CNY', tradeDate: '2026-11-09' });
    expect(result.quotes[1]).toMatchObject({ currency: 'HKD', floatMarketCap: 15819657246 });
    expect(result.suspended).toEqual(['300343']);
    expect(result.missing).toEqual(['600000']);
  });

  it('uses the Beijing calendar date rather than UTC for the trade date', () => {
    expect(service.shanghaiDate(new Date('2026-11-08T17:30:00.000Z'))).toBe('2026-11-09');
    expect(service.shanghaiDate(new Date('2026-11-09T07:10:00.000Z'))).toBe('2026-11-09');
  });

  it('rejects error responses and malformed payloads', () => {
    expect(() => service.parse({ rc: 102 }, symbols)).toThrow('返回异常状态');
    expect(() => service.parse({ rc: 0, data: null }, symbols)).toThrow('返回格式不是列表');
    expect(() => service.parse(null, symbols)).toThrow('返回异常状态');
  });
});
