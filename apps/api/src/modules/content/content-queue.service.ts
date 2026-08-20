import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const CONTENT_QUEUE = 'ricse-content-jobs';

@Injectable()
export class ContentQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ContentQueueService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
    this.queue = new Queue(CONTENT_QUEUE, { connection: this.connection });
  }

  async enqueue(contentJobId: string, type: string, payload?: Record<string, unknown>, scheduledAt?: Date) {
    const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;
    await this.queue.add(type, { contentJobId, type, payload: payload || {} }, {
      jobId: contentJobId,
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    this.logger.log(`内容任务已入队 id=${contentJobId} type=${type}`);
  }

  async registerSchedules() {
    await this.queue.upsertJobScheduler(
      'schedule-news-sync',
      { pattern: process.env.NEWS_SYNC_CRON || '*/30 * * * *' },
      {
        name: 'NEWS_SYNC',
        data: { type: 'NEWS_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
    await this.queue.upsertJobScheduler(
      'schedule-market-sync',
      { pattern: process.env.MARKET_SYNC_CRON || '0 6 * * *' },
      {
        name: 'MARKET_SYNC',
        data: { type: 'MARKET_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
  }

  async enqueueStartupSyncs() {
    const newsPages = Math.min(100, Math.max(1, Number(process.env.NEWS_INITIAL_SYNC_PAGES || 20)));
    await this.queue.add('NEWS_SYNC', {
      type: 'NEWS_SYNC', startup: true, payload: { pageCount: newsPages },
    }, {
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 20, removeOnFail: 50,
    });
    await this.queue.add('MARKET_SYNC', {
      type: 'MARKET_SYNC', startup: true,
    }, {
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 20, removeOnFail: 50,
    });
    this.logger.log(`已加入启动同步任务，历史资讯扫描页数=${newsPages}`);
  }

  connectionOptions() { return this.connection; }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
