import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { role?: string } | undefined;

    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException('仅系统管理员可以配置审批流程');
    }

    return true;
  }
}
