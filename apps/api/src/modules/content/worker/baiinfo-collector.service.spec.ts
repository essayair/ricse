import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaiinfoCollectorService } from './baiinfo-collector.service';

describe('BaiinfoCollectorService 历史行情兼容', () => {
  const prisma = mockDeep<PrismaService>();
  const config = {
    get: jest.fn((key: string) => key === 'LEGACY_MARKET_API_BASE' ? 'http://legacy-market' : undefined),
  } as unknown as ConfigService;
  let service: BaiinfoCollectorService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    service = new BaiinfoCollectorService(config, prisma);
    prisma.contentProductType.upsert.mockResolvedValue({ id: 'product-1' } as any);
    prisma.contentProductPrice.upsert.mockResolvedValue({ id: 'price-1' } as any);
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('未配置百川凭据时从旧行情接口幂等回填历史走势', async () => {
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/regions')) {
        return new Response(JSON.stringify([{
          region: '-', province: '-', marketName: '市场均价', shortName: '市场均价',
          price: 3534, date: '2026-08-20', change: 10, unit: '元/吨',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        marketName: '市场均价', shortName: '市场均价', region: '-', province: '-', unit: '元/吨',
        points: [{ date: '2026-08-19', price: 3524 }, { date: '2026-08-20', price: 3534 }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const result = await service.sync();

    expect(result).toEqual({ saved: 2, markets: 1, source: 'LEGACY_MARKET_API' });
    expect(prisma.contentProductPrice.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.contentProductPrice.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        productTypeId: 'product-1', marketName: '市场均价', source: 'BAIINFO',
      }),
    }));
  });
});
