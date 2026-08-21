import { Body, Controller, Delete, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import {
  BindBackendAccountDto,
  LinkableAccountQueryDto,
  PlatformUserQueryDto,
  UnbindBackendAccountDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto';
import { PlatformUsersService } from './platform-users.service';

@ApiTags('个人用户管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@RequirePermission('system.user.manage')
@Controller('platform-users')
export class PlatformUsersController {
  constructor(private readonly service: PlatformUsersService) {}

  @Get()
  @ApiOperation({ summary: '个人用户列表' })
  findAll(@Query() query: PlatformUserQueryDto) { return this.service.findAll(query); }

  @Get('linkable-accounts')
  @ApiOperation({ summary: '可关联的后台企业账号' })
  findLinkableAccounts(@Query() query: LinkableAccountQueryDto) { return this.service.findLinkableAccounts(query); }

  @Get(':id')
  @ApiOperation({ summary: '个人用户详情及关联历史' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id')
  @ApiOperation({ summary: '启用或禁用个人用户' })
  update(@Param('id') id: string, @Body() dto: UpdatePlatformUserDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Put(':id/backend-account')
  @ApiOperation({ summary: '关联或重新关联后台账号' })
  bind(
    @Param('id') id: string,
    @Body() dto: BindBackendAccountDto,
    @CurrentUser('id') operatedById: string,
  ) {
    return this.service.bind(id, dto.userId, operatedById, dto.note);
  }

  @Delete(':id/backend-account')
  @ApiOperation({ summary: '解除后台账号关联' })
  unbind(
    @Param('id') id: string,
    @Body() dto: UnbindBackendAccountDto,
    @CurrentUser('id') operatedById: string,
  ) {
    return this.service.unbind(id, operatedById, dto.note);
  }
}
