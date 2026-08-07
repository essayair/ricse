import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';
import { DriverService } from './driver.service';

@ApiTags('司机管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('drivers')
export class DriverController {
  constructor(private readonly service: DriverService) {}

  @Post()
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建物流司机档案' })
  create(@Body() dto: CreateDriverDto) { return this.service.create(dto); }

  @Get()
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '司机列表及模糊搜索' })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('serviceOrganizationId') serviceOrganizationId?: string,
    @Query('carrierPartnerId') carrierPartnerId?: string,
    @Query('internal') internal?: string,
  ) {
    return this.service.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status, search, serviceOrganizationId, carrierPartnerId,
      internal: internal === undefined ? undefined : internal === 'true',
    });
  }

  @Get(':id')
  @RequirePermission('master_data.view')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @RequirePermission('master_data.manage')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('master_data.manage')
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
