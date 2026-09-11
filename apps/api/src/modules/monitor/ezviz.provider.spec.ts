import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EzvizProvider } from './ezviz.provider';

// ioredis 在单测中不连接真实服务，缓存读写退化为空操作。
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  quit: jest.fn().mockResolvedValue('OK'),
})));

describe('EzvizProvider', () => {
  const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService;
  let provider: EzvizProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new EzvizProvider(config);
  });

  describe('buildStreamUrl', () => {
    it('按设备序列号、通道号和验证码拼接 ezopen 地址', () => {
      expect(provider.buildStreamUrl({
        baseUrl: 'https://open.ys7.com', deviceSerial: 'GK9665972', channelNo: 3,
        verifyCode: 'Kd147258', quality: 'hd',
      })).toBe('ezopen://Kd147258@open.ys7.com/GK9665972/3.hd.live');
    });

    it('缺少验证码时退化为不带验证码的地址', () => {
      expect(provider.buildStreamUrl({
        baseUrl: 'https://open.ys7.com', deviceSerial: 'GQ5318124', channelNo: 1,
      })).toBe('ezopen://open.ys7.com/GQ5318124/1.hd.live');
    });

    it('清晰度只接受 hd 与 sd，其余回落到 hd', () => {
      expect(provider.buildStreamUrl({
        baseUrl: 'https://open.ys7.com/', deviceSerial: 'GQ5318128', channelNo: 5, quality: '4k',
      })).toBe('ezopen://open.ys7.com/GQ5318128/5.hd.live');
    });
  });

  describe('getAccessToken', () => {
    const platform = { id: 'p1', appKey: 'key', appSecret: 'secret', baseUrl: 'https://open.ys7.com' };

    it('凭据缺失时明确失败，不发起请求', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(provider.getAccessToken({ ...platform, appSecret: '' }))
        .rejects.toThrow('监控平台凭据尚未配置');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('萤石返回非 200 业务码时透出原始提示', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true, json: async () => ({ code: '10002', msg: 'appKey不存在' }),
      } as any);

      await expect(provider.getAccessToken(platform))
        .rejects.toThrow('萤石云返回 10002：appKey不存在');
    });

    it('同一平台并发取 token 只发起一次换取', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ code: '200', data: { accessToken: 'at-1', expireTime: Date.now() + 7 * 86400_000 } }),
      } as any);

      const [first, second] = await Promise.all([
        provider.getAccessToken(platform),
        provider.getAccessToken(platform),
      ]);

      expect(first.accessToken).toBe('at-1');
      expect(second.accessToken).toBe('at-1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('网络异常包装为服务不可用', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ETIMEDOUT'));
      await expect(provider.getAccessToken(platform)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
