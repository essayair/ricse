import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateInvoiceRecordDto, VoidInvoiceRecordDto } from './dto/invoice-record.dto';
import { InvoiceLedgerQuery, InvoiceRegisterService } from './invoice-register.service';

/** 进项发票、销项发票台账：跨结算单查询发票，并列出待到票/待开票的结算依据。 */
@ApiTags('发票台账')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('invoices')
export class InvoiceLedgerController {
  constructor(private readonly invoices: InvoiceRegisterService) {}

  @Get()
  ledger(@Query() query: InvoiceLedgerQuery, @CurrentUser('id') userId: string) {
    return this.invoices.ledger(query, userId);
  }

  @Get('pending')
  pending(@Query('direction') direction: string, @CurrentUser('id') userId: string) {
    return this.invoices.pending({ direction }, userId);
  }
}

/** 物流结算单的运费发票登记（进项）。 */
@ApiTags('物流结算')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('logistics-settlements')
export class FreightInvoiceController {
  constructor(private readonly invoices: InvoiceRegisterService) {}

  @Get(':id/invoices')
  list(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.invoices.listFreight(id, userId);
  }

  @Post(':id/invoices')
  create(@Param('id') id: string, @Body() dto: CreateInvoiceRecordDto, @CurrentUser('id') userId: string) {
    return this.invoices.createFreight(id, dto, userId);
  }

  @Post(':id/invoices/:invoiceId/void')
  void(@Param('id') id: string, @Param('invoiceId') invoiceId: string, @Body() dto: VoidInvoiceRecordDto, @CurrentUser('id') userId: string) {
    return this.invoices.voidFreight(id, invoiceId, dto.reason, userId);
  }
}
