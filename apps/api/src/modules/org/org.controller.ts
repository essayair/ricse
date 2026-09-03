import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OrgService } from './org.service';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';

@ApiTags('组织数据')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  // ========== 企业 ==========

  @Post('companies')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '创建企业（从合作伙伴拉取基本信息）' })
  createCompany(@Body() dto: { partnerId: string; parentId?: string }) {
    return this.orgService.createCompany(dto);
  }

  @Get('companies')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '企业列表' })
  findAllCompanies(@Query('type') type?: string) {
    return this.orgService.findAllCompanies(type);
  }

  @Get('companies/tree')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '企业组织树' })
  findCompanyTree() {
    return this.orgService.findCompanyTree();
  }

  @Get('companies/:id')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '企业详情' })
  findCompanyById(@Param('id') id: string) {
    return this.orgService.findCompanyById(id);
  }

  @Patch('companies/:id')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '更新企业' })
  updateCompany(@Param('id') id: string, @Body() dto: { name?: string; shortName?: string; status?: string; parentId?: string }) {
    return this.orgService.updateCompany(id, dto);
  }

  // ========== 部门 ==========

  @Post('departments')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '创建部门' })
  createDepartment(@Body() dto: { name: string; companyId: string; parentId?: string; sort?: number }) {
    return this.orgService.createDepartment(dto);
  }

  @Get('departments')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '部门列表' })
  findAllDepartments(@Query('companyId') companyId?: string) {
    return this.orgService.findAllDepartments(companyId);
  }

  @Get('departments/tree')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '部门树' })
  getDepartmentTree(@Query('companyId') companyId: string) {
    return this.orgService.getDepartmentTree(companyId);
  }

  @Patch('departments/reorder')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '批量调整部门顺序' })
  reorderDepartments(@Body() dto: { companyId: string; orderedIds: string[] }) {
    return this.orgService.reorderDepartments(dto.companyId, dto.orderedIds);
  }

  @Patch('departments/:id')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '更新部门' })
  updateDepartment(@Param('id') id: string, @Body() dto: { name?: string; parentId?: string; sort?: number }) {
    return this.orgService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @RequirePermission('organization.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除部门' })
  deleteDepartment(@Param('id') id: string) {
    return this.orgService.deleteDepartment(id);
  }

  // ========== 员工 ==========

  @Post('employees')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '创建员工' })
  createEmployee(@Body() dto: {
    name: string; departmentId: string; companyId: string; phone: string;
    position?: string; email?: string; status?: string;
  }, @CurrentUser('id') operatedBy: string) {
    return this.orgService.createEmployee(dto, operatedBy);
  }

  @Get('employees')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '员工列表' })
  findAllEmployees(@Query('companyId') companyId?: string, @Query('departmentId') departmentId?: string) {
    return this.orgService.findAllEmployees(companyId, departmentId);
  }

  @Get('employees/:id')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '员工详情（含关联账号）' })
  findEmployeeById(@Param('id') id: string) {
    return this.orgService.findEmployeeById(id);
  }

  @Get('employees/:id/operation-logs')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '员工档案操作记录' })
  findEmployeeOperationLogs(@Param('id') id: string) {
    return this.orgService.findEmployeeOperationLogs(id);
  }

  @Patch('employees/:id')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '更新员工信息' })
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: {
      name?: string; departmentId?: string; companyId?: string;
      phone?: string; position?: string; email?: string; status?: string;
    },
    @CurrentUser('id') operatedBy: string,
  ) {
    return this.orgService.updateEmployee(id, dto, operatedBy);
  }

  @Delete('employees/:id')
  @RequirePermission('organization.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除员工' })
  deleteEmployee(@Param('id') id: string, @CurrentUser('id') operatedBy: string) {
    return this.orgService.deleteEmployee(id, operatedBy);
  }

  // ========== 业务组 ==========

  @Post('business-groups')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '创建业务组' })
  createBusinessGroup(@Body() dto: { name: string; description?: string; companyIds?: string[] }) {
    return this.orgService.createBusinessGroup(dto);
  }

  @Get('business-groups')
  @RequirePermission('organization.view')
  @ApiOperation({ summary: '业务组列表' })
  findAllBusinessGroups() {
    return this.orgService.findAllBusinessGroups();
  }

  @Patch('business-groups/:id')
  @RequirePermission('organization.manage')
  @ApiOperation({ summary: '更新业务组' })
  updateBusinessGroup(@Param('id') id: string, @Body() dto: { name?: string; description?: string; companyIds?: string[] }) {
    return this.orgService.updateBusinessGroup(id, dto);
  }

  @Delete('business-groups/:id')
  @RequirePermission('organization.manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除业务组' })
  deleteBusinessGroup(@Param('id') id: string) {
    return this.orgService.deleteBusinessGroup(id);
  }
}
