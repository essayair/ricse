import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateLogisticsSettlementDto, SetLinePriceDto } from './dto/logistics-settlement.dto';
import { LogisticsSettlementService } from './logistics-settlement.service';

@ApiTags('物流结算单')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('logistics-settlements')
export class LogisticsSettlementController {
  constructor(private readonly service: LogisticsSettlementService) {}

  @Get('candidate-waybills')
  listCandidateWaybills(
    @CurrentUser('id') userId: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ) {
    return this.service.listCandidateWaybills({ periodStart, periodEnd }, userId);
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

  @Post(':id/review')
  review(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.review(id, userId);
  }

  @Post(':id/void')
  voidSettlement(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.voidSettlement(id, userId);
  }
}
