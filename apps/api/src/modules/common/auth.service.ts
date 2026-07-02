import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly refreshTokenExpiry = '7d';

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    return this.generateTokens(user);
  }

  async register(data: { username: string; password: string; name: string; role?: string }) {
    const user = await this.usersService.create(data);
    return this.generateTokens(user as any);
  }

  async refresh(refreshToken: string) {
    const user = await this.usersService.findByRefreshToken(refreshToken);
    if (!user) throw new UnauthorizedException('刷新令牌无效或已过期');

    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
    });
    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException('刷新令牌无效');
    }

    return this.generateTokens(user);
  }

  async profile(userId: string) {
    return this.usersService.findById(userId);
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
  }

  private generateTokens(user: { id: string; username: string; role: string; name: string }) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const refreshPayload = { sub: user.id, type: 'refresh' };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.refreshTokenExpiry,
    });

    // Store refresh token hash in DB
    bcrypt.hash(refreshToken, 10).then((hash) => {
      this.usersService.setRefreshToken(user.id, hash).catch(() => {});
    });

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      token: accessToken,
      refreshToken,
    };
  }
}
