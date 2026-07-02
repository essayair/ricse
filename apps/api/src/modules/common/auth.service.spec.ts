import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

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
      findById: jest.fn(),
      create: jest.fn(),
      findByRefreshToken: jest.fn(),
      setRefreshToken: jest.fn(),
      clearRefreshToken: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService) as jest.Mocked<UsersService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
  });

  describe('login', () => {
    it('正确凭据应登录成功并返回 JWT', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser as any);
      usersService.setRefreshToken.mockResolvedValue({} as any);

      const result = await service.login('testuser', 'correct-password');

      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.username).toBe('testuser');
      expect(result.name).toBe('测试用户');
      expect(result.role).toBe('USER');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', username: 'testuser' }),
      );
    });

    it('密码错误应抛出 UnauthorizedException', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser as any);

      await expect(service.login('testuser', 'wrong-password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('用户不存在应抛出 UnauthorizedException', async () => {
      usersService.findByUsername.mockResolvedValue(null);

      await expect(service.login('nonexistent', 'any-password'))
        .rejects.toThrow(UnauthorizedException);
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
      });
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
    it('应清除 refreshToken', async () => {
      usersService.clearRefreshToken.mockResolvedValue({} as any);

      await service.logout('user-1');
      expect(usersService.clearRefreshToken).toHaveBeenCalledWith('user-1');
    });
  });
});
