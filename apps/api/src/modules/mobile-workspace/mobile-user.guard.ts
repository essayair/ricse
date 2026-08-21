import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WechatTokenService } from '../common/wechat-token.service';

@Injectable()
export class MobileUserGuard implements CanActivate {
  constructor(private readonly tokens: WechatTokenService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const openId = this.tokens.verifyBearer(request.headers.authorization);
    const identity = await this.prisma.wechatIdentity.findUnique({
      where: { openId },
      include: {
        linkedUser: {
          include: {
            company: true,
            employee: true,
            roleAssignments: { where: { status: 'ACTIVE' }, include: { role: true } },
          },
        },
      },
    });
    if (!identity || identity.status !== 'ACTIVE') throw new UnauthorizedException('小程序用户不存在或已停用');
    if (!identity.linkedUser) throw new ForbiddenException('尚未关联企业后台账号');
    const user = identity.linkedUser;
    if (user.status !== 'ACTIVE' || user.company?.status !== 'ACTIVE' || user.employee?.status !== 'ACTIVE') {
      throw new ForbiddenException('关联的后台账号、员工或企业已停用');
    }
    request.wechatIdentity = identity;
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      roles: user.roleAssignments.filter((item) => item.role.status === 'ACTIVE').map((item) => item.role.code),
      companyId: user.companyId,
      companyType: user.company?.type,
    };
    return true;
  }
}
