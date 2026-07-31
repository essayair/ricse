import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    ) || [];
    if (required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as {
      id?: string;
      role?: string;
      roles?: string[];
    } | undefined;
    if (!user?.id) throw new ForbiddenException('无法确认当前用户权限');
    if (user.role === 'ADMIN' || user.roles?.includes('ADMIN')) return true;

    const now = new Date();
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { status: 'ACTIVE' },
      },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
    const granted = new Set(
      assignments.flatMap((assignment) =>
        assignment.role.permissions.map((entry) => entry.permission.code),
      ),
    );
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`缺少权限：${missing.join('、')}`);
    }
    return true;
  }
}
