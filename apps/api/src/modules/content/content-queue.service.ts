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
    await this.queue.removeJobScheduler('schedule-news-sync');
    await this.queue.upsertJobScheduler(
      'schedule-market-sync',
      { pattern: process.env.MARKET_SYNC_CRON || '0 6 * * *' },
      {
        name: 'MARKET_SYNC',
        data: { type: 'MARKET_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
    await this.queue.upsertJobScheduler(
      'schedule-hf-market-sync',
      { pattern: process.env.HF_MARKET_SYNC_CRON || '15 6 * * *' },
      {
        name: 'HF_MARKET_SYNC',
        data: { type: 'HF_MARKET_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
    await this.queue.upsertJobScheduler(
      'schedule-fluorspar-trend-sync',
      { pattern: process.env.FLUORSPAR_TREND_SYNC_CRON || '5 6 * * *' },
      {
        name: 'FLUORSPAR_TREND_SYNC',
        data: { type: 'FLUORSPAR_TREND_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
  }

  async enqueueStartupSyncs() {
    await this.queue.add('MARKET_SYNC', {
      type: 'MARKET_SYNC', startup: true,
    }, {
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 20, removeOnFail: 50,
    });
    await this.queue.add('HF_MARKET_SYNC', {
      type: 'HF_MARKET_SYNC', startup: true,
    }, {
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 20, removeOnFail: 50,
    });
    await this.queue.add('FLUORSPAR_TREND_SYNC', {
      type: 'FLUORSPAR_TREND_SYNC', startup: true,
    }, {
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 20, removeOnFail: 50,
    });
    this.logger.log('已加入启动行情同步任务');
  }

  connectionOptions() { return this.connection; }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
