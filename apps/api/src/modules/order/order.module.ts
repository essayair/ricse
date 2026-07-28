import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [AccessControlModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
