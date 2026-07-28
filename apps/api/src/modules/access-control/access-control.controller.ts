import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AccessControlService } from './access-control.service';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser } from '../common/current-user.decorator';

@ApiTags('角色与权限')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly service: AccessControlService) {}

  @Get('roles')
  @ApiOperation({ summary: '角色列表及权限' })
  findAllRoles() {
    return this.service.findAllRoles();
  }

  @Post('roles')
  @ApiOperation({ summary: '创建角色' })
  createRole(@Body() dto: {
    code: string;
    name: string;
    description?: string;
    type?: string;
    permissionIds?: string[];
  }) {
    return this.service.createRole(dto);
  }

  @Patch('roles/:id')
  @ApiOperation({ summary: '修改角色' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; type?: string; status?: string },
  ) {
    return this.service.updateRole(id, dto);
  }

  @Put('roles/:id/permissions')
  @ApiOperation({ summary: '替换角色权限' })
  replaceRolePermissions(
    @Param('id') id: string,
    @Body() dto: { permissionIds: string[] },
  ) {
    return this.service.replaceRolePermissions(id, dto.permissionIds || []);
  }

  @Get('permissions')
  @ApiOperation({ summary: '权限字典' })
  findAllPermissions() {
    return this.service.findAllPermissions();
  }

  @Get('users/:id/assignments')
  @ApiOperation({ summary: '查看用户角色与数据范围' })
  findUserAssignments(@Param('id') id: string) {
    return this.service.findUserAssignments(id);
  }

  @Put('users/:id/assignments')
  @ApiOperation({ summary: '配置用户角色与数据范围' })
  replaceUserAssignments(
    @Param('id') id: string,
    @Body() dto: {
      assignments: Array<{
        roleId: string;
        scopeType: string;
        targetCompanyIds?: string[];
        expiresAt?: string | null;
      }>;
    },
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.service.replaceUserAssignments(id, dto.assignments || [], currentUserId);
  }
}
