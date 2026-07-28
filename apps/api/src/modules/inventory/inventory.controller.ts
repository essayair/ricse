import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { attachmentMimeType } from '../weighbridge/weigh-ticket.controller';
import { CreateInboundReceiptDto } from './dto/create-inbound-receipt.dto';
import { InventoryService } from './inventory.service';

@ApiTags('入库与库存')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inbound-receipts')
export class InboundReceiptController {
  constructor(private readonly service: InventoryService, private readonly fileService: FileService) {}

  @Get('eligible-waybills') eligibleWaybills(@CurrentUser('id') userId: string) { return this.service.eligibleWaybills(userId); }
  @Get('attachments/:id/view-url')
  async attachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }
  @Delete('attachments/:id')
  @HttpCode(204)
  async deleteAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findAttachmentById(id, userId, 'inventory.manage');
    if (!attachment) return;
    await this.service.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
  }
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') inboundReceiptId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await this.service.createAttachment({
        inboundReceiptId, fileName: result.fileName, originalName, mimeType,
        size: result.size, category: 'RECEIPT_EVIDENCE',
      }, userId);
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }
  @Post() create(@Body() dto: CreateInboundReceiptDto, @CurrentUser('id') userId: string) { return this.service.createReceipt(dto, userId); }
  @Get() findAll(@CurrentUser('id') userId: string, @Query('search') search?: string, @Query('status') status?: string) { return this.service.findReceipts({ search, status }, userId); }
  @Get(':id') findOne(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.findReceipt(id, userId); }
  @Patch(':id/confirm') confirm(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.confirmReceipt(id, userId); }
  @Patch(':id/cancel') cancel(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.cancelReceipt(id, userId); }
  @Post(':id/post') post(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.postInventory(id, userId); }
}

@ApiTags('库存台账')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get('overview') overview(@CurrentUser('id') userId: string, @Query('search') search?: string, @Query('warehouseId') warehouseId?: string) { return this.service.inventoryOverview({ search, warehouseId }, userId); }
  @Get('ledger') ledger(@CurrentUser('id') userId: string) { return this.service.inventoryLedger(userId); }
}
