import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WeighTicketController } from './weigh-ticket.controller';
import { WeighTicketService } from './weigh-ticket.service';

@Module({
  imports: [CommonModule],
  controllers: [WeighTicketController],
  providers: [WeighTicketService],
  exports: [WeighTicketService],
})
export class WeighbridgeModule {}
