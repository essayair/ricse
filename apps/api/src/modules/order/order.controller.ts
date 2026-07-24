import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@ApiTags('合同执行批次管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @ApiOperation({ summary: '从已审批合同建立执行批次' })
  create(@Body() dto: CreateOrderDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '执行批次列表' })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      type,
      search,
    });
  }

  @Get('contracts/:id/availability')
  @ApiOperation({ summary: '查询合同明细剩余可执行数量' })
  getContractAvailability(
    @Param('id') id: string,
    @Query('type') type: string,
    @Query('excludeOrderId') excludeOrderId?: string,
  ) {
    return this.service.getContractAvailability(id, type, excludeOrderId);
  }

  @Get(':id')
  @ApiOperation({ summary: '执行批次详情' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改草稿执行批次' })
  update(@Param('id') id: string, @Body() data: {
    name?: string;
    plannedDate?: string;
    deliveryLocation?: string;
    remarks?: string;
    lineItems?: Array<{ contractLineItemId: string; quantity: number }>;
  }) {
    return this.service.update(id, data);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '执行批次状态流转' })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除草稿或已取消执行批次' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
