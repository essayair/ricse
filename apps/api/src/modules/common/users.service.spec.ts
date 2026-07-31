import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
});
