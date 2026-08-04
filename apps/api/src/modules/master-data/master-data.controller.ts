import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MasterDataService } from './master-data.service';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';

@ApiTags('主数据管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('master-data')
export class MasterDataController {
  constructor(private masterDataService: MasterDataService) {}

  // ===== 物料分类 =====

  @Post('material-categories')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建物料分类' })
  createCategory(@Body() dto: { name: string; parentId?: string; sort?: number }) {
    return this.masterDataService.createCategory(dto);
  }

  @Get('material-categories')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '物料分类树' })
  findAllCategories() {
    return this.masterDataService.findAllCategories();
  }

  @Patch('material-categories/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '更新物料分类' })
  updateCategory(@Param('id') id: string, @Body() dto: { name?: string; parentId?: string | null; sort?: number }) {
    return this.masterDataService.updateCategory(id, dto);
  }

  @Delete('material-categories/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '删除物料分类' })
  deleteCategory(@Param('id') id: string) {
    return this.masterDataService.deleteCategory(id);
  }

  // ===== 物料 =====

  @Get('materials/next-code')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '获取下一个物料编码' })
  getMaterialNextCode() {
    return this.masterDataService.generateNextMaterialCode();
  }

  @Post('materials')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建物料' })
  createMaterial(@Body() dto: {
    code?: string; name: string; categoryId: string; grade?: string;
    unit?: string; spec?: string; sourceRegion?: string; packageType?: string;
    isVirtual?: boolean; specs?: object; hsCode?: string; taxCode?: string;
    internalCode?: string; qcTemplate?: string; status?: string; remark?: string;
  }) {
    return this.masterDataService.createMaterial(dto);
  }

  @Get('materials')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '物料列表' })
  findAllMaterials(
    @Query('page') page?: string, @Query('pageSize') pageSize?: string,
    @Query('search') search?: string, @Query('categoryId') categoryId?: string,
  ) {
    return this.masterDataService.findAllMaterials({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search, categoryId,
    });
  }

  @Get('materials/:id')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '物料详情' })
  findMaterialById(@Param('id') id: string) {
    return this.masterDataService.findMaterialById(id);
  }

  @Patch('materials/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '更新物料' })
  updateMaterial(@Param('id') id: string, @Body() dto: {
    name?: string; categoryId?: string; grade?: string; unit?: string;
    spec?: string; sourceRegion?: string; packageType?: string;
    isVirtual?: boolean; specs?: object; hsCode?: string; taxCode?: string;
    internalCode?: string; qcTemplate?: string; status?: string; remark?: string;
  }) {
    return this.masterDataService.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '删除物料（软删除）' })
  deleteMaterial(@Param('id') id: string) {
    return this.masterDataService.deleteMaterial(id);
  }

  // ===== 仓库 =====

  @Post('warehouses')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '创建仓库' })
  createWarehouse(@Body() dto: {
    code: string; name: string; type?: string; partnerId?: string;
    address?: string; manager?: string; managerPhone?: string; remark?: string;
  }) {
    return this.masterDataService.createWarehouse(dto);
  }

  @Get('warehouses')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '仓库列表' })
  findAllWarehouses() {
    return this.masterDataService.findAllWarehouses();
  }

  @Get('warehouses/:id')
  @RequirePermission('master_data.view')
  @ApiOperation({ summary: '仓库详情' })
  findWarehouseById(@Param('id') id: string) {
    return this.masterDataService.findWarehouseById(id);
  }

  @Patch('warehouses/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '更新仓库' })
  updateWarehouse(@Param('id') id: string, @Body() dto: {
    name?: string; type?: string; partnerId?: string;
    address?: string; manager?: string; managerPhone?: string;
    status?: string; remark?: string;
  }) {
    return this.masterDataService.updateWarehouse(id, dto);
  }

  @Delete('warehouses/:id')
  @RequirePermission('master_data.manage')
  @ApiOperation({ summary: '删除仓库（软删除）' })
  deleteWarehouse(@Param('id') id: string) {
    return this.masterDataService.deleteWarehouse(id);
  }
}
