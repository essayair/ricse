import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { role?: string; roles?: string[] } | undefined;

    if (user?.role !== 'ADMIN' && !user?.roles?.includes('ADMIN')) {
      throw new ForbiddenException('仅系统管理员可以执行此操作');
    }

    return true;
  }
}
