import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PartnerService } from './partner.service';

@ApiTags('往来单位')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('partners')
export class PartnerController {
  constructor(private partnerService: PartnerService) {}

  @Get('next-code')
  @ApiOperation({ summary: '获取下一个外部编码' })
  getNextCode() {
    return this.partnerService.generateNextExternalCode();
  }

  @Post()
  @ApiOperation({ summary: '创建往来单位' })
  create(@Body() dto: {
    code: string; name: string; shortName?: string; taxId?: string;
    legalPerson?: string; contactPerson?: string; contactPhone?: string;
    address?: string; bizAddress?: string; sourceRegion?: string;
    creditLimit?: number; roles: string[]; remark?: string;
  }) {
    return this.partnerService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '往来单位列表（分页）' })
  findAll(
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.partnerService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search, role, status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '往来单位详情（含银行账户/车辆/仓库）' })
  findOne(@Param('id') id: string) {
    return this.partnerService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新往来单位' })
  update(@Param('id') id: string, @Body() dto: {
    name?: string; shortName?: string; taxId?: string;
    legalPerson?: string; contactPerson?: string; contactPhone?: string;
    address?: string; bizAddress?: string; sourceRegion?: string;
    creditLimit?: number; roles?: string[]; status?: string; remark?: string;
  }) {
    return this.partnerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除往来单位（软删除）' })
  remove(@Param('id') id: string) {
    return this.partnerService.remove(id);
  }

  // ========== 银行账户 ==========

  @Post(':partnerId/bank-accounts')
  @ApiOperation({ summary: '添加银行账户' })
  createBankAccount(
    @Param('partnerId') partnerId: string,
    @Body() dto: { accountName: string; accountNo: string; bankName: string; bankCode?: string; accountType?: string; isDefault?: boolean },
  ) {
    return this.partnerService.createBankAccount({ ...dto, partnerId });
  }

  @Get(':partnerId/bank-accounts')
  @ApiOperation({ summary: '银行账户列表' })
  findBankAccounts(@Param('partnerId') partnerId: string) {
    return this.partnerService.findBankAccounts(partnerId);
  }

  @Delete('bank-accounts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除银行账户' })
  deleteBankAccount(@Param('id') id: string) {
    return this.partnerService.deleteBankAccount(id);
  }

  // ========== 车辆 ==========

  @Post('vehicles')
  @ApiOperation({ summary: '创建车辆' })
  createVehicle(@Body() dto: {
    plateNo: string; vehicleType: string; brand?: string; loadCapacity: number;
    ownerId?: string; ownerType?: string; driverName?: string; driverPhone?: string; remark?: string;
  }) {
    return this.partnerService.createVehicle(dto);
  }

  @Get('vehicles')
  @ApiOperation({ summary: '车辆列表（分页）' })
  findAllVehicles(
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('status') status?: string, @Query('ownerId') ownerId?: string,
  ) {
    return this.partnerService.findAllVehicles({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status, ownerId,
    });
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除车辆' })
  deleteVehicle(@Param('id') id: string) {
    return this.partnerService.deleteVehicle(id);
  }
}
