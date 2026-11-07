import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { AllocateInvoicesDto, CreateSettlementInvoiceDto, RegisterInvoiceDto, VoidInvoiceRecordDto } from './dto/invoice-record.dto';
import { InvoiceLedgerQuery, InvoiceRegisterService } from './invoice-register.service';

/** 进项发票、销项发票：先登记、按金额分摊到结算依据、撤销分摊、作废，以及到票核对。 */
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

  @Get('contract-summary')
  contractSummary(@Query('direction') direction: string, @CurrentUser('id') userId: string) {
    return this.invoices.contractSummary({ direction }, userId);
  }

  @Get('options')
  options(@Query('direction') direction: string, @CurrentUser('id') userId: string) {
    return this.invoices.options({ direction }, userId);
  }

  /** 可分摊到某结算单（或物流结算单）的已登记发票。 */
  @Get('candidates')
  invoiceCandidates(@Query('settlementId') settlementId: string, @Query('logisticsSettlementId') logisticsSettlementId: string, @CurrentUser('id') userId: string) {
    return this.invoices.invoiceCandidates({ settlementId: settlementId || undefined, logisticsSettlementId: logisticsSettlementId || undefined }, userId);
  }

  @Post()
  register(@Body() dto: RegisterInvoiceDto, @CurrentUser('id') userId: string) {
    return this.invoices.register(dto, userId);
  }

  @Post('allocations')
  allocate(@Body() dto: AllocateInvoicesDto, @CurrentUser('id') userId: string) {
    return this.invoices.allocate(dto.items, userId);
  }

  @Post('allocations/:allocationId/reverse')
  reverseAllocation(@Param('allocationId') allocationId: string, @Body() dto: VoidInvoiceRecordDto, @CurrentUser('id') userId: string) {
    return this.invoices.reverseAllocation(allocationId, dto.reason, userId);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.invoices.detail(id, userId);
  }

  /** 可接收该发票分摊的结算依据。 */
  @Get(':id/allocation-candidates')
  targetCandidates(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.invoices.targetCandidates(id, userId);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @Body() dto: VoidInvoiceRecordDto, @CurrentUser('id') userId: string) {
    return this.invoices.voidInvoice(id, dto.reason, userId);
  }
}

/** 物流结算单的运费发票（进项）：登记并分摊到本单。 */
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
  create(@Param('id') id: string, @Body() dto: CreateSettlementInvoiceDto, @CurrentUser('id') userId: string) {
    return this.invoices.createFreight(id, dto, userId);
  }
}
