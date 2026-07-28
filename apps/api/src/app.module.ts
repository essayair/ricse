import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ContractModule } from './modules/contract/contract.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { CommonModule } from './modules/common/common.module';
import { OrgModule } from './modules/org/org.module';
import { OrderModule } from './modules/order/order.module';
import { DispatchNoticeModule } from './modules/dispatch-notice/dispatch-notice.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { WeighbridgeModule } from './modules/weighbridge/weighbridge.module';
import { QualityModule } from './modules/quality/quality.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AccessControlModule } from './modules/access-control/access-control.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    ContractModule,
    MasterDataModule,
    OrgModule,
    OrderModule,
    DispatchNoticeModule,
    LogisticsModule,
    WeighbridgeModule,
    QualityModule,
    InventoryModule,
    AccessControlModule,
  ],
})
export class AppModule {}
