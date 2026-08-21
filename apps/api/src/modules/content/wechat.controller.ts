import { Body, Controller, Get, Headers, Ip, Patch, Post } from '@nestjs/common';
import { UpdateWechatProfileDto, WechatLoginDto, WechatPhoneDto } from './dto/content.dto';
import { WechatAuthService } from './wechat-auth.service';
import { PublicRateLimitService } from './public-rate-limit.service';

@Controller('public/wechat')
export class WechatController {
  constructor(private readonly auth: WechatAuthService, private readonly rate: PublicRateLimitService) {}

  @Post('login')
  async login(@Body() dto: WechatLoginDto, @Ip() ip: string) {
    await this.rate.assert('wechat-login', ip, 20, 60);
    return this.auth.login(dto.code, { nickName: dto.nickName, avatarUrl: dto.avatarUrl });
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.auth.getMe(this.auth.verifyBearer(authorization));
  }

  @Patch('profile')
  updateProfile(
    @Body() dto: UpdateWechatProfileDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.auth.updateProfile(this.auth.verifyBearer(authorization), dto);
  }

  @Post('phone')
  async bindPhone(
    @Body() dto: WechatPhoneDto,
    @Headers('authorization') authorization?: string,
    @Ip() ip?: string,
  ) {
    const openId = this.auth.verifyBearer(authorization);
    await this.rate.assert('wechat-phone', `${openId}:${ip || ''}`, 10, 3600);
    return this.auth.bindVerifiedPhone(openId, dto.code);
  }
}
