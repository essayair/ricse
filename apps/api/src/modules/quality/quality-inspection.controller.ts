import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { attachmentMimeType } from '../weighbridge/weigh-ticket.controller';
import { CreateQualityInspectionDto } from './dto/create-quality-inspection.dto';
import { UpdateQualityStatusDto } from './dto/update-quality-status.dto';
import { QualityInspectionService } from './quality-inspection.service';

@ApiTags('质检单管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quality-inspections')
export class QualityInspectionController {
  constructor(private readonly service: QualityInspectionService, private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({ summary: '从已完成磅单创建质检单' })
  create(@Body() dto: CreateQualityInspectionDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '质检单分页检索' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('conclusion') conclusion?: string, @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAll({
      page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
      search, status, conclusion, dateFrom, dateTo,
    }, userId);
  }

  @Get('eligible-weigh-tickets')
  eligibleWeighTickets(@CurrentUser('id') userId: string) {
    return this.service.eligibleWeighTickets(userId);
  }

  @Get('attachments/:id/view-url')
  async attachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  async deleteAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return;
    await this.service.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') qualityInspectionId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('category') requestedCategory?: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const category = requestedCategory || 'REPORT';
    if (!['REPORT', 'OUR_REPORT', 'PARTNER_REPORT', 'THIRD_REPORT', 'SAMPLE_PHOTO', 'OTHER'].includes(category)) {
      throw new BadRequestException('附件分类无效');
    }
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await this.service.createAttachment({
        qualityInspectionId, fileName: result.fileName, originalName, mimeType, size: result.size, category,
      }, userId);
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string, @Body() dto: UpdateQualityStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateStatus(id, dto.status, userId, dto.resolution);
  }
}
