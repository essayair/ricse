import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrgService } from './org.service';
import { CurrentUser } from '../common/current-user.decorator';

@ApiTags('组织数据')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  // ========== 企业 ==========

  @Post('companies')
  @ApiOperation({ summary: '创建企业' })
  createCompany(@Body() dto: { code: string; name: string; shortName?: string; type?: string; partnerId?: string; parentId?: string }) {
    return this.orgService.createCompany(dto);
  }

  @Get('companies')
  @ApiOperation({ summary: '企业列表' })
  findAllCompanies(@Query('type') type?: string) {
    return this.orgService.findAllCompanies(type);
  }

  @Get('companies/tree')
  @ApiOperation({ summary: '企业组织树' })
  findCompanyTree() {
    return this.orgService.findCompanyTree();
  }

  @Get('companies/:id')
  @ApiOperation({ summary: '企业详情' })
  findCompanyById(@Param('id') id: string) {
    return this.orgService.findCompanyById(id);
  }

  @Patch('companies/:id')
  @ApiOperation({ summary: '更新企业' })
  updateCompany(@Param('id') id: string, @Body() dto: { name?: string; shortName?: string; status?: string; parentId?: string }) {
    return this.orgService.updateCompany(id, dto);
  }

  // ========== 部门 ==========

  @Post('departments')
  @ApiOperation({ summary: '创建部门' })
  createDepartment(@Body() dto: { name: string; companyId: string; parentId?: string; sort?: number }) {
    return this.orgService.createDepartment(dto);
  }

  @Get('departments')
  @ApiOperation({ summary: '部门列表' })
  findAllDepartments(@Query('companyId') companyId?: string) {
    return this.orgService.findAllDepartments(companyId);
  }

  @Get('departments/tree')
  @ApiOperation({ summary: '部门树' })
  getDepartmentTree(@Query('companyId') companyId: string) {
    return this.orgService.getDepartmentTree(companyId);
  }

  @Delete('departments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除部门' })
  deleteDepartment(@Param('id') id: string) {
    return this.orgService.deleteDepartment(id);
  }

  // ========== 员工 ==========

  @Post('employees')
  @ApiOperation({ summary: '创建员工' })
  createEmployee(@Body() dto: { name: string; departmentId: string; companyId: string; position?: string; phone?: string; email?: string }) {
    return this.orgService.createEmployee(dto);
  }

  @Get('employees')
  @ApiOperation({ summary: '员工列表' })
  findAllEmployees(@Query('companyId') companyId?: string, @Query('departmentId') departmentId?: string) {
    return this.orgService.findAllEmployees(companyId, departmentId);
  }

  @Delete('employees/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除员工' })
  deleteEmployee(@Param('id') id: string) {
    return this.orgService.deleteEmployee(id);
  }

  // ========== 业务组 ==========

  @Post('business-groups')
  @ApiOperation({ summary: '创建业务组' })
  createBusinessGroup(@Body() dto: { name: string; description?: string; companyIds?: string[] }) {
    return this.orgService.createBusinessGroup(dto);
  }

  @Get('business-groups')
  @ApiOperation({ summary: '业务组列表' })
  findAllBusinessGroups() {
    return this.orgService.findAllBusinessGroups();
  }

  @Patch('business-groups/:id')
  @ApiOperation({ summary: '更新业务组' })
  updateBusinessGroup(@Param('id') id: string, @Body() dto: { name?: string; description?: string; companyIds?: string[] }) {
    return this.orgService.updateBusinessGroup(id, dto);
  }

  @Delete('business-groups/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除业务组' })
  deleteBusinessGroup(@Param('id') id: string) {
    return this.orgService.deleteBusinessGroup(id);
  }
}
