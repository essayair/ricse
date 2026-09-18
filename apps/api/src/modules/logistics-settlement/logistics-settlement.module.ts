import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { LogisticsContractController } from './logistics-contract.controller';
import { LogisticsContractService } from './logistics-contract.service';
import { LogisticsSettlementController } from './logistics-settlement.controller';
import { LogisticsSettlementService } from './logistics-settlement.service';

@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [LogisticsContractController, LogisticsSettlementController],
  providers: [LogisticsContractService, LogisticsSettlementService],
  exports: [LogisticsContractService, LogisticsSettlementService],
})
export class LogisticsSettlementModule {}
