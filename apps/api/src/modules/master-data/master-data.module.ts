import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { CommonModule } from '../common/common.module';
import { ServiceOrganizationController } from './service-organization.controller';
import { ServiceOrganizationService } from './service-organization.service';

@Module({
  imports: [CommonModule],
  controllers: [MasterDataController, PartnerController, ServiceOrganizationController],
  providers: [MasterDataService, PartnerService, ServiceOrganizationService],
  exports: [MasterDataService, PartnerService, ServiceOrganizationService],
})
export class MasterDataModule {}
