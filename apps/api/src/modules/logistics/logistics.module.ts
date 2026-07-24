import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WaybillController } from './waybill.controller';
import { WaybillService } from './waybill.service';

@Module({
  imports: [CommonModule],
  controllers: [WaybillController],
  providers: [WaybillService],
  exports: [WaybillService],
})
export class LogisticsModule {}
