import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from './users.service';

describe('JwtStrategy', () => {
  const config = { get: jest.fn(() => 'test-secret') } as unknown as ConfigService;
  const users = { findById: jest.fn() } as unknown as UsersService;
  const strategy = new JwtStrategy(config, users);
  const user = {
    id: 'user-1', username: 'test', status: 'ACTIVE', tokenVersion: 1,
    companyId: null, employeeId: null, roleAssignments: [],
  };

  beforeEach(() => jest.clearAllMocks());

  it('退出登录后拒绝旧访问令牌', async () => {
    jest.spyOn(users, 'findById').mockResolvedValue(user as any);

    await expect(strategy.validate({ sub: user.id, username: user.username, role: 'USER', tokenVersion: 0 }))
      .rejects.toThrow(UnauthorizedException);
  });

  it('重新登录签发的新版本令牌可以访问', async () => {
    jest.spyOn(users, 'findById').mockResolvedValue(user as any);

    await expect(strategy.validate({ sub: user.id, username: user.username, role: 'USER', tokenVersion: 1 }))
      .resolves.toEqual(expect.objectContaining({ id: user.id }));
  });

  it('旧格式令牌在首次退出前仍兼容，退出后拒绝', async () => {
    const findById = jest.spyOn(users, 'findById');
    findById.mockResolvedValueOnce({ ...user, tokenVersion: 0 } as any)
      .mockResolvedValueOnce(user as any);
    const legacyPayload = { sub: user.id, username: user.username, role: 'USER' };

    await expect(strategy.validate(legacyPayload)).resolves.toEqual(expect.objectContaining({ id: user.id }));
    await expect(strategy.validate(legacyPayload)).rejects.toThrow(UnauthorizedException);
  });
});
