import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { NotificationService } from '../notification/notification.service';
import { MobileUserGuard } from './mobile-user.guard';

@ApiTags('小程序任务提醒')
@ApiBearerAuth()
@UseGuards(MobileUserGuard)
@Controller('mobile/notifications')
export class MobileNotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '查询当前用户的任务提醒' })
  list(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.notifications.list(userId, status);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '查询未读待办提醒数量' })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Get('subscription-config')
  @ApiOperation({ summary: '查询微信订阅消息模板配置' })
  subscriptionConfig() {
    return this.notifications.subscriptionConfig();
  }

  @Patch(':id/read')
  @ApiOperation({ summary: '标记一条提醒为已读' })
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: '全部标记为已读' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Post('wechat-enabled')
  @ApiOperation({ summary: '用户完成微信订阅授权后重新发送当前待办提醒' })
  enableWechat(@CurrentUser('id') userId: string) {
    return this.notifications.enableWechatForPending(userId);
  }
}
