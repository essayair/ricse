import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateLogisticsContractDto, CreatePriceTermDto, UpdateLogisticsContractStatusDto } from './dto/logistics-contract.dto';
import { LogisticsContractService } from './logistics-contract.service';

@ApiTags('物流合同')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('logistics-contracts')
export class LogisticsContractController {
  constructor(private readonly service: LogisticsContractService) {}

  @Get('options')
  options(@CurrentUser('id') userId: string) { return this.service.options(userId); }

  @Post()
  create(@Body() dto: CreateLogisticsContractDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('carrierPartnerId') carrierPartnerId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ status, carrierPartnerId, search }, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLogisticsContractStatusDto, @CurrentUser('id') userId: string) {
    return this.service.updateStatus(id, dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateLogisticsContractDto, @CurrentUser('id') userId: string) { return this.service.update(id, dto, userId); }

  @Get(':id/settlement-records')
  records(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.settlementRecords(id, userId); }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) { return this.service.uploadAttachment(id, file, userId); }

  @Get(':id/attachments/:attachmentId/view-url')
  view(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) { return this.service.attachment(id, attachmentId, userId); }

  @Delete(':id/attachments/:attachmentId')
  remove(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) { return this.service.attachment(id, attachmentId, userId, true); }

  @Post(':id/price-terms')
  addPriceTerm(@Param('id') id: string, @Body() dto: CreatePriceTermDto, @CurrentUser('id') userId: string) {
    return this.service.addPriceTerm(id, dto, userId);
  }
}
