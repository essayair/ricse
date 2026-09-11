import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { PublicRateLimitService } from '../content/public-rate-limit.service';
import { EzvizProvider } from './ezviz.provider';
import { MonitorService } from './monitor.service';
import { PublicMonitorController } from './public-monitor.controller';

/** 公开监控模块，挂在内容 API（nginx 的 /api/v1/public/ 路由）。 */
@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [PublicMonitorController],
  providers: [MonitorService, EzvizProvider, PublicRateLimitService],
})
export class PublicMonitorModule {}
