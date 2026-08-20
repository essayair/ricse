import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PublicContentController } from './public-content.controller';
import { ContentAiController } from './ai.controller';
import { ContentAiService } from './ai.service';
import { ContentQueueService } from './content-queue.service';
import { WechatAuthService } from './wechat-auth.service';
import { WechatController } from './wechat.controller';
import { ContentHealthController } from './content-health.controller';
import { LegacyContentController } from './legacy-content.controller';
import { PublicRateLimitService } from './public-rate-limit.service';

@Module({
  imports: [CommonModule],
  controllers: [ContentController, PublicContentController, ContentAiController, WechatController, LegacyContentController, ContentHealthController],
  providers: [ContentService, ContentAiService, ContentQueueService, WechatAuthService, PublicRateLimitService],
  exports: [ContentService, ContentAiService, ContentQueueService, WechatAuthService],
})
export class ContentModule {}
