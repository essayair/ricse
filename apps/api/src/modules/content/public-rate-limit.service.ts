import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { createHash } from 'node:crypto';

@Injectable()
export class PublicRateLimitService implements OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly logger = new Logger(PublicRateLimitService.name);

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.get<string>('REDIS_URL') || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    this.redis.on('error', () => undefined);
  }

  private key(scope: string, identity: string | undefined) {
    return `content:public:${scope}:${createHash('sha256').update(identity || 'unknown').digest('hex')}`;
  }

  private unavailable(scope: string): never {
    this.logger.warn(`公开写入防护不可用：${scope}`);
    throw new ServiceUnavailableException('提交服务暂时不可用，请稍后再试');
  }

  async assert(scope: string, identity: string | undefined, limit: number, seconds: number, strict = false) {
    try {
      // 原子设置计数及过期，避免并发/进程中断留下无过期计数；窗口从首次请求起算。
      const count = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, this.key(scope, identity), seconds));
      if (!Number.isInteger(count) || count <= 0) throw new Error('Invalid limiter count');
      if (count > limit) throw new HttpException('操作过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
      // 兼容既有调用；新的匿名写入明确要求strict，存储防护故障时不再无条件放行。
      if (strict) this.unavailable(scope);
    }
  }

  async has(scope: string, identity: string) {
    try { return (await this.redis.exists(this.key(scope, identity))) === 1; }
    catch { return this.unavailable(scope); }
  }

  async claim(scope: string, identity: string, owner: string, seconds: number) {
    try { return await this.redis.set(this.key(scope, identity), owner, 'EX', seconds, 'NX') === 'OK'; }
    catch { return this.unavailable(scope); }
  }

  async remember(scope: string, identity: string, seconds: number) {
    try { await this.redis.set(this.key(scope, identity), '1', 'EX', seconds); }
    catch { this.unavailable(scope); }
  }

  async release(scope: string, identity: string, owner: string) {
    try { await this.redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, this.key(scope, identity), owner); }
    catch { this.logger.warn(`公开写入临时锁清理失败：${scope}`); }
  }

  async onModuleDestroy() {
    if (this.redis.status === 'wait') this.redis.disconnect();
    else await this.redis.quit().catch(() => undefined);
  }
}
