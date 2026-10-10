import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CreateFleetDto, UpdateFleetDto } from './dto/fleet.dto';
import { FleetService } from './fleet.service';

@ApiTags('车队管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('fleets')
export class FleetController {
  constructor(private readonly service: FleetService) {}

  @Post()
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建车队（纯分组管理，不是正式合作伙伴档案）' })
  create(@Body() dto: CreateFleetDto) { return this.service.create(dto); }

  @Get()
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '车队列表及模糊搜索' })
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('carrierPartnerId') carrierPartnerId?: string,
  ) {
    return this.service.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status, search, carrierPartnerId,
    });
  }

  @Get(':id')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '车队详情，含全部成员司机、车辆' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '修改车队信息；carrierPartnerId 传空字符串表示解除挂靠' })
  update(@Param('id') id: string, @Body() dto: UpdateFleetDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @RequirePermission('master_data.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除车队，仍有成员时拒绝' })
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Post(':id/drivers')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '司机加入车队' })
  addDriver(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.service.addDriver(id, driverId);
  }

  @Delete(':id/drivers/:driverId')
  @RequirePermission('master_data.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '司机移出车队' })
  removeDriver(@Param('id') id: string, @Param('driverId') driverId: string) {
    return this.service.removeDriver(id, driverId);
  }

  @Post(':id/vehicles')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '车辆加入车队' })
  addVehicle(@Param('id') id: string, @Body('vehicleId') vehicleId: string) {
    return this.service.addVehicle(id, vehicleId);
  }

  @Delete(':id/vehicles/:vehicleId')
  @RequirePermission('master_data.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '车辆移出车队' })
  removeVehicle(@Param('id') id: string, @Param('vehicleId') vehicleId: string) {
    return this.service.removeVehicle(id, vehicleId);
  }
}
