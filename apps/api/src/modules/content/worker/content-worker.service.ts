import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentAiService } from '../ai.service';
import { CONTENT_QUEUE, ContentQueueService } from '../content-queue.service';
import { BaiinfoCollectorService } from './baiinfo-collector.service';
import { ContentDataImportService } from './data-import.service';
import { BusinessAnalytiqCollectorService } from './business-analytiq-collector.service';
import { FluorsparTrendCollectorService } from './fluorspar-trend-collector.service';
import { NewsCollectorService } from './news-collector.service';

@Injectable()
export class ContentWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ContentWorkerService.name);
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ContentQueueService,
    private readonly baiinfo: BaiinfoCollectorService,
    private readonly businessAnalytiq: BusinessAnalytiqCollectorService,
    private readonly fluorsparTrend: FluorsparTrendCollectorService,
    private readonly news: NewsCollectorService,
    private readonly ai: ContentAiService,
    private readonly dataImport: ContentDataImportService,
  ) {}

  async onModuleInit() {
    await this.queue.registerSchedules();
    this.worker = new Worker(CONTENT_QUEUE, (job) => this.process(job), {
      connection: this.queue.connectionOptions(),
      concurrency: Math.max(1, Number(process.env.CONTENT_WORKER_CONCURRENCY || 1)),
      lockDuration: 5 * 60_000,
    });
    this.worker.on('failed', (job, error) => this.logger.error(`任务失败 id=${job?.id}: ${error.message}`));
    this.worker.on('completed', (job) => this.logger.log(`任务完成 id=${job.id} type=${job.name}`));
    if (process.env.CONTENT_SYNC_ON_STARTUP !== 'false') await this.queue.enqueueStartupSyncs();
    this.logger.log('内容 Worker 已启动并注册定时任务');
  }

  private async process(job: Job) {
    const type = String(job.data.type || job.name);
    const record = job.data.contentJobId
      ? await this.prisma.contentJob.findUnique({ where: { id: job.data.contentJobId } })
      : await this.scheduledRecord(type, job);
    if (!record) throw new Error('内容任务记录不存在');
    if (record.status === 'CANCELLED') return { skipped: 'cancelled' };
    if (record.sourceId) {
      const source = await this.prisma.contentDataSource.findUnique({ where: { id: record.sourceId } });
      if (source?.status === 'INACTIVE') {
        await this.prisma.contentJob.update({ where: { id: record.id }, data: { status: 'CANCELLED', finishedAt: new Date(), result: { skipped: 'source inactive' } } });
        return { skipped: 'source inactive' };
      }
    }
    if (type === 'MARKET_SYNC' && !this.baiinfo.isConfigured()) {
      const message = '百川行情直连凭据未配置，任务已取消；配置凭据并重启内容 Worker 后自动恢复';
      await this.prisma.contentJob.update({
        where: { id: record.id },
        data: { status: 'CANCELLED', finishedAt: new Date(), nextRetryAt: null, errorMessage: message, result: { skipped: 'credential not configured' } },
      });
      if (record.sourceId) await this.prisma.contentDataSource.update({
        where: { id: record.sourceId }, data: { lastErrorAt: new Date(), lastError: message },
      });
      this.logger.warn(message);
      return { skipped: 'credential not configured' };
    }
    await this.prisma.contentJob.update({
      where: { id: record.id },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, errorMessage: null },
    });
    try {
      let result: unknown;
      if (type === 'NEWS_SYNC') result = await this.news.sync(record.sourceId || undefined);
      else if (type === 'MARKET_SYNC') result = await this.baiinfo.sync();
      else if (type === 'HF_MARKET_SYNC') result = await this.businessAnalytiq.sync();
      else if (type === 'FLUORSPAR_TREND_SYNC') result = await this.fluorsparTrend.sync();
      else if (type === 'AI_CLEAN') result = await this.cleanOne((job.data.payload || {}).articleId);
      else if (type === 'DATA_IMPORT') result = await this.dataImport.importPriceFile((job.data.payload || {}).assetId);
      else throw new Error(`尚未实现的任务类型：${type}`);
      const completedStatus = type === 'NEWS_SYNC'
        && Number((result as { failedSources?: number })?.failedSources || 0) > 0
        ? 'PARTIAL'
        : 'SUCCEEDED';
      await this.prisma.contentJob.update({
        where: { id: record.id },
        data: { status: completedStatus, result: result as any, finishedAt: new Date(), nextRetryAt: null },
      });
      if (record.sourceId) await this.prisma.contentDataSource.update({
        where: { id: record.sourceId }, data: { lastSuccessAt: new Date(), lastError: null },
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const maxAttempts = Number(job.opts.attempts || 1);
      const willRetry = job.attemptsMade + 1 < maxAttempts;
      await this.prisma.contentJob.update({
        where: { id: record.id },
        data: {
          status: willRetry ? 'PENDING' : 'FAILED',
          errorMessage: message.slice(0, 2000),
          nextRetryAt: willRetry ? new Date(Date.now() + 60_000 * Math.pow(2, job.attemptsMade)) : null,
          finishedAt: willRetry ? null : new Date(),
        },
      });
      if (record.sourceId) await this.prisma.contentDataSource.update({
        where: { id: record.sourceId }, data: { lastErrorAt: new Date(), lastError: message.slice(0, 2000) },
      });
      throw error;
    }
  }

  private async scheduledRecord(type: string, job: Job) {
    const bucket = new Date().toISOString().slice(0, type === 'NEWS_SYNC' ? 13 : 10);
    const sourceCode = type === 'MARKET_SYNC' ? 'BAIINFO_FLUORITE'
      : type === 'HF_MARKET_SYNC' ? 'BUSINESS_ANALYTIQ_HF'
      : type === 'FLUORSPAR_TREND_SYNC' ? 'FLUORSPAR_COM_TREND'
      : undefined;
    const source = job.data.sourceId
      ? await this.prisma.contentDataSource.findUnique({ where: { id: String(job.data.sourceId) } })
      : sourceCode ? await this.prisma.contentDataSource.findUnique({ where: { code: sourceCode } }) : null;
    return this.prisma.contentJob.upsert({
      where: { businessKey: `scheduled:${type}:${source?.id || 'all'}:${bucket}` },
      update: {},
      create: {
        type, businessKey: `scheduled:${type}:${source?.id || 'all'}:${bucket}`, status: 'PENDING',
        sourceId: source?.id, payload: { bullJobId: job.id || null }, maxAttempts: Number(job.opts.attempts || 3),
      },
    });
  }

  private async cleanOne(articleId?: string) {
    if (!articleId) throw new Error('AI_CLEAN 缺少 articleId');
    const article = await this.prisma.contentArticle.findUnique({ where: { id: articleId } });
    if (!article) throw new Error('待清洗资讯不存在');
    const cleaned = await this.ai.cleanArticle(article.title, article.content || article.summary || '');
    await this.prisma.contentArticle.update({ where: { id: article.id }, data: cleaned });
    return { articleId, cleaned: true };
  }

  async onApplicationShutdown() { await this.worker?.close(); }
}
