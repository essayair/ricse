import { Body, Controller, Ip, Post } from '@nestjs/common';
import { WechatLoginDto } from './dto/content.dto';
import { WechatAuthService } from './wechat-auth.service';
import { PublicRateLimitService } from './public-rate-limit.service';

@Controller('public/wechat')
export class WechatController {
  constructor(private readonly auth: WechatAuthService, private readonly rate: PublicRateLimitService) {}

  @Post('login')
  async login(@Body() dto: WechatLoginDto, @Ip() ip: string) {
    await this.rate.assert('wechat-login', ip, 20, 60);
    return this.auth.login(dto.code);
  }
}
