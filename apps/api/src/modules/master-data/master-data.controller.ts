import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MasterDataService } from './master-data.service';

@ApiTags('主数据管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('master-data')
export class MasterDataController {
  constructor(private masterDataService: MasterDataService) {}

  // ===== 物料分类 =====

  @Post('material-categories')
  @ApiOperation({ summary: '创建物料分类' })
  createCategory(@Body() dto: { name: string; parentId?: string; sort?: number }) {
    return this.masterDataService.createCategory(dto);
  }

  @Get('material-categories')
  @ApiOperation({ summary: '物料分类树' })
  findAllCategories() {
    return this.masterDataService.findAllCategories();
  }

  // ===== 物料 =====

  @Post('materials')
  @ApiOperation({ summary: '创建物料' })
  createMaterial(@Body() dto: {
    code: string; name: string; categoryId: string; grade: string;
    unit?: string; spec?: string; sourceRegion?: string; packageType?: string; remark?: string;
  }) {
    return this.masterDataService.createMaterial(dto);
  }

  @Get('materials')
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

  @Delete('materials/:id')
  @ApiOperation({ summary: '删除物料（软删除）' })
  deleteMaterial(@Param('id') id: string) {
    return this.masterDataService.deleteMaterial(id);
  }

  // ===== 仓库 =====

  @Post('warehouses')
  @ApiOperation({ summary: '创建仓库' })
  createWarehouse(@Body() dto: {
    code: string; name: string; type?: string; partnerId?: string;
    address?: string; manager?: string; managerPhone?: string; remark?: string;
  }) {
    return this.masterDataService.createWarehouse(dto);
  }

  @Get('warehouses')
  @ApiOperation({ summary: '仓库列表' })
  findAllWarehouses() {
    return this.masterDataService.findAllWarehouses();
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: '删除仓库（软删除）' })
  deleteWarehouse(@Param('id') id: string) {
    return this.masterDataService.deleteWarehouse(id);
  }
}
