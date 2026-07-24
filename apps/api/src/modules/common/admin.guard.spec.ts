import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const contextFor = (role?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext);

  it('allows administrators', () => {
    expect(new AdminGuard().canActivate(contextFor('ADMIN'))).toBe(true);
  });

  it.each(['APPROVER', 'USER', undefined])('rejects non-administrator role %s', (role) => {
    expect(() => new AdminGuard().canActivate(contextFor(role))).toThrow(ForbiddenException);
  });
});
