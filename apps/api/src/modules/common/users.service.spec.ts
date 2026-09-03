import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (input: any) => (
      typeof input === 'function' ? input(prisma) : Promise.all(input)
    ));
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('优先使用独立登录用户名查询账号', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'zhangsan' } as any);

    const result = await service.findByLoginIdentifier(' zhangsan ');

    expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'zhangsan' } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('用户名未命中时使用员工手机号查询关联账号', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-2', username: 'sales01' } as any);

    const result = await service.findByLoginIdentifier('13800138000');

    expect(result).toEqual(expect.objectContaining({ id: 'user-2' }));
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { employee: { is: { phone: '13800138000' } } },
    });
  });

  it('后台账号必须关联员工和企业', async () => {
    await expect(service.create({ username: 'employee01', password: 'secret123', name: '员工' }))
      .rejects.toThrow('后台账号必须关联员工和所属企业');
  });

  it('普通员工开通账号时默认使用所属企业数据范围', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-1', username: 'employee01' } as any);
    prisma.role.findUnique.mockResolvedValue({ id: 'role-user', code: 'USER', status: 'ACTIVE' } as any);
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', type: 'INTERNAL', status: 'ACTIVE' } as any);
    prisma.employee.findUnique.mockResolvedValue({
      id: 'employee-1', companyId: 'company-1', status: 'ACTIVE', name: '员工', phone: '13800138000', user: null,
    } as any);
    prisma.user.create.mockResolvedValue({ id: 'user-1' } as any);
    prisma.userRoleAssignment.create.mockResolvedValue({ id: 'assignment-1' } as any);

    await service.create({
      username: 'employee01', password: 'secret123', name: '员工', employeeId: 'employee-1', companyId: 'company-1',
    });

    expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scopeType: 'COMPANY' }),
    });
    expect(prisma.userRoleScope.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetType: 'COMPANY', targetId: 'company-1' }),
    });
  });

  it('企业账号缺少员工档案时拒绝登录', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-orphan', status: 'ACTIVE', companyId: 'company-1', employeeId: null,
      employee: null, company: { status: 'ACTIVE', type: 'INTERNAL' },
    } as any);

    await expect(service.assertActiveForAuthentication('user-orphan'))
      .rejects.toThrow('账号缺少员工档案');
  });

  it('孤立企业账号不能直接重新启用', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-orphan', status: 'DISABLED', companyId: 'company-1', employeeId: null,
      employee: null, company: { status: 'ACTIVE', type: 'INTERNAL' }, roleAssignments: [],
    } as any);

    await expect(service.update('user-orphan', { status: 'ACTIVE' }, 'admin-1'))
      .rejects.toThrow('请先恢复员工档案及账号关联');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
