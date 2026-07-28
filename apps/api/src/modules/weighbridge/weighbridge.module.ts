import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { WeighTicketController } from './weigh-ticket.controller';
import { WeighTicketService } from './weigh-ticket.service';

@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [WeighTicketController],
  providers: [WeighTicketService],
  exports: [WeighTicketService],
})
export class WeighbridgeModule {}
