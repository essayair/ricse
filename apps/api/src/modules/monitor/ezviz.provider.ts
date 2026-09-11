import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

interface PlatformCredential {
  id: string;
  appKey: string;
  appSecret: string;
  baseUrl: string;
}

interface CachedToken {
  accessToken: string;
  expireTime: number;
}

/**
 * 萤石云开放平台封装。
 *
 * 这是全系统唯一接触 appSecret 的地方：appSecret 只在服务端换取 accessToken 时使用，
 * 不下发给任何前端。accessToken 有效期 7 天，缓存在 Redis 中并提前 1 小时过期重取。
 */
@Injectable()
export class EzvizProvider {
  private readonly logger = new Logger(EzvizProvider.name);
  private readonly redis: IORedis;
  private readonly inflight = new Map<string, Promise<CachedToken>>();

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.get<string>('REDIS_URL') || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  /** 拼接 ezopen 取流地址；验证码缺失时退化为不带验证码的形式。 */
  buildStreamUrl(params: {
    baseUrl: string; deviceSerial: string; channelNo: number; verifyCode?: string | null; quality?: string;
  }) {
    const host = params.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const prefix = params.verifyCode ? `${params.verifyCode}@` : '';
    const quality = params.quality === 'sd' ? 'sd' : 'hd';
    return `ezopen://${prefix}${host}/${params.deviceSerial}/${params.channelNo}.${quality}.live`;
  }

  /** 取 accessToken：优先命中 Redis，未命中则换取并回填。同平台并发只发一次请求。 */
  async getAccessToken(platform: PlatformCredential): Promise<CachedToken> {
    if (!platform.appKey || !platform.appSecret) {
      throw new ServiceUnavailableException('监控平台凭据尚未配置，请在「监控录像 → 平台账号」中录入 appKey 与 appSecret');
    }
    const key = `monitor:ezviz:token:${platform.id}`;
    const cached = await this.readCache(key);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.fetchToken(platform)
      .then(async (token) => {
        await this.writeCache(key, token);
        return token;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  /** 云台控制：direction 8=拉近 9=拉远，与官网现有实现保持一致。 */
  async ptz(platform: PlatformCredential, params: {
    action: 'start' | 'stop'; deviceSerial: string; channelNo: number; direction: number; speed?: number;
  }) {
    const { accessToken } = await this.getAccessToken(platform);
    const body = new URLSearchParams({
      accessToken,
      deviceSerial: params.deviceSerial,
      channelNo: String(params.channelNo),
      direction: String(params.direction),
    });
    if (params.action === 'start') body.set('speed', String(params.speed ?? 4));
    return this.post(platform, `/api/lapp/device/ptz/${params.action}`, body);
  }

  /** 批量查询设备在线状态，返回 deviceSerial → online。 */
  async deviceStatus(platform: PlatformCredential, deviceSerials: string[]) {
    const result = new Map<string, boolean>();
    const { accessToken } = await this.getAccessToken(platform);
    for (const deviceSerial of deviceSerials) {
      try {
        const body = new URLSearchParams({ accessToken, deviceSerial });
        const data = await this.post(platform, '/api/lapp/device/info', body);
        result.set(deviceSerial, Number((data as any)?.status) === 1);
      } catch (error) {
        this.logger.warn(`设备 ${deviceSerial} 状态查询失败：${(error as Error).message}`);
        result.set(deviceSerial, false);
      }
    }
    return result;
  }

  private async fetchToken(platform: PlatformCredential): Promise<CachedToken> {
    const body = new URLSearchParams({ appKey: platform.appKey, appSecret: platform.appSecret });
    const data = await this.post(platform, '/api/lapp/token/get', body);
    const accessToken = (data as any)?.accessToken;
    const expireTime = Number((data as any)?.expireTime);
    if (!accessToken) throw new ServiceUnavailableException('萤石云未返回 accessToken');
    return { accessToken, expireTime: Number.isFinite(expireTime) ? expireTime : Date.now() + 6 * 86400_000 };
  }

  private async post(platform: PlatformCredential, path: string, body: URLSearchParams) {
    const base = (platform.baseUrl || 'https://open.ys7.com').replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(`萤石云请求失败：${(error as Error).message}`);
    }
    if (!response.ok) throw new ServiceUnavailableException(`萤石云 HTTP ${response.status}`);
    const payload: any = await response.json().catch(() => ({}));
    // 萤石成功码为字符串 '200'，其余一律视为失败并透出原始提示。
    if (String(payload?.code) !== '200') {
      throw new ServiceUnavailableException(`萤石云返回 ${payload?.code}：${payload?.msg || '未知错误'}`);
    }
    return payload.data;
  }

  private async readCache(key: string): Promise<CachedToken | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedToken;
      return parsed.expireTime > Date.now() ? parsed : null;
    } catch {
      // Redis 不可用时退化为每次直接换取，不阻断业务。
      return null;
    }
  }

  private async writeCache(key: string, token: CachedToken) {
    // 提前 1 小时失效，避免边界时刻把过期 token 交给播放器。
    const ttl = Math.floor((token.expireTime - Date.now()) / 1000) - 3600;
    if (ttl <= 0) return;
    try {
      await this.redis.set(key, JSON.stringify(token), 'EX', ttl);
    } catch {
      // 缓存写入失败不影响本次取流。
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
