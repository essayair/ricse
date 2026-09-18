import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post(':id/price-terms')
  addPriceTerm(@Param('id') id: string, @Body() dto: CreatePriceTermDto, @CurrentUser('id') userId: string) {
    return this.service.addPriceTerm(id, dto, userId);
  }
}
