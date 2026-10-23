import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { ContractModule } from '../contract/contract.module';
import { DispatchNoticeModule } from '../dispatch-notice/dispatch-notice.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { OrderModule } from '../order/order.module';
import { QualityModule } from '../quality/quality.module';
import { WeighbridgeModule } from '../weighbridge/weighbridge.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { FinancialSettlementModule } from '../financial-settlement/financial-settlement.module';
import { MobileUserGuard } from './mobile-user.guard';
import { MobileWorkspaceController } from './mobile-workspace.controller';
import { MobileNotificationController } from './mobile-notification.controller';
import { MobileWorkspaceService } from './mobile-workspace.service';

@Module({
  imports: [
    CommonModule,
    AccessControlModule,
    ContractModule,
    OrderModule,
    DispatchNoticeModule,
    LogisticsModule,
    WeighbridgeModule,
    QualityModule,
    InventoryModule,
    MasterDataModule,
    FinancialSettlementModule,
  ],
  controllers: [MobileWorkspaceController, MobileNotificationController],
  providers: [MobileUserGuard, MobileWorkspaceService],
})
export class MobileWorkspaceModule {}
