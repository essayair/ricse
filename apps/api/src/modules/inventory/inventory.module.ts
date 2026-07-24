import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { InboundReceiptController, InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryReversalController } from './inventory-reversal.controller';
import { InventoryReversalService } from './inventory-reversal.service';
import { OutboundReceiptController } from './outbound.controller';
import { OutboundService } from './outbound.service';

@Module({
  imports: [CommonModule],
  controllers: [
    InboundReceiptController,
    InventoryController,
    OutboundReceiptController,
    InventoryReversalController,
  ],
  providers: [InventoryService, OutboundService, InventoryReversalService],
  exports: [InventoryService, OutboundService, InventoryReversalService],
})
export class InventoryModule {}
