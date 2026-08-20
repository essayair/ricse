import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class PublicRateLimitService implements OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.get<string>('REDIS_URL') || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  async assert(scope: string, identity: string | undefined, limit: number, seconds: number) {
    const normalized = (identity || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 150);
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = `content:rate:${scope}:${normalized}:${bucket}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, seconds + 5);
      if (count > limit) throw new HttpException('操作过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    } catch (error) {
      // Redis 故障不能拖垮公开内容读取；但已明确触发限流时必须继续拦截。
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
    }
  }

  async onModuleDestroy() { await this.redis.quit(); }
}
