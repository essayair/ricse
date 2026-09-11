import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { MonitorService } from './monitor.service';
import {
  CreateMonitorCameraDto, CreateMonitorSiteDto, UpdateMonitorCameraDto,
  UpdateMonitorPlatformDto, UpdateMonitorSiteDto, UpsertMonitorPlatformDto,
} from './dto/monitor.dto';

@ApiTags('监控录像')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('monitor')
export class MonitorController {
  constructor(private readonly service: MonitorService) {}

  @Get('platforms')
  @RequirePermission('monitor.view')
  @ApiOperation({ summary: '监控平台列表（appSecret 掩码）' })
  listPlatforms(@CurrentUser('id') userId: string) {
    return this.service.listPlatforms(userId);
  }

  @Post('platforms')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '新增监控平台' })
  createPlatform(@Body() dto: UpsertMonitorPlatformDto, @CurrentUser('id') userId: string) {
    return this.service.createPlatform(dto, userId);
  }

  @Patch('platforms/:id')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '修改监控平台，appSecret 留空表示不修改' })
  updatePlatform(
    @Param('id') id: string,
    @Body() dto: UpdateMonitorPlatformDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updatePlatform(id, dto, userId);
  }

  @Post('platforms/:id/test')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '平台连通性测试' })
  testPlatform(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.testPlatform(id, userId);
  }

  @Get('sites')
  @RequirePermission('monitor.view')
  @ApiOperation({ summary: '点位分组列表' })
  listSites(@CurrentUser('id') userId: string) {
    return this.service.listSites(userId);
  }

  @Post('sites')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '新增点位分组' })
  createSite(@Body() dto: CreateMonitorSiteDto, @CurrentUser('id') userId: string) {
    return this.service.createSite(dto, userId);
  }

  @Patch('sites/:id')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '修改点位分组' })
  updateSite(@Param('id') id: string, @Body() dto: UpdateMonitorSiteDto, @CurrentUser('id') userId: string) {
    return this.service.updateSite(id, dto, userId);
  }

  @Delete('sites/:id')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '删除点位分组，存在点位时拒绝' })
  removeSite(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.removeSite(id, userId);
  }

  @Get('cameras')
  @RequirePermission('monitor.view')
  @ApiOperation({ summary: '摄像头点位列表' })
  listCameras(
    @CurrentUser('id') userId: string,
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listCameras(userId, { siteId, status, search });
  }

  @Post('cameras')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '新增摄像头点位' })
  createCamera(@Body() dto: CreateMonitorCameraDto, @CurrentUser('id') userId: string) {
    return this.service.createCamera(dto, userId);
  }

  @Patch('cameras/:id')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '修改摄像头点位' })
  updateCamera(@Param('id') id: string, @Body() dto: UpdateMonitorCameraDto, @CurrentUser('id') userId: string) {
    return this.service.updateCamera(id, dto, userId);
  }

  @Delete('cameras/:id')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '删除摄像头点位' })
  removeCamera(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.removeCamera(id, userId);
  }

  @Post('cameras/:id/preview')
  @RequirePermission('monitor.view')
  @ApiOperation({ summary: '签发单路预览凭据' })
  previewCamera(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.previewCamera(id, userId);
  }

  @Post('refresh-status')
  @RequirePermission('monitor.manage')
  @ApiOperation({ summary: '刷新设备真实在线状态' })
  refreshStatus(@CurrentUser('id') userId: string) {
    return this.service.refreshStatus(userId);
  }
}
