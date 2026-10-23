import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';
import { CommonModule } from '../common/common.module';
import { ServiceOrganizationController } from './service-organization.controller';
import { ServiceOrganizationService } from './service-organization.service';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { TransportResourceService } from './transport-resource.service';
import { TransportResourceController } from './transport-resource.controller';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [MasterDataController, PartnerController, ServiceOrganizationController, DriverController, FleetController, TransportResourceController],
  providers: [MasterDataService, PartnerService, ServiceOrganizationService, DriverService, FleetService, TransportResourceService],
  exports: [MasterDataService, PartnerService, ServiceOrganizationService, DriverService, FleetService],
})
export class MasterDataModule {}
