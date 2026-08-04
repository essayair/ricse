import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('系统总览')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: '按当前用户权限和数据范围返回系统总览' })
  overview(@CurrentUser('id') userId: string) {
    return this.service.overview(userId);
  }
}
