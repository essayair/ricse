import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { BusinessAnalytiqCollectorService } from './business-analytiq-collector.service';

describe('BusinessAnalytiqCollectorService', () => {
  const prisma = mockDeep<PrismaService>();
  const service = new BusinessAnalytiqCollectorService(prisma);

  it('parses the public monthly regional summary', () => {
    const result = service.parse(`
      <h3>Hydrofluoric Acid price August 2026 and outlook (see chart below)</h3>
      <ul>
        <li>North America:US$2.95/KG, 0.3% up</li>
        <li>Europe:US$2.98/KG, 2.1% up</li>
        <li>Northeast Asia:US$2.45/KG, 4.7% up</li>
        <li>Southeast Asia:US$2.88/KG, 5.1% down</li>
      </ul>
    `);
    expect(result.monthLabel).toBe('2026-08');
    expect(result.businessDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(result.rows).toEqual([
      expect.objectContaining({ region: '北美', price: 2.95, changeRate: 0.3, direction: 'up' }),
      expect.objectContaining({ region: '欧洲', price: 2.98 }),
      expect.objectContaining({ region: '东北亚', price: 2.45 }),
      expect.objectContaining({ region: '东南亚', price: 2.88, direction: 'down' }),
    ]);
  });

  it('rejects pages without price rows', () => {
    expect(() => service.parse('<h3>Hydrofluoric Acid price August 2026</h3>')).toThrow('未找到区域价格');
  });

  it('maps legacy regional labels used by historical summaries', () => {
    const result = service.parse(`
      <h3>Hydrofluoric Acid price May 2023 and forecast</h3>
      <ul>
        <li>USA:US$1.81/KG, 2.3% up</li>
        <li>Europe:US$2.26/KG, 6.6% up</li>
        <li>China:US$1.88/KG, 1.1% up</li>
        <li>SEA:US$2.3/KG, 0.4% down</li>
      </ul>
    `);
    expect(result.rows.map((row) => row.region)).toEqual(['北美', '欧洲', '东北亚', '东南亚']);
  });
});
