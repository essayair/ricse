import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaiinfoCollectorService } from './baiinfo-collector.service';

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
});
