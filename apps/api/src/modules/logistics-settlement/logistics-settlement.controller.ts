import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateLogisticsSettlementDto, SetLinePriceDto, SetLineWeightDto, SetPayerDto } from './dto/logistics-settlement.dto';
import { LogisticsSettlementService } from './logistics-settlement.service';

@ApiTags('物流结算单')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('logistics-settlements')
export class LogisticsSettlementController {
  constructor(private readonly service: LogisticsSettlementService) {}

  @Get('options')
  options(@CurrentUser('id') userId: string) { return this.service.options(userId); }

  @Get('candidate-waybills')
  listCandidateWaybills(
    @CurrentUser('id') userId: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    return this.service.listCandidateWaybills({ periodStart, periodEnd }, userId);
  }

  @Post('candidate-waybills/:id/carrier')
  bindCandidateCarrier(
    @Param('id') id: string,
    @Body('carrierPartnerId') carrierPartnerId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.bindCandidateCarrier(id, carrierPartnerId, userId);
  }

  @Post()
  create(@Body() dto: CreateLogisticsSettlementDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.service.findAll({ status }, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Post(':id/lines/:lineId/price')
  setLinePrice(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: SetLinePriceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.setLinePrice(id, lineId, dto, userId);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.submit(id, userId);
  }

  @Get(':id/lines/:lineId/options')
  lineOptions(@Param('id') id: string, @Param('lineId') lineId: string, @CurrentUser('id') userId: string) { return this.service.lineOptions(id, lineId, userId); }

  @Post(':id/lines/:lineId/weight')
  weight(@Param('id') id: string, @Param('lineId') lineId: string, @Body() dto: SetLineWeightDto, @CurrentUser('id') userId: string) { return this.service.setLineWeight(id, lineId, dto, userId); }

  @Post(':id/payer')
  payer(@Param('id') id: string, @Body() dto: SetPayerDto, @CurrentUser('id') userId: string) { return this.service.setPayer(id, dto, userId); }

  @Post(':id/return-draft')
  returnDraft(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.service.returnDraft(id, userId); }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) { return this.service.uploadAttachment(id, file, userId); }

  @Get(':id/attachments/:attachmentId/view-url')
  view(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) { return this.service.attachment(id, attachmentId, userId); }

  @Delete(':id/attachments/:attachmentId')
  remove(@Param('id') id: string, @Param('attachmentId') attachmentId: string, @CurrentUser('id') userId: string) { return this.service.attachment(id, attachmentId, userId, true); }

  @Post(':id/review')
  review(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.review(id, userId);
  }

  @Post(':id/void')
  voidSettlement(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.voidSettlement(id, userId);
  }
}
