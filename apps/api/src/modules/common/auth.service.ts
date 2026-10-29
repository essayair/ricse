import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { LoginThrottleService } from './login-throttle.service';
import { comparePassword, hashPassword, TIMING_EQUALIZER_HASH } from './password-hasher';

@Injectable()
export class AuthService {
  private readonly refreshTokenExpiry = '7d';

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private loginThrottle: LoginThrottleService,
  ) {}

  async login(identifier: string, password: string, ip?: string) {
    const user = await this.usersService.findByLoginIdentifier(identifier);
    const attempt = await this.loginThrottle.acquire(this.loginThrottle.accountKey(user?.id, identifier), ip);

    // 账号不存在时也比对一次固定哈希，使两条路径耗时一致，不能据此判断账号是否存在。
    const valid = await comparePassword(password, user?.password ?? TIMING_EQUALIZER_HASH);
    if (!user || !valid) throw new UnauthorizedException('用户名、手机号或密码错误');

    await this.loginThrottle.succeed(attempt);
    await this.usersService.assertActiveForAuthentication(user.id);
    return this.generateTokens(user);
  }

  async register(data: { username: string; password: string; name: string; role?: string }) {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const publicRegistrationEnabled =
      this.configService.get<string>('ALLOW_PUBLIC_REGISTRATION') === 'true';
    if (isProduction && !publicRegistrationEnabled) {
      throw new ForbiddenException('线上环境未开放用户自助注册');
    }

    // 自助注册永远只能创建普通用户，管理员和审批角色由系统管理员分配。
    const { role: _ignoredRole, ...safeData } = data;
    const user = await this.usersService.create(safeData, { allowUnbound: true });
    return this.generateTokens(user as any);
  }

  async refresh(refreshToken: string) {
    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException('刷新令牌无效');
    }
    if (!payload.sub) throw new UnauthorizedException('刷新令牌无效');
    const user = await this.usersService.findByRefreshToken(refreshToken, payload.sub);
    if (!user) throw new UnauthorizedException('刷新令牌无效或已过期');

    await this.usersService.assertActiveForAuthentication(user.id);
    return this.generateTokens(user);
  }

  async profile(userId: string) {
    return this.usersService.findById(userId);
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
  }

  private async generateTokens(user: { id: string; username: string; role: string; name: string; tokenVersion?: number }) {
    const access = await this.usersService.getActiveAccess(user.id);
    const primaryRole = access.roles.includes(user.role) ? user.role : access.roles[0] || 'USER';
    const payload = { sub: user.id, username: user.username, role: primaryRole, tokenVersion: user.tokenVersion ?? 0 };
    const refreshPayload = { sub: user.id, type: 'refresh' };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshTokenExpiry,
    });
    // 新登录令牌立即持久化，避免返回给前端后尚不可刷新的竞态窗口。
    const refreshHash = await hashPassword(refreshToken);
    await this.usersService.setRefreshToken(user.id, refreshHash);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: primaryRole,
      roles: access.roles,
      permissions: access.permissions,
      token: accessToken,
      refreshToken,
    };
  }
}
