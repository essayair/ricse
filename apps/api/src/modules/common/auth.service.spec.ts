import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { LoginThrottleService } from './login-throttle.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let loginThrottle: { accountKey: jest.Mock; acquire: jest.Mock; succeed: jest.Mock };

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    password: '',
    name: '测试用户',
    role: 'USER',
    status: 'ACTIVE',
    phone: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const hashed = await bcrypt.hash('correct-password', 10);
    mockUser.password = hashed;

    const mockUsersService = {
      findByUsername: jest.fn(),
      findByLoginIdentifier: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      findByRefreshToken: jest.fn(),
      setRefreshToken: jest.fn(),
      clearRefreshToken: jest.fn(),
      getActiveAccess: jest.fn().mockResolvedValue({ roles: ['USER'], permissions: [] }),
      assertActiveForAuthentication: jest.fn().mockResolvedValue({}),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn().mockReturnValue({ sub: 'user-1', type: 'refresh' }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          JWT_SECRET: 'test-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_EXPIRES_IN: '24h',
        };
        return config[key];
      }),
    };

    loginThrottle = {
      accountKey: jest.fn((userId: string | undefined, identifier: string) => (userId ? `user:${userId}` : `identifier:${identifier}`)),
      acquire: jest.fn().mockResolvedValue({ accountKey: 'user:user-1', ipKey: 'ip:1.2.3.4' }),
      succeed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoginThrottleService, useValue: loginThrottle },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService) as jest.Mocked<UsersService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('login', () => {
    it('正确凭据应登录成功并返回 JWT', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      const result = await service.login('testuser', 'correct-password');

      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.username).toBe('testuser');
      expect(result.name).toBe('测试用户');
      expect(result.role).toBe('USER');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', username: 'testuser', tokenVersion: 0 }),
      );
    });

    it('重新登录应在访问令牌中写入最新版本号', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue({ ...mockUser, tokenVersion: 2 } as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      await service.login('testuser', 'correct-password');

      expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 2 }));
    });

    it('密码错误应抛出 UnauthorizedException', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);

      await expect(service.login('testuser', 'wrong-password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('用户不存在应抛出 UnauthorizedException', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(null);

      await expect(service.login('nonexistent', 'any-password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('登录前按账号与来源 IP 占用失败计数，成功后清除', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      await service.login('testuser', 'correct-password', '1.2.3.4');

      expect(loginThrottle.acquire).toHaveBeenCalledWith('user:user-1', '1.2.3.4');
      expect(loginThrottle.succeed).toHaveBeenCalledWith({ accountKey: 'user:user-1', ipKey: 'ip:1.2.3.4' });
    });

    it('密码错误保留失败计数，不清除', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);

      await expect(service.login('testuser', 'wrong-password', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(loginThrottle.succeed).not.toHaveBeenCalled();
    });

    it('账号不存在时同样计数，并返回与密码错误相同的提示', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(null);

      await expect(service.login('nobody', 'any-password', '1.2.3.4')).rejects.toThrow('用户名、手机号或密码错误');
      expect(loginThrottle.acquire).toHaveBeenCalledWith('identifier:nobody', '1.2.3.4');
      expect(loginThrottle.succeed).not.toHaveBeenCalled();
    });

    it('失败次数超限时直接拒绝，正确密码也不能登录', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);
      loginThrottle.acquire.mockRejectedValue(new HttpException('登录失败次数过多，请 15 分钟后再试', HttpStatus.TOO_MANY_REQUESTS));

      await expect(service.login('testuser', 'correct-password', '1.2.3.4')).rejects.toThrow('登录失败次数过多');
      expect(jwtService.sign).not.toHaveBeenCalled();
      expect(usersService.setRefreshToken).not.toHaveBeenCalled();
    });

    it('手机号凭据应使用统一登录查询并返回账号身份', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      const result = await service.login('13800138000', 'correct-password');

      expect(usersService.findByLoginIdentifier).toHaveBeenCalledWith('13800138000');
      expect(result.username).toBe('testuser');
    });

    it('账号、员工或企业停用时不签发令牌', async () => {
      usersService.findByLoginIdentifier.mockResolvedValue(mockUser as any);
      usersService.assertActiveForAuthentication.mockRejectedValue(new UnauthorizedException('员工已停用'));

      await expect(service.login('testuser', 'correct-password')).rejects.toThrow('员工已停用');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('应创建用户并返回 token', async () => {
      usersService.create.mockResolvedValue({
        id: 'user-2',
        username: 'newuser',
        name: '新用户',
        role: 'USER',
        createdAt: new Date(),
      } as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      const result = await service.register({
        username: 'newuser',
        password: 'password123',
        name: '新用户',
      });

      expect(result).toHaveProperty('token');
      expect(result.username).toBe('newuser');
      expect(usersService.create).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'password123',
        name: '新用户',
      }, { allowUnbound: true });
    });

    it('线上默认禁止公开注册', async () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          NODE_ENV: 'production',
          JWT_SECRET: 'test-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
        };
        return config[key];
      });

      await expect(service.register({
        username: 'newuser',
        password: 'password123',
        name: '新用户',
      })).rejects.toThrow(ForbiddenException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('公开注册不能自行指定管理员角色', async () => {
      usersService.create.mockResolvedValue({
        id: 'user-2',
        username: 'newuser',
        name: '新用户',
        role: 'USER',
        createdAt: new Date(),
      } as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      await service.register({
        username: 'newuser',
        password: 'password123',
        name: '新用户',
        role: 'ADMIN',
      });

      expect(usersService.create).toHaveBeenCalledWith({
        username: 'newuser',
        password: 'password123',
        name: '新用户',
      }, { allowUnbound: true });
    });
  });

  describe('refresh', () => {
    it('有效 refreshToken 应返回新 token', async () => {
      usersService.findByRefreshToken.mockResolvedValue(mockUser as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
    });

    it('无效 refreshToken 应抛出 UnauthorizedException', async () => {
      usersService.findByRefreshToken.mockResolvedValue(null);

      await expect(service.refresh('invalid-token'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('profile', () => {
    it('应返回用户信息', async () => {
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        username: 'testuser',
        name: '测试用户',
        role: 'USER',
      } as any);

      const result = await service.profile('user-1');
      expect(result.name).toBe('测试用户');
    });
  });

  describe('logout', () => {
    it('应清除 refreshToken 并使旧访问令牌失效', async () => {
      usersService.clearRefreshToken.mockResolvedValue({} as any);

      await service.logout('user-1');
      expect(usersService.clearRefreshToken).toHaveBeenCalledWith('user-1');
    });
  });
});
