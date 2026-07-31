import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const prisma = {
    userRoleAssignment: {
      findMany: jest.fn(),
    },
  };

  const contextFor = (user?: { id?: string; role?: string; roles?: string[] }) => ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext);

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(['logistics.manage']);
  });

  it('allows an administrator without querying role permissions', async () => {
    const guard = new PermissionGuard(reflector as any, prisma as any);
    await expect(guard.canActivate(contextFor({ id: 'u1', role: 'ADMIN' }))).resolves.toBe(true);
    expect(prisma.userRoleAssignment.findMany).not.toHaveBeenCalled();
  });

  it('allows a user whose active role contains every required permission', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          permissions: [
            { permission: { code: 'logistics.manage' } },
            { permission: { code: 'logistics.view' } },
          ],
        },
      },
    ]);
    const guard = new PermissionGuard(reflector as any, prisma as any);
    await expect(guard.canActivate(contextFor({ id: 'u2', role: 'LOGISTICS_OPERATOR' }))).resolves.toBe(true);
  });

  it('rejects a user who lacks a required permission', async () => {
    prisma.userRoleAssignment.findMany.mockResolvedValue([
      { role: { permissions: [{ permission: { code: 'logistics.view' } }] } },
    ]);
    const guard = new PermissionGuard(reflector as any, prisma as any);
    await expect(guard.canActivate(contextFor({ id: 'u3', role: 'USER' })))
      .rejects.toThrow(ForbiddenException);
  });
});
