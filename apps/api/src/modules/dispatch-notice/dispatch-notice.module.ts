import { Module } from '@nestjs/common';
import { DispatchNoticeController } from './dispatch-notice.controller';
import { DispatchNoticeService } from './dispatch-notice.service';

@Module({
  controllers: [DispatchNoticeController],
  providers: [DispatchNoticeService],
  exports: [DispatchNoticeService],
})
export class DispatchNoticeModule {}
