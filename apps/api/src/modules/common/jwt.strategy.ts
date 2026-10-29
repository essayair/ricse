import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: { sub: string; username: string; role: string; tokenVersion?: number }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('账号不存在');
    // 老版本令牌未包含版本号，按初始版本 0 处理；登出后同样立即失效。
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }
    if (
      !user
      || user.status !== 'ACTIVE'
      || (user.companyId && !user.employeeId)
      || (user.employeeId && user.employee?.status !== 'ACTIVE')
      || (user.companyId && user.company?.status !== 'ACTIVE')
    ) {
      throw new UnauthorizedException('账号、员工或所属企业已停用');
    }
    const roleCodes = user.roleAssignments
      .filter((assignment) =>
        assignment.role.status === 'ACTIVE'
        && (!assignment.expiresAt || assignment.expiresAt > new Date()),
      )
      .map((assignment) => assignment.role.code);
    return {
      id: user.id,
      username: user.username,
      role: roleCodes[0] || 'USER',
      roles: roleCodes,
      companyId: user.companyId,
      companyType: user.company?.type,
    };
  }
}
