import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceOrganizationInput, ServiceOrganizationService } from './service-organization.service';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';

@ApiTags('服务生态')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('service-organizations')
export class ServiceOrganizationController {
  constructor(private readonly service: ServiceOrganizationService) {}

  @Post()
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建物流承运商、质检机构或仓储与港口服务商档案' })
  create(@Body() dto: ServiceOrganizationInput) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '查询服务生态档案' })
  findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll({
      type, status, search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('master_data.view')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('master_data.manage')
  update(@Param('id') id: string, @Body() dto: Partial<ServiceOrganizationInput>) {
    return this.service.update(id, dto);
  }
}
