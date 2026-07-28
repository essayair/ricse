import { Module } from '@nestjs/common';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
