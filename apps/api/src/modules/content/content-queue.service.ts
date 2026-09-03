import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

export const CONTENT_QUEUE = 'ricse-content-jobs';

@Injectable()
export class ContentQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ContentQueueService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
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
    await this.registerNewsSchedules();
    await this.registerBaiinfoSchedule();
    await this.queue.upsertJobScheduler(
      'schedule-hf-market-sync',
      { pattern: process.env.HF_MARKET_SYNC_CRON || '15 6 * * *', tz: process.env.CONTENT_TIMEZONE || 'Asia/Shanghai' },
      {
        name: 'HF_MARKET_SYNC',
        data: { type: 'HF_MARKET_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
    await this.queue.upsertJobScheduler(
      'schedule-fluorspar-trend-sync',
      { pattern: process.env.FLUORSPAR_TREND_SYNC_CRON || '5 6 * * *', tz: process.env.CONTENT_TIMEZONE || 'Asia/Shanghai' },
      {
        name: 'FLUORSPAR_TREND_SYNC',
        data: { type: 'FLUORSPAR_TREND_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
  }

  async registerNewsSchedules() {
    await this.queue.removeJobScheduler('schedule-news-sync');
    const sources = await this.prisma.contentDataSource.findMany({
      where: { OR: [{ code: 'SUNSIRS_FLUORITE_NEWS' }, { type: { in: ['GDELT', 'RSS'] } }] },
      select: { id: true, code: true, status: true, schedule: true },
    });
    for (const source of sources) {
      const schedulerId = `schedule-news-${source.id}`;
      await this.queue.removeJobScheduler(schedulerId);
      if (source.status !== 'ACTIVE') continue;
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: source.schedule || process.env.NEWS_SYNC_CRON || '0 8,12,17 * * *', tz: process.env.CONTENT_TIMEZONE || 'Asia/Shanghai' },
        {
          name: 'NEWS_SYNC',
          data: { type: 'NEWS_SYNC', sourceId: source.id, sourceCode: source.code, scheduled: true },
          opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 50, removeOnFail: 100 },
        },
      );
    }
  }

  async enqueueStartupSyncs() {
    const activeNewsSources = await this.prisma.contentDataSource.count({
      where: { code: 'SUNSIRS_FLUORITE_NEWS', status: 'ACTIVE' },
    });
    if (activeNewsSources) {
      await this.queue.add('NEWS_SYNC', {
        type: 'NEWS_SYNC', startup: true,
      }, {
        attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 50, removeOnFail: 100,
      });
    } else {
      this.logger.warn('未发现已启用且已配置的产业资讯源，跳过启动自动采集');
    }
    if (await this.baiinfoReady()) {
      await this.queue.add('MARKET_SYNC', {
        type: 'MARKET_SYNC', startup: true,
      }, {
        attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 20, removeOnFail: 50,
      });
    } else {
      this.logger.warn('百川行情凭据未配置或数据源未启用，跳过启动自动采集');
    }
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
    this.logger.log('已加入启动资讯与行情同步任务');
  }

  connectionOptions() { return this.connection; }

  private async registerBaiinfoSchedule() {
    await this.queue.removeJobScheduler('schedule-market-sync');
    if (!await this.baiinfoReady()) {
      this.logger.warn('百川行情凭据未配置或数据源未启用，自动调度已暂停');
      return;
    }
    await this.queue.upsertJobScheduler(
      'schedule-market-sync',
      { pattern: this.config.get<string>('MARKET_SYNC_CRON') || '0 6 * * *', tz: this.config.get<string>('CONTENT_TIMEZONE') || 'Asia/Shanghai' },
      {
        name: 'MARKET_SYNC',
        data: { type: 'MARKET_SYNC', scheduled: true },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
      },
    );
  }

  private async baiinfoReady() {
    const source = await this.prisma.contentDataSource.findUnique({
      where: { code: 'BAIINFO_FLUORITE' },
      select: { id: true, status: true },
    });
    const configured = Boolean(
      (this.config.get<string>('BAIINFO_AUTH') && this.config.get<string>('BAIINFO_COOKIE'))
      || (this.config.get<string>('BAIINFO_USERNAME') && this.config.get<string>('BAIINFO_PASSWORD')),
    );
    if (source?.status === 'ACTIVE' && !configured) {
      await this.prisma.contentDataSource.update({
        where: { id: source.id },
        data: {
          lastErrorAt: new Date(),
          lastError: '百川行情直连凭据未配置，自动采集已暂停；配置凭据并重启内容 Worker 后自动恢复',
        },
      });
    }
    return source?.status === 'ACTIVE' && configured;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
