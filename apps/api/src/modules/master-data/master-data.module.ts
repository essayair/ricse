import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [MasterDataController, PartnerController],
  providers: [MasterDataService, PartnerService],
  exports: [MasterDataService, PartnerService],
})
export class MasterDataModule {}
