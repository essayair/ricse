import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
  controllers: [MasterDataController, PartnerController],
  providers: [MasterDataService, PartnerService],
  exports: [MasterDataService, PartnerService],
})
export class MasterDataModule {}
