import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const usersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    resetPassword: jest.fn(),
  };
  const controller = new UsersController(usersService as unknown as UsersService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('开通账号时应接受包含下划线、点和短横线的用户名', async () => {
    usersService.create.mockResolvedValue({ id: 'user-1', username: 'emp_test-01' });

    await expect(controller.create({
      username: 'emp_test-01',
      password: 'secret123',
      name: '测试员工',
      employeeId: 'employee-1',
      companyId: 'company-1',
    })).resolves.toEqual({ id: 'user-1', username: 'emp_test-01' });

    expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({
      username: 'emp_test-01',
      password: 'secret123',
    }));
  });

  it('用户名不能以点、下划线或短横线开头', () => {
    expect(() => controller.create({
      username: '_employee',
      password: 'secret123',
      name: '测试员工',
    })).toThrow(BadRequestException);
  });

  it('开通账号和重置密码时均拒绝不足6位的密码', async () => {
    expect(() => controller.create({
      username: 'employee01',
      password: '12345',
      name: '测试员工',
    })).toThrow('密码至少6位');

    await expect(controller.resetPassword('user-1', { password: '12345' }))
      .rejects.toThrow('密码至少6位');
    expect(usersService.resetPassword).not.toHaveBeenCalled();
  });
});
