import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { CreateWaybillDto } from './dto/create-waybill.dto';
import { WaybillService } from './waybill.service';

@ApiTags('物流运单与调度')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('waybills')
export class WaybillController {
  constructor(private readonly service: WaybillService, private readonly fileService: FileService) {}

  @Post()
  create(@Body() dto: CreateWaybillDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, search });
  }

  @Get('dispatch-notices/:id/availability')
  getAvailability(@Param('id') id: string) {
    return this.service.getNoticeAvailability(id);
  }

  @Get('attachments/:id/view-url')
  async getAttachmentViewUrl(@Param('id') id: string) {
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(@Param('id') waybillId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择文件');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('仅支持 JPG/PNG/WEBP/PDF 格式');
    const originalName = normalizeUploadFilename(file.originalname).slice(0, 255);
    const result = await this.fileService.upload(file.buffer, originalName, file.mimetype);
    try {
      return await this.service.createAttachment({
        waybillId, fileName: result.fileName, originalName,
        mimeType: file.mimetype, size: result.size,
      });
    } catch (error) {
      try { await this.fileService.delete(result.fileName); } catch {}
      throw error;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/assignment')
  assign(@Param('id') id: string, @Body() data: {
    freightMode?: string; vehicleId?: string; carrierPartnerId?: string; carrierName?: string;
    plateNo?: string; driverName?: string; driverPhone?: string;
    plannedDepartureAt?: string; plannedArrivalAt?: string;
  }) {
    return this.service.assign(id, data);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
