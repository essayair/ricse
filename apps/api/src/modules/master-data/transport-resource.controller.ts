import { Body, Controller, Delete, Get, HttpCode, Param, Post, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { RecognizeTransportResourceDto } from './dto/transport-resource.dto';
import { ResourceFiles, TransportResourceService } from './transport-resource.service';
import { recognizeTransportResource } from './transport-resource-recognition';

@ApiTags('司机车辆统一登记')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('transport-resources')
export class TransportResourceController {
  constructor(private readonly service: TransportResourceService) {}

  @Get('carriers')
  @RequirePermission('transport_resource.view')
  carrierOptions() { return this.service.carrierOptions(); }

  @Post('recognize')
  @RequirePermission('transport_resource.manage')
  recognize(@Body() dto: RecognizeTransportResourceDto) { return recognizeTransportResource(dto.text); }

  @Post()
  @RequirePermission('transport_resource.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'driverAttachments', maxCount: 6 }, { name: 'vehicleAttachments', maxCount: 6 }], { limits: { fileSize: 20 * 1024 * 1024, files: 12, fields: 1, fieldSize: 64 * 1024 } }))
  async create(@Body('payload') payload: string, @UploadedFiles() files: ResourceFiles, @CurrentUser('id') userId: string) {
    return this.service.create(await this.service.parsePayload(payload), files || {}, userId);
  }

  @Post(':kind/:id/attachments')
  @RequirePermission('transport_resource.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@Param('kind') kind: string, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) {
    return this.service.upload(kind, id, file, userId);
  }

  @Get(':kind/:id/attachments/:attachmentId/view-url')
  @RequirePermission('transport_resource.view')
  view(@Param('kind') kind: string, @Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) {
    return this.service.attachment(kind, id, attachmentId, userId);
  }

  @Delete(':kind/:id/attachments/:attachmentId')
  @RequirePermission('transport_resource.manage')
  @HttpCode(204)
  remove(@Param('kind') kind: string, @Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) {
    return this.service.attachment(kind, id, attachmentId, userId, true);
  }
}
