import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { CommonModule } from '../common/common.module';
import { ApprovalFlowController } from './approval-flow.controller';
import { ApprovalFlowService } from './approval-flow.service';

@Module({
  imports: [CommonModule],
  controllers: [ContractController, ApprovalFlowController],
  providers: [ContractService, ApprovalFlowService],
  exports: [ContractService],
})
export class ContractModule {}
