import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { CreateWeighRecordDto } from './dto/create-weigh-record.dto';
import { CreateWeighTicketDto } from './dto/create-weigh-ticket.dto';
import { WeighTicketService } from './weigh-ticket.service';

@ApiTags('磅单管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('weigh-tickets')
export class WeighTicketController {
  constructor(private readonly service: WeighTicketService, private readonly fileService: FileService) {}

  @Post()
  @ApiOperation({ summary: '从已到达物流运单创建磅单' })
  create(@Body() dto: CreateWeighTicketDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query('status') status?: string, @Query('abnormal') abnormal?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, abnormal, search }, userId);
  }

  @Get('eligible-waybills')
  eligibleWaybills(@CurrentUser('id') userId: string) {
    return this.service.eligibleWaybills(userId);
  }

  @Get('attachments/:id/view-url')
  async getAttachmentViewUrl(@Param('id') id: string, @CurrentUser('id') userId: string) {
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
    @Param('id') weighTicketId: string,
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
        weighTicketId, fileName: result.fileName, originalName,
        mimeType, size: result.size,
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

  @Post(':id/records')
  addRecord(@Param('id') id: string, @Body() dto: CreateWeighRecordDto, @CurrentUser('id') userId: string) {
    return this.service.addRecord(id, dto, userId);
  }

  @Patch(':id/effective-records')
  selectRecords(@Param('id') id: string, @Body() data: { grossRecordId: string; tareRecordId: string }, @CurrentUser('id') userId: string) {
    return this.service.selectEffectiveRecords(id, data, userId);
  }

  @Patch(':id/settlement')
  updateSettlement(@Param('id') id: string, @Body() data: {
    settlementBasis: string; shippingWeight?: number; customerWeight?: number;
    thirdPartyWeight?: number; manualWeight?: number; toleranceRate?: number;
  }, @CurrentUser('id') userId: string) {
    return this.service.updateSettlement(id, data, userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() data: { status: string; reviewRemark?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateStatus(id, data.status, userId, data.reviewRemark);
  }

  @Patch(':id/print')
  @ApiOperation({ summary: '记录磅单打印时间' })
  markPrinted(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markPrinted(id, userId);
  }

  @Patch(':id/info')
  @ApiOperation({ summary: '修改磅单基本凭证信息' })
  updateInfo(@Param('id') id: string, @Body() data: {
    ticketDate: string; plateNo: string; materialName: string; materialSpec: string;
    shipperName: string; receiverName: string; packageCount: number;
    driverName: string; weighmasterName: string; remarks?: string;
  }, @CurrentUser('id') userId: string) {
    return this.service.updateInfo(id, data, userId);
  }
}

export function attachmentMimeType(fileName: string, reportedMimeType: string) {
  const extension = fileName.toLowerCase().split('.').pop() || '';
  const expected: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
  };
  const normalized = reportedMimeType.toLowerCase().split(';')[0].trim();
  const compatible: Record<string, string[]> = {
    jpg: ['image/jpeg', 'image/jpg'],
    jpeg: ['image/jpeg', 'image/jpg'],
    png: ['image/png'],
    webp: ['image/webp'],
    pdf: ['application/pdf'],
  };
  if (!expected[extension]) return null;
  if (normalized === 'application/octet-stream' || normalized === '') return expected[extension];
  return compatible[extension].includes(normalized) ? expected[extension] : null;
}
