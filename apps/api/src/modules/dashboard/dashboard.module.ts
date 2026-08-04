import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccessControlModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
