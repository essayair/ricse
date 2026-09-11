import { createHash } from 'crypto';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { WaybillReceiptAttachmentCategory, WaybillService } from '../logistics/waybill.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../inventory/outbound.service';
import { UpdatePendingInboundReceiptDto } from '../inventory/dto/update-pending-inbound-receipt.dto';
import { CreateQualityInspectionDto } from '../quality/dto/create-quality-inspection.dto';
import { FinalizeQualityTaskDto } from '../quality/dto/finalize-quality-task.dto';
import { UpdateQualityTaskSamplingDto } from '../quality/dto/update-quality-task-sampling.dto';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { CreateWeighRecordDto } from '../weighbridge/dto/create-weigh-record.dto';
import { CreateWeighTicketDto } from '../weighbridge/dto/create-weigh-ticket.dto';
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
    private readonly inventoryService: InventoryService,
    private readonly outboundService: OutboundService,
  ) {}

  @Get('workspace')
  @ApiOperation({ summary: '企业工作台概览' })
  overview(@CurrentUser('id') userId: string) { return this.service.overview(userId); }

  @Get('business-modules')
  @ApiOperation({ summary: '查询当前用户可使用的移动业务模块' })
  businessModules(@CurrentUser('id') userId: string) { return this.service.businessModules(userId); }

  @Get('logistics/options')
  @ApiOperation({ summary: '移动物流调度可选车辆、司机和承运商' })
  logisticsOptions(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.service.logisticsOptions(userId, search);
  }

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

  @Get('quality-task-attachments/:id/view-url')
  async getQualityTaskAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.qualityService.findTaskAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('现场影像不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('quality-task-attachments/:id')
  async deleteQualityTaskAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.qualityService.findTaskAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return { deleted: false };
    await this.qualityService.deleteTaskAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
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

  @Get('weigh-task-attachments/:id/view-url')
  async getWeighTaskAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.weighService.findTaskAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('现场影像不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('weigh-task-attachments/:id')
  async deleteWeighTaskAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.weighService.findTaskAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return { deleted: false };
    await this.weighService.deleteTaskAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
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
  async updateWaybillStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!['IN_TRANSIT', 'ARRIVED', 'SIGNED', 'CANCELLED'].includes(status)) {
      throw new BadRequestException('小程序不支持该物流状态操作');
    }
    return this.waybillService.updateStatus(id, status, userId);
  }

  @Patch('waybills/:id/assignment')
  assignWaybill(
    @Param('id') id: string,
    @Body() data: {
      freightMode?: string; vehicleId?: string | null; driverId?: string | null;
      carrierPartnerId?: string | null; plateNo?: string | null;
      driverName?: string | null; driverPhone?: string | null;
      plannedDepartureAt?: string; plannedArrivalAt?: string;
    },
    @CurrentUser('id') userId: string,
  ) {
    return this.waybillService.assign(id, data, userId);
  }

  @Post('weigh-tickets/:id/records')
  addWeighRecord(@Param('id') id: string, @Body() dto: CreateWeighRecordDto, @CurrentUser('id') userId: string) {
    return this.weighService.addRecord(id, dto, userId);
  }

  @Post('weigh-tickets')
  createWeighTicket(@Body() dto: CreateWeighTicketDto, @CurrentUser('id') userId: string) {
    return this.weighService.create(dto, userId);
  }

  @Patch('weigh-tickets/:id/effective-records')
  selectEffectiveWeighRecords(
    @Param('id') id: string,
    @Body() data: { grossRecordId: string; tareRecordId: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!data.grossRecordId || !data.tareRecordId) throw new BadRequestException('请选择有效毛重和皮重记录');
    return this.weighService.selectEffectiveRecords(id, data, userId);
  }

  @Patch('weigh-tickets/:id/status')
  updateWeighStatus(
    @Param('id') id: string,
    @Body() data: { status: string; reviewRemark?: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!['COMPLETED', 'REVIEWED', 'VOIDED'].includes(data.status)) throw new BadRequestException('小程序不支持该磅单状态操作');
    return this.weighService.updateStatus(id, data.status, userId, data.reviewRemark);
  }

  @Patch('weigh-files/:waybillId/effective-ticket')
  selectEffectiveWeighTicket(
    @Param('waybillId') waybillId: string,
    @Body() data: { weighTicketId: string; reason?: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!data.weighTicketId) throw new BadRequestException('请选择执行磅单');
    return this.weighService.selectEffectiveTicket(waybillId, data.weighTicketId, data.reason, userId);
  }

  @Post('weigh-tickets/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadWeighTicketAttachment(
    @Param('id') weighTicketId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.saveBusinessAttachment(file, async (stored) => this.weighService.createAttachment({
      weighTicketId, ...stored,
    }, userId));
  }

  @Get('weigh-ticket-attachments/:id/view-url')
  async getWeighTicketAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.weighService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('weigh-ticket-attachments/:id')
  async deleteWeighTicketAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.weighService.findAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return { deleted: false };
    await this.weighService.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
  }

  @Patch('quality-tasks/:id/sampling')
  updateQualitySampling(
    @Param('id') id: string,
    @Body() dto: UpdateQualityTaskSamplingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.qualityService.updateTaskSampling(id, dto, userId);
  }

  @Post('quality-inspections')
  createQualityInspection(@Body() dto: CreateQualityInspectionDto, @CurrentUser('id') userId: string) {
    return this.qualityService.create(dto, userId);
  }

  @Patch('quality-inspections/:id/status')
  confirmQualityInspection(
    @Param('id') id: string,
    @Body() data: { status: string; resolution?: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!['CONFIRMED', 'VOIDED'].includes(data.status)) throw new BadRequestException('小程序不支持该检测报告状态操作');
    return this.qualityService.updateStatus(id, data.status, userId, data.resolution);
  }

  @Post('quality-inspections/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadQualityReportAttachment(
    @Param('id') qualityInspectionId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.saveBusinessAttachment(file, async (stored) => this.qualityService.createAttachment({
      qualityInspectionId, ...stored, category: 'REPORT',
    }, userId));
  }

  @Get('quality-inspection-attachments/:id/view-url')
  async getQualityInspectionAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.qualityService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('quality-inspection-attachments/:id')
  async deleteQualityInspectionAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.qualityService.findAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return { deleted: false };
    await this.qualityService.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
  }

  @Patch('quality-tasks/:id/finalize')
  finalizeQualityTask(
    @Param('id') id: string,
    @Body() dto: FinalizeQualityTaskDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.qualityService.finalizeTask(id, dto, userId);
  }

  @Get('warehouses')
  activeWarehouses(@CurrentUser('id') userId: string) { return this.service.activeWarehouses(userId); }

  @Get('quality-institutions')
  activeQualityInstitutions(@CurrentUser('id') userId: string) {
    return this.service.activeQualityInstitutions(userId);
  }

  @Patch('inbound-receipts/:id')
  updateInboundReceipt(
    @Param('id') id: string,
    @Body() dto: UpdatePendingInboundReceiptDto,
    @CurrentUser('id') userId: string,
  ) { return this.inventoryService.updatePendingReceipt(id, dto, userId); }

  @Patch('inbound-receipts/:id/confirm')
  confirmInboundReceipt(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.inventoryService.confirmReceipt(id, userId);
  }

  @Post('inbound-receipts/:id/post')
  postInboundReceipt(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.inventoryService.postInventory(id, userId);
  }

  @Post('inbound-receipts/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadInboundAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.saveBusinessAttachment(file, stored => this.inventoryService.createAttachment({
      inboundReceiptId: id, ...stored, category: 'RECEIPT_EVIDENCE',
    }, userId));
  }

  @Get('inbound-receipt-attachments/:id/view-url')
  async inboundAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.inventoryService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('inbound-receipt-attachments/:id')
  async deleteInboundAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.inventoryService.findAttachmentById(id, userId, 'inventory.manage');
    if (!attachment) return { deleted: false };
    await this.inventoryService.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
  }

  @Patch('outbound-receipts/:id/variance')
  resolveOutboundVariance(
    @Param('id') id: string,
    @Body() data: { decision: string; reason: string },
    @CurrentUser('id') userId: string,
  ) { return this.outboundService.resolveVariance(id, data, userId); }

  @Post('outbound-receipts/:id/post')
  postOutboundReceipt(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.outboundService.post(id, userId);
  }

  @Post('outbound-receipts/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadOutboundAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.saveBusinessAttachment(file, stored => this.outboundService.createAttachment({
      outboundReceiptId: id, ...stored, category: 'OUTBOUND_EVIDENCE',
    }, userId));
  }

  @Get('outbound-receipt-attachments/:id/view-url')
  async outboundAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.outboundService.findAttachmentById(id, userId);
    if (!attachment) throw new BadRequestException('附件不存在');
    return { url: await this.fileService.getUrl(attachment.fileName) };
  }

  @Delete('outbound-receipt-attachments/:id')
  async deleteOutboundAttachment(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const attachment = await this.outboundService.findAttachmentById(id, userId, 'inventory.manage');
    if (!attachment) return { deleted: false };
    await this.outboundService.deleteAttachment(id, userId);
    try { await this.fileService.delete(attachment.fileName); } catch {}
    return { deleted: true };
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

  private async saveBusinessAttachment<T>(
    file: Express.Multer.File,
    save: (stored: { fileName: string; originalName: string; mimeType: string; size: number }) => Promise<T>,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const mimeType = attachmentMimeType(originalName, file.mimetype);
    if (!mimeType) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const result = await this.fileService.upload(file.buffer, originalName, mimeType);
    try {
      return await save({ fileName: result.fileName, originalName, mimeType, size: result.size });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }
}
