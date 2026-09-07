import { createHash } from 'crypto';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { WaybillReceiptAttachmentCategory, WaybillService } from '../logistics/waybill.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { attachmentMimeType } from '../weighbridge/weigh-ticket.controller';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';
import { MobileApprovalDecisionDto } from './dto/mobile-approval.dto';
import { MobileUserGuard } from './mobile-user.guard';
import { MOBILE_BUSINESS_MODULES, MobileBusinessModule, MobileWorkspaceService } from './mobile-workspace.service';

@ApiTags('小程序企业工作台')
@ApiBearerAuth()
@UseGuards(MobileUserGuard)
@Controller('mobile')
export class MobileWorkspaceController {
  constructor(
    private readonly service: MobileWorkspaceService,
    private readonly fileService: FileService,
    private readonly qualityService: QualityInspectionService,
    private readonly weighService: WeighTicketService,
    private readonly waybillService: WaybillService,
  ) {}

  @Get('workspace')
  @ApiOperation({ summary: '企业工作台概览' })
  overview(@CurrentUser('id') userId: string) { return this.service.overview(userId); }

  @Get('business-modules')
  @ApiOperation({ summary: '查询当前用户可使用的移动业务模块' })
  businessModules(@CurrentUser('id') userId: string) { return this.service.businessModules(userId); }

  @Get('business/:module')
  @ApiOperation({ summary: '移动业务只读列表' })
  businessList(
    @CurrentUser('id') userId: string,
    @Param('module') rawModule: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const module = this.parseBusinessModule(rawModule);
    return this.service.businessList(userId, module, {
      search, status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('business/:module/:id')
  @ApiOperation({ summary: '移动业务只读详情' })
  businessDetail(
    @CurrentUser('id') userId: string,
    @Param('module') rawModule: string,
    @Param('id') id: string,
  ) {
    return this.service.businessDetail(userId, this.parseBusinessModule(rawModule), id);
  }

  @Post('quality-tasks/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadQualityEvidence(
    @Param('id') qualityTaskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('category') category = 'SAMPLING_PHOTO',
    @Body('evidenceNode') evidenceNode?: string,
    @Body('capturedAt') capturedAt?: string,
  ) {
    if (!['SAMPLING_PHOTO', 'MIXING_PHOTO', 'SPLITTING_PHOTO', 'SEALING_PHOTO', 'OTHER'].includes(category)) {
      throw new BadRequestException('现场影像分类无效');
    }
    const task = await this.qualityService.findTask(qualityTaskId, userId, 'quality.manage');
    return this.saveMobileImage(file, async (stored) => {
      const material = task.waybill.lineItems.map((item: any) => item.materialName).filter(Boolean).join('、') || '-';
      return this.qualityService.createTaskAttachment({
        qualityTaskId, ...stored, category, sourceType: 'MINI_PROGRAM_CAPTURE', evidenceNode,
        capturedAt, watermarkText: this.watermark([
          `质检任务：${task.taskNo}`, `运单编号：${task.waybill.waybillNo}`, `车辆：${task.waybill.plateNo || '-'}`,
          `物料：${material}`, `计划数量：${Number(task.waybill.totalQuantity || 0).toFixed(3)} 吨`,
          `拍摄节点：${evidenceNode || category}`, `拍摄时间：${capturedAt || new Date().toISOString()}`,
        ]),
      }, userId);
    });
  }

  @Post('weigh-tasks/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadWeighEvidence(
    @Param('id') weighTaskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('category') category = 'VEHICLE_PLATE',
    @Body('evidenceNode') evidenceNode?: string,
    @Body('capturedAt') capturedAt?: string,
  ) {
    if (!['VEHICLE_PLATE', 'CARGO_STATE', 'ON_SCALE', 'SCALE_DISPLAY', 'EMPTY_CARRIAGE', 'OTHER'].includes(category)) {
      throw new BadRequestException('现场影像分类无效');
    }
    const task = await this.weighService.findTaskForEvidence(weighTaskId, userId);
    return this.saveMobileImage(file, async (stored) => {
      const material = task.waybill.lineItems.map((item: any) => item.materialName).filter(Boolean).join('、') || '-';
      return this.weighService.createTaskAttachment({
        weighTaskId, ...stored, category, sourceType: 'MINI_PROGRAM_CAPTURE', evidenceNode,
        capturedAt, watermarkText: this.watermark([
          `过磅任务：${task.taskNo}`, `运单编号：${task.waybill.waybillNo}`, `车辆：${task.waybill.plateNo || '-'}`,
          `物料：${material}`, `本车计划：${Number(task.plannedQuantity).toFixed(3)} 吨`,
          `拍摄节点：${evidenceNode || category}`, `拍摄时间：${capturedAt || new Date().toISOString()}`,
        ]),
      }, userId);
    });
  }

  @Post('waybills/:id/receipt-attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadWaybillReceiptAttachment(
    @Param('id') waybillId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('category') category: WaybillReceiptAttachmentCategory = 'RECEIPT_OTHER',
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await this.waybillService.createAttachment({
        waybillId, fileName: result.fileName, originalName, mimeType, size: result.size, category,
      }, userId);
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Get('waybill-receipt-attachments/:id/view-url')
  async getWaybillReceiptAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.waybillService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('waybill-receipt-attachments/:id')
  async deleteWaybillReceiptAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.waybillService.findAttachmentById(id, userId, 'logistics.manage');
    if (!attachment) return { deleted: false };
    await this.waybillService.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
  }

  @Patch('waybills/:id/status')
  async confirmWaybillReceipt(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser('id') userId: string,
  ) {
    if (status !== 'SIGNED') throw new BadRequestException('小程序当前仅支持确认物流签收');
    return this.waybillService.updateStatus(id, status, userId);
  }

  @Get('approvals')
  @ApiOperation({ summary: '我的待办或已办审批' })
  approvals(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.service.approvalList(userId, status === 'DONE' ? 'DONE' : 'PENDING');
  }

  @Get('approvals/:contractId')
  @ApiOperation({ summary: '移动端合同审批详情' })
  approvalDetail(@CurrentUser('id') userId: string, @Param('contractId') contractId: string) {
    return this.service.approvalDetail(userId, contractId);
  }

  @Patch('approvals/:contractId')
  @ApiOperation({ summary: '移动端同意或驳回合同' })
  decide(
    @CurrentUser() user: { id: string; role: string },
    @Param('contractId') contractId: string,
    @Body() dto: MobileApprovalDecisionDto,
  ) {
    return this.service.decide(user.id, user.role, contractId, dto.decision, dto.comment);
  }

  private parseBusinessModule(value: string): MobileBusinessModule {
    if (!MOBILE_BUSINESS_MODULES.includes(value as MobileBusinessModule)) {
      throw new BadRequestException('不支持的移动业务模块');
    }
    return value as MobileBusinessModule;
  }

  private watermark(lines: string[]) { return ['和光云链 RICSE', ...lines].join('\n'); }

  private async saveMobileImage<T>(
    file: Express.Multer.File,
    save: (stored: { fileName: string; originalName: string; mimeType: string; size: number; fileHash: string }) => Promise<T>,
  ) {
    if (!file) throw new BadRequestException('请选择现场照片');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType || mimeType === 'application/pdf') throw new BadRequestException('现场影像仅支持 JPG/PNG/WEBP 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await save({
        fileName: result.fileName, originalName, mimeType, size: result.size,
        fileHash: createHash('sha256').update(file.buffer).digest('hex'),
      });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }
}
