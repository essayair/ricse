import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WechatTokenService {
  constructor(private readonly config: ConfigService) {}

  private secret() {
    return this.config.get<string>('WECHAT_TOKEN_SECRET')
      || this.config.get<string>('AUTH_TOKEN_SECRET')
      || 'change-me';
  }

  sign(openId: string) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { openid: openId, iat: now, exp: now + 30 * 86400 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  verify(token?: string) {
    if (!token) throw new UnauthorizedException('缺少登录凭证');
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) throw new UnauthorizedException('登录凭证格式错误');
    const expected = crypto.createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException('登录凭证无效');
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.openid || payload.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException('登录已过期');
    return String(payload.openid);
  }

  verifyBearer(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('缺少登录凭证');
    return this.verify(authorization.slice(7).trim());
  }
}
