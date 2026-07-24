import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { attachmentMimeType } from '../weighbridge/weigh-ticket.controller';
import { CreateOutboundReceiptDto } from './dto/create-outbound-receipt.dto';
import { OutboundService } from './outbound.service';

@ApiTags('销售出库与库存扣减')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('outbound-receipts')
export class OutboundReceiptController {
  constructor(
    private readonly service: OutboundService,
    private readonly fileService: FileService,
  ) {}

  @Get('eligible-waybills')
  eligibleWaybills() {
    return this.service.eligibleWaybills();
  }

  @Get('eligible-lots')
  eligibleLots(@Query('waybillId') waybillId?: string) {
    if (!waybillId) throw new BadRequestException('请选择物流运单');
    return this.service.eligibleLots(waybillId);
  }

  @Get('attachments/:id/view-url')
  async attachmentViewUrl(@Param('id') id: string) {
    const attachment = await this.service.findAttachmentById(id);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  async deleteAttachment(@Param('id') id: string) {
    const attachment = await this.service.findAttachmentById(id);
    if (!attachment) return;
    await this.service.deleteAttachment(id);
    try { await this.fileService.delete(attachment.fileName); } catch {}
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') outboundReceiptId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await this.service.createAttachment({
        outboundReceiptId,
        fileName: result.fileName,
        originalName,
        mimeType,
        size: result.size,
        category: 'OUTBOUND_EVIDENCE',
      });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Post()
  create(@Body() dto: CreateOutboundReceiptDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(@Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll({ search, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.service.confirm(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/post')
  post(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.post(id, userId);
  }
}
