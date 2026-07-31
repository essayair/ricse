import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WaybillController } from './waybill.controller';
import { WaybillService } from './waybill.service';

@Module({
  imports: [CommonModule, AccessControlModule, InventoryModule],
  controllers: [WaybillController],
  providers: [WaybillService],
  exports: [WaybillService],
})
export class LogisticsModule {}
