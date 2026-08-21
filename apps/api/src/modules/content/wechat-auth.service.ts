import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../common/users.service';
import { WechatTokenService } from '../common/wechat-token.service';

@Injectable()
export class WechatAuthService {
  private accessTokenCache?: { token: string; expiresAt: number };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly tokens: WechatTokenService,
  ) {}

  async login(code: string, profile?: { nickName?: string; avatarUrl?: string }) {
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');
    if (!appid || !secret) throw new ServiceUnavailableException('微信登录尚未配置');
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body: any = await res.json().catch(() => ({}));
    if (!body.openid) throw new UnauthorizedException(`微信登录失败：${body.errmsg || 'code 无效'}`);
    const identity = await this.prisma.wechatIdentity.upsert({
      where: { openId: body.openid },
      update: {
        unionId: body.unionid || undefined,
        lastLogin: new Date(),
        nickName: profile?.nickName?.trim() || undefined,
        avatarUrl: profile?.avatarUrl?.trim() || undefined,
      },
      create: {
        openId: body.openid,
        unionId: body.unionid || null,
        nickName: profile?.nickName?.trim() || null,
        avatarUrl: profile?.avatarUrl?.trim() || null,
      },
    });
    if (identity.status !== 'ACTIVE') throw new UnauthorizedException('该小程序用户已被停用');
    return { token: this.tokens.sign(body.openid), openid: body.openid, ...(await this.getMe(body.openid)) };
  }

  async getMe(openId: string) {
    const identity = await this.prisma.wechatIdentity.findUnique({
      where: { openId },
      include: {
        linkedUser: {
          include: {
            company: { select: { id: true, code: true, name: true, type: true, status: true } },
            employee: { include: { department: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!identity) throw new UnauthorizedException('小程序用户不存在');
    if (identity.status !== 'ACTIVE') throw new UnauthorizedException('该小程序用户已被停用');

    const linked = identity.linkedUser;
    const workspaceEnabled = Boolean(
      linked
      && linked.status === 'ACTIVE'
      && linked.company?.status === 'ACTIVE'
      && linked.employee?.status === 'ACTIVE',
    );
    const access = workspaceEnabled && linked
      ? await this.users.getActiveAccess(linked.id)
      : { roles: [], permissions: [] };
    return {
      identity: {
        id: identity.id,
        nickName: identity.nickName,
        avatarUrl: identity.avatarUrl,
        phone: identity.phone,
        phoneVerified: Boolean(identity.phoneVerifiedAt),
        status: identity.status,
        lastLogin: identity.lastLogin,
      },
      bindingStatus: !linked ? 'UNBOUND' : workspaceEnabled ? 'BOUND' : 'ACCOUNT_DISABLED',
      workspaceEnabled,
      account: linked ? {
        id: linked.id,
        username: linked.username,
        name: linked.name,
        status: linked.status,
        company: linked.company ? {
          id: linked.company.id,
          code: linked.company.code,
          name: linked.company.name,
          type: linked.company.type,
        } : null,
        employee: linked.employee ? {
          id: linked.employee.id,
          name: linked.employee.name,
          phone: linked.employee.phone,
          position: linked.employee.position,
          department: linked.employee.department,
        } : null,
        roles: access.roles,
        permissions: access.permissions,
      } : null,
    };
  }

  async updateProfile(openId: string, profile: { nickName?: string; avatarUrl?: string }) {
    await this.assertActiveIdentity(openId);
    await this.prisma.wechatIdentity.update({
      where: { openId },
      data: {
        nickName: profile.nickName?.trim() || undefined,
        avatarUrl: profile.avatarUrl?.trim() || undefined,
      },
    });
    return this.getMe(openId);
  }

  async bindVerifiedPhone(openId: string, code: string) {
    await this.assertActiveIdentity(openId);
    const accessToken = await this.getWechatAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body: any = await response.json().catch(() => ({}));
    const phone = body?.phone_info?.purePhoneNumber || body?.phone_info?.phoneNumber;
    if (body.errcode !== 0 || !phone) {
      throw new BadRequestException(`获取微信手机号失败：${body.errmsg || '授权码无效或已过期'}`);
    }
    if (!/^1[3-9][0-9]{9}$/.test(String(phone))) {
      throw new BadRequestException('当前仅支持中国大陆 11 位手机号');
    }
    await this.prisma.wechatIdentity.update({
      where: { openId },
      data: { phone: String(phone), phoneVerifiedAt: new Date() },
    });
    return this.getMe(openId);
  }

  private async assertActiveIdentity(openId: string) {
    const identity = await this.prisma.wechatIdentity.findUnique({ where: { openId } });
    if (!identity || identity.status !== 'ACTIVE') throw new UnauthorizedException('小程序用户不存在或已停用');
    return identity;
  }

  private async getWechatAccessToken() {
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) {
      return this.accessTokenCache.token;
    }
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');
    if (!appid || !secret) throw new ServiceUnavailableException('微信登录尚未配置');
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const body: any = await response.json().catch(() => ({}));
    if (!body.access_token) throw new ServiceUnavailableException(`获取微信接口凭证失败：${body.errmsg || '未知错误'}`);
    const expiresIn = Math.max(300, Number(body.expires_in || 7200));
    this.accessTokenCache = { token: body.access_token, expiresAt: Date.now() + (expiresIn - 120) * 1000 };
    return body.access_token as string;
  }

  verify(token?: string) {
    return this.tokens.verify(token);
  }

  verifyBearer(authorization?: string) {
    return this.tokens.verifyBearer(authorization);
  }
}
