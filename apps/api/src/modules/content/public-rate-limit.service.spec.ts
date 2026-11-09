import { ConfigService } from '@nestjs/config';
import { PublicRateLimitService } from './public-rate-limit.service';
const redis = { on: jest.fn(), eval: jest.fn(), set: jest.fn(), exists: jest.fn(), quit: jest.fn(), disconnect: jest.fn(), status: 'wait' };
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => redis) }));

describe('公开写入限流与去重存储', () => {
  let rate: PublicRateLimitService;
  beforeEach(() => { jest.clearAllMocks(); rate = new PublicRateLimitService({ get: () => undefined } as unknown as ConfigService); });
  it('用原子Lua设置计数和过期；Redis键不保存明文手机号', async () => {
    redis.eval.mockResolvedValue(1); await rate.assert('contact', '13800000000', 5, 3600, true);
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('EXPIRE'"), 1, expect.stringMatching(/^content:public:contact:[a-f0-9]{64}$/), 3600);
    expect(redis.eval.mock.calls[0][2]).not.toContain('13800000000');
    redis.eval.mockResolvedValue(6); await expect(rate.assert('contact', 'ip', 5, 3600, true)).rejects.toMatchObject({ status: 429 });
  });
  it('严格匿名写入Redis故障返回503；旧调用保留原兼容行为', async () => {
    redis.eval.mockRejectedValue(new Error('redis unavailable'));
    await expect(rate.assert('contact', 'ip', 5, 3600, true)).rejects.toMatchObject({ status: 503 });
    await expect(rate.assert('legacy', 'ip', 5, 3600)).resolves.toBeUndefined();
  });
  it('异常计数不能当作限流成功', async () => {
    redis.eval.mockResolvedValue(null);
    await expect(rate.assert('contact', 'ip', 5, 3600, true)).rejects.toMatchObject({ status: 503 });
  });
  it('去重锁使用SET NX EX，释放时核对所有者', async () => {
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    expect(await rate.claim('pending', 'same', 'owner', 60)).toBe(true);
    expect(await rate.claim('pending', 'same', 'other', 60)).toBe(false);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), 'owner', 'EX', 60, 'NX');
    await rate.release('pending', 'same', 'owner');
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET'"), 1, expect.any(String), 'owner');
  });
  it('去重存储故障拒绝处理，不降级为可以继续写入', async () => {
    redis.exists.mockRejectedValue(new Error('down')); redis.set.mockRejectedValue(new Error('down'));
    await expect(rate.has('accepted', 'data')).rejects.toMatchObject({ status: 503 });
    await expect(rate.claim('nonce', 'data', 'owner', 60)).rejects.toMatchObject({ status: 503 });
  });
});
