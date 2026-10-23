import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AccessControlModule } from '../access-control/access-control.module';

@Global()
@Module({
  imports: [AccessControlModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
