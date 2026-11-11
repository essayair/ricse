import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { BilateralDirectService } from './bilateral-direct.service';
import { ConfirmDirectDeliveryDto, CreateDirectExecutionDto, DirectReasonDto, ReviewDirectDeliveryDto, ConvertDirectDeliveryDto } from './bilateral-direct.dto';

@ApiTags('双边直拨')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('bilateral-direct')
export class BilateralDirectController {
  constructor(private readonly service: BilateralDirectService) {}
  @Post('executions') create(@Body() dto: CreateDirectExecutionDto, @CurrentUser('id') id: string) { return this.service.createExecution(dto, id); }
  @Get('contracts/:id/review') contractReview(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.service.contractReview(id, uid); }
  @Get('contracts/:id/execution-options') executionOptions(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.service.executionOptions(id, uid); }
  @Get('warehouses') warehouses(@CurrentUser('id') uid: string) { return this.service.warehouses(uid); }
  @Get('waybills/:id') detail(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.service.detail(id, uid); }
  @Post('waybills/:id/preview') preview(@Param('id') id: string, @Body() dto: ConfirmDirectDeliveryDto, @CurrentUser('id') uid: string) { return this.service.preview(id, dto, uid); }
  @Post('waybills/:id/confirm') confirm(@Param('id') id: string, @Body() dto: ConfirmDirectDeliveryDto, @CurrentUser('id') uid: string) { return this.service.confirm(id, dto, uid); }
  @Post('waybills/:id/review') review(@Param('id') id: string, @Body() dto: ReviewDirectDeliveryDto, @CurrentUser('id') uid: string) { return this.service.review(id, dto.approved, dto.reason, uid); }
  @Post('waybills/:id/reverse') reverse(@Param('id') id: string, @Body() dto: DirectReasonDto, @CurrentUser('id') uid: string) { return this.service.reverse(id, dto.reason, uid); }
  @Post('waybills/:id/cancel') cancel(@Param('id') id: string, @Body() dto: DirectReasonDto, @CurrentUser('id') uid: string) { return this.service.cancel(id, dto.reason, uid); }
  @Post('waybills/:id/reject-return') reject(@Param('id') id: string, @Body() dto: DirectReasonDto, @CurrentUser('id') uid: string) { return this.service.rejectReturn(id, dto.reason, uid); }
  @Post('waybills/:id/to-warehouse') convert(@Param('id') id: string, @Body() dto: ConvertDirectDeliveryDto, @CurrentUser('id') uid: string) { return this.service.convertToWarehouse(id, dto, uid); }
}
