import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import IORedis from 'ioredis';

export interface LoginAttempt {
  accountKey?: string;
  ipKey?: string;
}

/**
 * 登录失败限制：同一账号或同一来源 IP 在窗口期内失败次数达到上限后，直接拒绝登录，不再比对密码。
 * 每次登录先原子占用一次计数再比对，避免并发请求同时绕过上限；登录成功后清除账号计数并归还 IP 计数。
 * Redis 故障时放行登录，避免因限流组件异常导致全员无法登录。
 */
@Injectable()
export class LoginThrottleService implements OnModuleDestroy {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly redis: IORedis;
  private readonly accountLimit: number;
  private readonly ipLimit: number;
  private readonly windowSeconds: number;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.get<string>('REDIS_URL') || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    this.redis.on('error', () => undefined);
    const positive = (key: string, fallback: number) => {
      const value = Number(config.get<string>(key));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    };
    this.accountLimit = positive('LOGIN_MAX_FAILURES_PER_ACCOUNT', 5);
    this.ipLimit = positive('LOGIN_MAX_FAILURES_PER_IP', 20);
    this.windowSeconds = positive('LOGIN_LOCK_MINUTES', 15) * 60;
  }

  /** 账号键用已解析的用户 ID，用户名和手机号登录同一账号时共享计数；账号不存在时按输入的标识计数。 */
  accountKey(userId: string | undefined, identifier: string) {
    if (userId) return `auth:login:fail:user:${userId}`;
    const digest = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
    return `auth:login:fail:identifier:${digest}`;
  }

  async acquire(accountKey: string, ip?: string): Promise<LoginAttempt> {
    const ipKey = ip ? `auth:login:fail:ip:${ip.replace(/[^a-fA-F0-9:.]/g, '_').slice(0, 64)}` : undefined;
    const keys = [accountKey, ...(ipKey ? [ipKey] : [])];
    let counts: number[];
    try {
      const multi = this.redis.multi();
      for (const key of keys) multi.incr(key).expire(key, this.windowSeconds, 'NX');
      const results = (await multi.exec()) || [];
      counts = keys.map((_, index) => Number(results[index * 2]?.[1] ?? 0));
    } catch (error) {
      this.logger.warn(`登录限流计数不可用，本次放行：${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
    const blockedKey = counts[0] > this.accountLimit ? accountKey : ipKey && counts[1] > this.ipLimit ? ipKey : undefined;
    if (blockedKey) {
      const ttl = await this.redis.ttl(blockedKey).catch(() => this.windowSeconds);
      const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : this.windowSeconds) / 60));
      throw new HttpException(`登录失败次数过多，请 ${minutes} 分钟后再试`, HttpStatus.TOO_MANY_REQUESTS);
    }
    return { accountKey, ipKey };
  }

  async succeed(attempt: LoginAttempt) {
    try {
      if (attempt.accountKey) await this.redis.del(attempt.accountKey);
      if (attempt.ipKey) {
        const remaining = await this.redis.decr(attempt.ipKey);
        if (remaining <= 0) await this.redis.del(attempt.ipKey);
      }
    } catch (error) {
      this.logger.warn(`登录限流计数清理失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleDestroy() {
    if (this.redis.status === 'wait') this.redis.disconnect();
    else await this.redis.quit().catch(() => undefined);
  }
}
