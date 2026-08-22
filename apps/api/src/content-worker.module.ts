import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ContentAiService } from './modules/content/ai.service';
import { ContentQueueService } from './modules/content/content-queue.service';
import { BaiinfoCollectorService } from './modules/content/worker/baiinfo-collector.service';
import { ContentWorkerService } from './modules/content/worker/content-worker.service';
import { ContentDataImportService } from './modules/content/worker/data-import.service';
import { FileService } from './modules/common/file.service';
import { BusinessAnalytiqCollectorService } from './modules/content/worker/business-analytiq-collector.service';
import { FluorsparTrendCollectorService } from './modules/content/worker/fluorspar-trend-collector.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [ContentQueueService, ContentAiService, BaiinfoCollectorService, BusinessAnalytiqCollectorService, FluorsparTrendCollectorService, ContentDataImportService, FileService, ContentWorkerService],
})
export class ContentWorkerModule {}
