import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { CommonModule } from '../common/common.module';
import { ApprovalFlowController } from './approval-flow.controller';
import { ApprovalFlowService } from './approval-flow.service';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [ContractController, ApprovalFlowController],
  providers: [ContractService, ApprovalFlowService],
  exports: [ContractService],
})
export class ContractModule {}
