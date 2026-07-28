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

  async validate(payload: { sub: string; username: string; role: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    const roleCodes = user.roleAssignments
      .filter((assignment) =>
        assignment.role.status === 'ACTIVE'
        && (!assignment.expiresAt || assignment.expiresAt > new Date()),
      )
      .map((assignment) => assignment.role.code);
    if (!roleCodes.includes(user.role)) roleCodes.push(user.role);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      roles: roleCodes,
      companyId: user.companyId,
      companyType: user.company?.type,
    };
  }
}
