import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { FinancialSettlementController } from './financial-settlement.controller';
import { FinancialSettlementService } from './financial-settlement.service';
import { PaymentVoucherRecognitionService } from './payment-voucher-recognition.service';
import { InvoiceRegisterService } from './invoice-register.service';
import { FreightInvoiceController, InvoiceLedgerController } from './invoice.controller';

@Module({
  imports: [AccessControlModule, CommonModule],
  controllers: [FinancialSettlementController, InvoiceLedgerController, FreightInvoiceController],
  providers: [FinancialSettlementService, PaymentVoucherRecognitionService, InvoiceRegisterService],
  exports: [FinancialSettlementService],
})
export class FinancialSettlementModule {}
