import { createHash } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { attachmentMimeType } from '../weighbridge/weigh-ticket.controller';
import { FinalizeQualityTaskDto } from './dto/finalize-quality-task.dto';
import { UpdateQualityTaskSamplingDto } from './dto/update-quality-task-sampling.dto';
import { QualityInspectionService } from './quality-inspection.service';

@ApiTags('到货质检任务')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quality-tasks')
export class QualityTaskController {
  constructor(
    private readonly service: QualityInspectionService,
    private readonly fileService: FileService,
  ) {}

  @Get()
  @ApiOperation({ summary: '到货质检任务分页检索' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('conclusion') conclusion?: string, @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findTasks({
      page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined,
      search, status, conclusion, dateFrom, dateTo,
    }, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '到货质检任务详情及机构检测报告' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findTask(id, userId);
  }

  @Patch(':id/sampling')
  @ApiOperation({ summary: '登记质检任务取样信息和计划送检份数' })
  updateSampling(
    @Param('id') id: string,
    @Body() dto: UpdateQualityTaskSamplingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateTaskSampling(id, dto, userId);
  }

  @Get('attachments/:id/view-url')
  async attachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.service.findTaskAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('现场影像不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') qualityTaskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('category') category = 'SAMPLING_PHOTO',
    @Body('sourceType') sourceType = 'WEB_UPLOAD',
    @Body('evidenceNode') evidenceNode?: string,
    @Body('capturedAt') capturedAt?: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    if (!['SAMPLING_PHOTO', 'MIXING_PHOTO', 'SPLITTING_PHOTO', 'SEALING_PHOTO', 'REPORT', 'OTHER'].includes(category)) {
      throw new BadRequestException('现场影像分类无效');
    }
    if (!['MINI_PROGRAM_CAPTURE', 'RICSE_IMPORT', 'THIRD_PARTY_WATERMARK', 'WEB_UPLOAD', 'EXTERNAL'].includes(sourceType)) {
      throw new BadRequestException('影像来源无效');
    }
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType || mimeType === 'application/pdf') throw new BadRequestException('现场影像仅支持 JPG/PNG/WEBP 格式');
    const task = await this.service.findTask(qualityTaskId, userId, 'quality.manage');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    const material = task.waybill.lineItems.map((item: any) => item.materialName).filter(Boolean).join('、') || '-';
    const watermarkText = [
      '和光云链 RICSE',
      `质检任务：${task.taskNo}`,
      `运单编号：${task.waybill.waybillNo}`,
      `车辆：${task.waybill.plateNo || '-'}`,
      `物料：${material}`,
      `计划数量：${Number(task.waybill.totalQuantity || 0).toFixed(3)} 吨`,
      `拍摄节点：${evidenceNode || category}`,
      `拍摄时间：${capturedAt || new Date().toISOString()}`,
    ].join('\n');
    try {
      return await this.service.createTaskAttachment({
        qualityTaskId,
        fileName: result.fileName,
        originalName,
        mimeType,
        size: result.size,
        category,
        sourceType,
        evidenceNode,
        capturedAt,
        fileHash: createHash('sha256').update(file.buffer).digest('hex'),
        watermarkText,
      }, userId);
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Patch(':id/finalize')
  @ApiOperation({ summary: '根据有效检测报告形成最终质检结论' })
  finalize(
    @Param('id') id: string, @Body() dto: FinalizeQualityTaskDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.finalizeTask(id, dto, userId);
  }
}
