import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    password: '', // will set in beforeEach
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService) as jest.Mocked<UsersService>;
  });

  describe('login', () => {
    it('正确凭据应登录成功', async () => {
      usersService.findByUsername.mockResolvedValue(mockUser as any);

      const result = await service.login('testuser', 'correct-password');

      expect(result).toHaveProperty('token');
      expect(result.username).toBe('testuser');
      expect(result.name).toBe('测试用户');
      expect(result.role).toBe('USER');
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
});
