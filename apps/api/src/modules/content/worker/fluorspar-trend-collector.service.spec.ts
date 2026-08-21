import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { FluorsparTrendCollectorService } from './fluorspar-trend-collector.service';

describe('FluorsparTrendCollectorService', () => {
  const service = new FluorsparTrendCollectorService(mockDeep<PrismaService>());

  it('normalizes, sorts and deduplicates source points using the last same-day value', () => {
    expect(service.parse([
      ['2026-08-20', '504.02'],
      ['invalid', '500'],
      ['2026-08-19', '502.94'],
      ['2026-08-20', '504.41'],
    ])).toEqual([
      { date: '2026-08-19', price: 502.94 },
      { date: '2026-08-20', price: 504.41 },
    ]);
  });

  it('rejects an empty or invalid payload', () => {
    expect(() => service.parse({})).toThrow('返回格式不是数组');
    expect(() => service.parse([['bad', 'bad']])).toThrow('未返回有效趋势数据');
  });
});
