import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaiinfoCollectorService } from './baiinfo-collector.service';
import * as XLSX from 'xlsx';

describe('BaiinfoCollectorService 直连配置', () => {
  const prisma = mockDeep<PrismaService>();
  const config = {
    get: jest.fn(() => undefined),
  } as unknown as ConfigService;
  let service: BaiinfoCollectorService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    service = new BaiinfoCollectorService(config, prisma);
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('未配置百川凭据时明确失败，不再回退旧行情服务', async () => {
    await expect(service.sync()).rejects.toThrow('百川行情直连凭据尚未配置');
    expect(global.fetch).toBe(originalFetch);
  });

  it('导入 Excel 中全部历史日期而非只保存最后一天', async () => {
    const token = jwtWithFutureExpiry();
    (config.get as jest.Mock).mockImplementation((key: string) => ({
      BAIINFO_AUTH: token,
      BAIINFO_COOKIE: 'session=valid',
    })[key]);
    prisma.contentProductType.upsert.mockResolvedValue({ id: 'product-1' } as any);
    prisma.contentProductPrice.upsert.mockResolvedValue({} as any);
    global.fetch = jest.fn().mockResolvedValue(excelResponse([
      ['日期', '市场均价', '华东市场-CaF2≥97%湿粉'],
      ['2026-09-01', 3500, 3700],
      ['2026-09-02', 3520, 3710],
    ]));

    await expect(service.sync()).resolves.toEqual({ saved: 4, markets: 2, businessDate: '2026-09-02' });
    expect(prisma.contentProductPrice.upsert).toHaveBeenCalledTimes(4);
    const calls = prisma.contentProductPrice.upsert.mock.calls.map(([arg]) => arg.create);
    expect(calls.map((item) => new Date(item.businessDate).toISOString().slice(0, 10))).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-01', '2026-09-02',
    ]);
    expect(calls.map((item) => Number(item.changeAmount))).toEqual([0, 20, 0, 10]);
  });

  it('HTTP 200 业务层 token 失效时自动登录并重试', async () => {
    const oldToken = jwtWithFutureExpiry();
    const newToken = jwtWithFutureExpiry();
    (config.get as jest.Mock).mockImplementation((key: string) => ({
      BAIINFO_AUTH: oldToken,
      BAIINFO_COOKIE: 'session=old',
      BAIINFO_USERNAME: 'collector',
      BAIINFO_PASSWORD: 'secret',
    })[key]);
    prisma.contentProductType.upsert.mockResolvedValue({ id: 'product-1' } as any);
    prisma.contentProductPrice.upsert.mockResolvedValue({} as any);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 401, msg: '无效的token' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { access_token: newToken } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(excelResponse([
        ['日期', '市场均价'],
        ['2026-09-03', 3597],
      ]));

    await expect(service.sync()).resolves.toEqual({ saved: 1, markets: 1, businessDate: '2026-09-03' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

function jwtWithFutureExpiry() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString('base64url');
  return `header.${payload}.signature`;
}

function excelResponse(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '行情');
  const body = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
}
