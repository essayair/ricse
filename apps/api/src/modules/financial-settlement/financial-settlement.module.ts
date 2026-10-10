import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { FinancialSettlementController } from './financial-settlement.controller';
import { FinancialSettlementService } from './financial-settlement.service';
import { PaymentVoucherRecognitionService } from './payment-voucher-recognition.service';

@Module({
  imports: [AccessControlModule, CommonModule],
  controllers: [FinancialSettlementController],
  providers: [FinancialSettlementService, PaymentVoucherRecognitionService],
  exports: [FinancialSettlementService],
})
export class FinancialSettlementModule {}
