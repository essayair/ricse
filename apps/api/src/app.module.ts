import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ContractModule } from './modules/contract/contract.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { CommonModule } from './modules/common/common.module';
import { OrgModule } from './modules/org/org.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    ContractModule,
    MasterDataModule,
    OrgModule,
  ],
})
export class AppModule {}
