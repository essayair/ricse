import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { DispatchNoticeController } from './dispatch-notice.controller';
import { DispatchNoticeService } from './dispatch-notice.service';

@Module({
  imports: [AccessControlModule],
  controllers: [DispatchNoticeController],
  providers: [DispatchNoticeService],
  exports: [DispatchNoticeService],
})
export class DispatchNoticeModule {}
