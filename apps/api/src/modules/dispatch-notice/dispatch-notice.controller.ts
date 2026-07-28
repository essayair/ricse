import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { DispatchNoticeService } from './dispatch-notice.service';
import { CreateDispatchNoticeDto } from './dto/create-dispatch-notice.dto';

@ApiTags('执行通知管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dispatch-notices')
export class DispatchNoticeController {
  constructor(private readonly service: DispatchNoticeService) {}

  @Post()
  @ApiOperation({ summary: '从执行批次建立供应商发货指令或销售发货通知单' })
  create(@Body() dto: CreateDispatchNoticeDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ status, type, search }, userId);
  }

  @Get('orders/:id/availability')
  getAvailability(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getOrderAvailability(id, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser('id') userId: string) {
    return this.service.updateStatus(id, status, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.remove(id, userId);
  }
}
