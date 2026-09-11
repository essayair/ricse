import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { EzvizProvider } from './ezviz.provider';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

/** 管理端监控模块，挂在核心 API（nginx 的 /api/ 路由）。 */
@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [MonitorController],
  providers: [MonitorService, EzvizProvider],
  exports: [MonitorService, EzvizProvider],
})
export class MonitorModule {}
