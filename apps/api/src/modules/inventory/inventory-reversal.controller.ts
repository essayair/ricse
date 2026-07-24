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
import { CreateInventoryReversalDto } from './dto/create-inventory-reversal.dto';
import { InventoryReversalService } from './inventory-reversal.service';

@ApiTags('库存冲销')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory-reversals')
export class InventoryReversalController {
  constructor(
    private readonly service: InventoryReversalService,
    private readonly fileService: FileService,
  ) {}

  @Get('eligible-sources')
  eligibleSources(@Query('type') type?: string, @Query('search') search?: string) {
    if (!type) throw new BadRequestException('请选择冲销类型');
    return this.service.eligibleSources(type, search);
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
    @Param('id') inventoryReversalId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await this.service.createAttachment({
        inventoryReversalId,
        fileName: result.fileName,
        originalName,
        mimeType,
        size: result.size,
        category: 'REVERSAL_EVIDENCE',
      });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Post()
  create(@Body() dto: CreateInventoryReversalDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.service.findAll({ search, status, type });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/submit')
  submit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body('action') action: string,
    @Body('comment') comment: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.review(id, action, comment, userId);
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
