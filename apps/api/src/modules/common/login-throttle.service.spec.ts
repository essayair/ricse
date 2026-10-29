import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const store = new Map<string, { value: number; ttl: number }>();
let redisDown = false;

jest.mock('ioredis', () => jest.fn().mockImplementation(() => {
  const ensureUp = () => { if (redisDown) throw new Error('connect ECONNREFUSED'); };
  return {
    status: 'ready',
    on: jest.fn(),
    multi: () => {
      const ops: Array<() => unknown> = [];
      const chain = {
        incr: (key: string) => { ops.push(() => { const item = store.get(key) || { value: 0, ttl: -1 }; item.value += 1; store.set(key, item); return item.value; }); return chain; },
        expire: (key: string, seconds: number) => { ops.push(() => { const item = store.get(key)!; if (item.ttl < 0) item.ttl = seconds; return 1; }); return chain; },
        exec: async () => { ensureUp(); return ops.map((op) => [null, op()]); },
      };
      return chain;
    },
    ttl: async (key: string) => store.get(key)?.ttl ?? -2,
    del: async (key: string) => { ensureUp(); store.delete(key); return 1; },
    decr: async (key: string) => { const item = store.get(key) || { value: 0, ttl: -1 }; item.value -= 1; store.set(key, item); return item.value; },
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  };
}));

import { LoginThrottleService } from './login-throttle.service';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('LoginThrottleService', () => {
  beforeEach(() => { store.clear(); redisDown = false; });

  it('同一账号连续失败达到上限后锁定，提示剩余分钟数', async () => {
    const throttle = new LoginThrottleService(config({ LOGIN_MAX_FAILURES_PER_ACCOUNT: '3' }));
    const key = throttle.accountKey('user-1', 'zhangsan');
    for (let i = 0; i < 3; i++) await throttle.acquire(key, '1.1.1.1');
    await expect(throttle.acquire(key, '1.1.1.1')).rejects.toThrow('登录失败次数过多，请 15 分钟后再试');
  });

  it('并发登录先占用计数，同时到达的请求也不能超过上限', async () => {
    const throttle = new LoginThrottleService(config({ LOGIN_MAX_FAILURES_PER_ACCOUNT: '5' }));
    const key = throttle.accountKey('user-1', 'zhangsan');
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => throttle.acquire(key, `10.0.0.${i}`)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'rejected' && (r.reason as HttpException).getStatus() === 429)).toHaveLength(15);
  });

  it('同一 IP 对多个账号失败达到上限后限制该 IP', async () => {
    const throttle = new LoginThrottleService(config({ LOGIN_MAX_FAILURES_PER_IP: '4' }));
    for (let i = 0; i < 4; i++) await throttle.acquire(throttle.accountKey(undefined, `user${i}`), '2.2.2.2');
    await expect(throttle.acquire(throttle.accountKey(undefined, 'another'), '2.2.2.2')).rejects.toThrow(HttpException);
    await expect(throttle.acquire(throttle.accountKey(undefined, 'another'), '3.3.3.3')).resolves.toBeDefined();
  });

  it('登录成功清除账号计数并归还 IP 计数，成功登录不累计到 IP', async () => {
    const throttle = new LoginThrottleService(config({ LOGIN_MAX_FAILURES_PER_ACCOUNT: '2', LOGIN_MAX_FAILURES_PER_IP: '2' }));
    const key = throttle.accountKey('user-1', 'zhangsan');
    for (let i = 0; i < 10; i++) await throttle.succeed(await throttle.acquire(key, '4.4.4.4'));
    await expect(throttle.acquire(key, '4.4.4.4')).resolves.toBeDefined();
  });

  it('用户名与手机号登录同一账号时共享计数；不存在的标识按输入计数且不区分大小写', () => {
    const throttle = new LoginThrottleService(config());
    expect(throttle.accountKey('user-1', 'zhangsan')).toBe(throttle.accountKey('user-1', '13800138000'));
    expect(throttle.accountKey(undefined, ' NoBody ')).toBe(throttle.accountKey(undefined, 'nobody'));
  });

  it('Redis 不可用时放行登录，不因限流组件故障锁死所有账号', async () => {
    const throttle = new LoginThrottleService(config());
    redisDown = true;
    await expect(throttle.acquire(throttle.accountKey('user-1', 'x'), '5.5.5.5')).resolves.toEqual({});
    await expect(throttle.succeed({ accountKey: 'k' })).resolves.toBeUndefined();
  });
});
