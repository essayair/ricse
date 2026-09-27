import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileService } from '../common/file.service';
import { prepareAttachmentUpload } from '../common/attachment-upload';
import { CurrentUser } from '../common/current-user.decorator';
import {
  AllocateFundDto, CreateFinancialSettlementDto, CreateFundTransactionDto, CreatePaymentRequestDto,
  ExecutePaymentRequestDto, RejectPaymentRequestDto, ReverseAllocationDto,
} from './dto/financial-settlement.dto';
import { FinancialSettlementService } from './financial-settlement.service';

@ApiTags('采购销售资金结算')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('financial-settlements')
export class FinancialSettlementController {
  constructor(private readonly service: FinancialSettlementService, private readonly fileService: FileService) {}

  @Get('options/contracts')
  contractOptions(@CurrentUser('id') userId: string, @Query('direction') direction: string) {
    return this.service.contractOptions(direction, userId);
  }

  @Get('options/orders')
  orderOptions(
    @CurrentUser('id') userId: string,
    @Query('contractId') contractId: string,
    @Query('direction') direction: string,
  ) {
    return this.service.orderOptions(contractId, direction, userId);
  }

  @Get('funds')
  funds(
    @CurrentUser('id') userId: string,
    @Query('businessType') businessType?: string,
    @Query('direction') direction?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.service.listFunds({ businessType, direction, contractId }, userId);
  }

  @Get('ledger')
  ledger(@CurrentUser('id') userId: string) {
    return this.service.settlementLedger(userId);
  }

  @Post('funds')
  createFund(@Body() dto: CreateFundTransactionDto, @CurrentUser('id') userId: string) {
    return this.service.createFund(dto, userId);
  }

  @Get('funds/:id')
  fund(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findFund(id, userId);
  }

  @Post('funds/:id/void')
  voidFund(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.voidFund(id, userId);
  }

  @Post('funds/:id/claim')
  claimFund(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.claimFund(id, userId);
  }

  @Post('funds/:id/confirm')
  confirmFund(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.confirmFund(id, userId);
  }

  @Post('funds/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadFundAttachment(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) {
    return this.uploadAttachment(file, { fundTransactionId: id }, userId, 'BANK_RECEIPT');
  }

  @Get('payment-requests')
  paymentRequests(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listPaymentRequests({ status, search }, userId);
  }

  @Post('payment-requests')
  createPaymentRequest(@Body() dto: CreatePaymentRequestDto, @CurrentUser('id') userId: string) {
    return this.service.createPaymentRequest(dto, userId);
  }

  @Get('payment-requests/:id')
  paymentRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findPaymentRequest(id, userId);
  }

  @Post('payment-requests/:id/submit')
  submitPaymentRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.submitPaymentRequest(id, userId);
  }

  @Post('payment-requests/:id/approve')
  approvePaymentRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.approvePaymentRequest(id, userId);
  }

  @Post('payment-requests/:id/reject')
  rejectPaymentRequest(@Param('id') id: string, @Body() dto: RejectPaymentRequestDto, @CurrentUser('id') userId: string) {
    return this.service.rejectPaymentRequest(id, dto, userId);
  }

  @Post('payment-requests/:id/execute')
  executePaymentRequest(@Param('id') id: string, @Body() dto: ExecutePaymentRequestDto, @CurrentUser('id') userId: string) {
    return this.service.executePaymentRequest(id, dto, userId);
  }

  @Post('payment-requests/:id/void')
  voidPaymentRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.voidPaymentRequest(id, userId);
  }

  @Post('payment-requests/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadPaymentRequestAttachment(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) {
    return this.uploadAttachment(file, { paymentRequestId: id }, userId, 'PAYMENT_BASIS');
  }

  @Get('attachments/:id/view-url')
  async attachmentUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findDocumentAttachment(id, userId);
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  async deleteAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.deleteDocumentAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
  }

  private async uploadAttachment(
    file: Express.Multer.File,
    target: { fundTransactionId?: string; paymentRequestId?: string },
    userId: string,
    category: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const prepared = prepareAttachmentUpload(file);
    if (!prepared) throw new BadRequestException('文件内容无法识别，仅支持 JPG/PNG/WEBP/PDF 格式');
    const uploaded = await this.fileService.upload(file.buffer, prepared.originalName, prepared.mimeType);
    try {
      return await this.service.createDocumentAttachment(target, {
        fileName: uploaded.fileName, originalName: prepared.originalName, mimeType: prepared.mimeType, size: uploaded.size, category,
      }, userId);
    } catch (error) {
      try { await this.fileService.delete(uploaded.fileName); } catch {}
      throw error;
    }
  }

  @Post('allocations/:id/reverse')
  reverseAllocation(@Param('id') id: string, @Body() dto: ReverseAllocationDto, @CurrentUser('id') userId: string) {
    return this.service.reverseAllocation(id, dto, userId);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ direction, status, search }, userId);
  }

  @Post()
  create(@Body() dto: CreateFinancialSettlementDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.confirm(id, userId);
  }

  @Post(':id/allocate')
  allocate(@Param('id') id: string, @Body() dto: AllocateFundDto, @CurrentUser('id') userId: string) {
    return this.service.allocate(id, dto, userId);
  }

  @Post(':id/void')
  voidSettlement(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.voidSettlement(id, userId);
  }
}
