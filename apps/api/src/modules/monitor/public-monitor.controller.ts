import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MonitorService } from './monitor.service';
import { PublicRateLimitService } from '../content/public-rate-limit.service';
import { MonitorPtzDto } from './dto/monitor.dto';

/**
 * 官网与数字大屏使用的公开接口。
 *
 * 与内容公开接口一致挂在 /api/v1/public 下（由 nginx 路由到 content-api），
 * 只下发点位清单和短期 accessToken，appKey / appSecret 不出服务端。
 */
@ApiTags('公开监控')
@Controller('public/monitor')
export class PublicMonitorController {
  constructor(
    private readonly service: MonitorService,
    private readonly rate: PublicRateLimitService,
  ) {}

  @Get('cameras')
  @ApiOperation({ summary: '监控点位分组，字段与官网既有结构一致' })
  async cameras(@Ip() ip: string) {
    await this.rate.assert('monitor-cameras', ip, 120, 60);
    return this.service.publicCameraGroups();
  }

  @Post('access-token')
  @ApiOperation({ summary: '下发播放器所需的短期 accessToken' })
  async accessToken(@Ip() ip: string) {
    await this.rate.assert('monitor-token', ip, 30, 60);
    return this.service.publicAccessToken();
  }

  @Post('ptz/start')
  @ApiOperation({ summary: '云台开始动作' })
  async ptzStart(@Body() dto: MonitorPtzDto, @Ip() ip: string) {
    await this.rate.assert('monitor-ptz', ip, 120, 60);
    return this.service.publicPtz('start', dto.cameraId, dto.direction, dto.speed);
  }

  @Post('ptz/stop')
  @ApiOperation({ summary: '云台停止动作' })
  async ptzStop(@Body() dto: MonitorPtzDto, @Ip() ip: string) {
    await this.rate.assert('monitor-ptz', ip, 120, 60);
    return this.service.publicPtz('stop', dto.cameraId, dto.direction);
  }
}
