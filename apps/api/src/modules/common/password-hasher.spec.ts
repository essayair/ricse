import * as bcrypt from 'bcryptjs';
import { comparePassword, hashPassword, TIMING_EQUALIZER_HASH } from './password-hasher';

describe('password-hasher', () => {
  it('工作线程生成的哈希与 bcryptjs 互相兼容', async () => {
    const hashed = await hashPassword('secret-123');
    expect(bcrypt.getRounds(hashed)).toBe(10);
    await expect(bcrypt.compare('secret-123', hashed)).resolves.toBe(true);
    await expect(comparePassword('secret-123', await bcrypt.hash('secret-123', 4))).resolves.toBe(true);
    await expect(comparePassword('wrong', hashed)).resolves.toBe(false);
  });

  it('并发请求排队执行且结果各自对应', async () => {
    const hashed = await bcrypt.hash('p', 4);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => comparePassword(i % 2 ? 'p' : 'x', hashed)));
    expect(results).toEqual([false, true, false, true, false, true]);
  });

  it('非法哈希与原主线程实现一致返回不匹配', async () => {
    await expect(comparePassword('p', 'not-a-hash')).resolves.toBe(false);
  });

  it('等耗时比对用的固定哈希与真实密码成本一致，且不匹配任何常见输入', async () => {
    expect(bcrypt.getRounds(TIMING_EQUALIZER_HASH)).toBe(10);
    await expect(comparePassword('', TIMING_EQUALIZER_HASH)).resolves.toBe(false);
  });
});
