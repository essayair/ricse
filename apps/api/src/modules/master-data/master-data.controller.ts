import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MasterDataService } from './master-data.service';

@ApiTags('主数据管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('master-data')
export class MasterDataController {
  constructor(private masterDataService: MasterDataService) {}

  // ===== 供应商 =====

  @Post('suppliers')
  @ApiOperation({ summary: '创建供应商' })
  createSupplier(@Body() dto: { code: string; name: string; contactPerson?: string; contactPhone?: string; address?: string }) {
    return this.masterDataService.createSupplier(dto);
  }

  @Get('suppliers')
  @ApiOperation({ summary: '供应商列表' })
  findAllSuppliers(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('search') search?: string) {
    return this.masterDataService.findAllSuppliers({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
    });
  }

  // ===== 物料 =====

  @Post('materials')
  @ApiOperation({ summary: '创建物料' })
  createMaterial(@Body() dto: { code: string; name: string; category: string; unit?: string; spec?: string }) {
    return this.masterDataService.createMaterial(dto);
  }

  @Get('materials')
  @ApiOperation({ summary: '物料列表' })
  findAllMaterials(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.masterDataService.findAllMaterials({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      category,
    });
  }

  // ===== 仓库 =====

  @Post('warehouses')
  @ApiOperation({ summary: '创建仓库' })
  createWarehouse(@Body() dto: { code: string; name: string; address?: string }) {
    return this.masterDataService.createWarehouse(dto);
  }

  @Get('warehouses')
  @ApiOperation({ summary: '仓库列表' })
  findAllWarehouses() {
    return this.masterDataService.findAllWarehouses();
  }
}
