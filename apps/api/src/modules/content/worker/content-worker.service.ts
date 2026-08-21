import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentAiService } from '../ai.service';
import { CONTENT_QUEUE, ContentQueueService } from '../content-queue.service';
import { BaiinfoCollectorService } from './baiinfo-collector.service';
import { NewsIngestionService } from './news-ingestion.service';
import { ContentDataImportService } from './data-import.service';
import { BusinessAnalytiqCollectorService } from './business-analytiq-collector.service';
import { FluorsparTrendCollectorService } from './fluorspar-trend-collector.service';

@Injectable()
export class ContentWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ContentWorkerService.name);
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ContentQueueService,
    private readonly news: NewsIngestionService,
    private readonly baiinfo: BaiinfoCollectorService,
    private readonly businessAnalytiq: BusinessAnalytiqCollectorService,
    private readonly fluorsparTrend: FluorsparTrendCollectorService,
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
    await this.prisma.contentJob.update({
      where: { id: record.id },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, errorMessage: null },
    });
    try {
      let result: unknown;
      if (type === 'NEWS_SYNC') result = await this.news.sync(Number((job.data.payload || {}).pageCount) || undefined);
      else if (type === 'MARKET_SYNC') result = await this.baiinfo.sync();
      else if (type === 'HF_MARKET_SYNC') result = await this.businessAnalytiq.sync();
      else if (type === 'FLUORSPAR_TREND_SYNC') result = await this.fluorsparTrend.sync();
      else if (type === 'AI_CLEAN') result = await this.cleanOne((job.data.payload || {}).articleId);
      else if (type === 'DATA_IMPORT') result = await this.dataImport.importPriceFile((job.data.payload || {}).assetId);
      else throw new Error(`尚未实现的任务类型：${type}`);
      await this.prisma.contentJob.update({
        where: { id: record.id },
        data: { status: 'SUCCEEDED', result: result as any, finishedAt: new Date(), nextRetryAt: null },
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
    const bucket = new Date().toISOString().slice(0, type === 'NEWS_SYNC' ? 16 : 10);
    const sourceCode = type === 'NEWS_SYNC' ? 'LEGACY_NEWS'
      : type === 'MARKET_SYNC' ? 'BAIINFO_FLUORITE'
      : type === 'HF_MARKET_SYNC' ? 'BUSINESS_ANALYTIQ_HF'
      : type === 'FLUORSPAR_TREND_SYNC' ? 'FLUORSPAR_COM_TREND'
      : undefined;
    const source = sourceCode ? await this.prisma.contentDataSource.findUnique({ where: { code: sourceCode } }) : null;
    return this.prisma.contentJob.upsert({
      where: { businessKey: `scheduled:${type}:${bucket}` },
      update: {},
      create: {
        type, businessKey: `scheduled:${type}:${bucket}`, status: 'PENDING',
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
