import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformUsersService } from './platform-users.service';

describe('PlatformUsersService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: PlatformUsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (input: any) => {
      if (typeof input === 'function') return input(prisma);
      return Promise.all(input);
    });
    const module = await Test.createTestingModule({
      providers: [PlatformUsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PlatformUsersService);
  });

  it('关联后台账号时写入当前关系和审计记录', async () => {
    prisma.wechatIdentity.findUnique
      .mockResolvedValueOnce({ id: 'wx-1', openId: 'openid-1234567890', status: 'ACTIVE', linkedUserId: null } as any)
      .mockResolvedValueOnce({
        id: 'wx-1', openId: 'openid-1234567890', status: 'ACTIVE', linkedUserId: 'user-1',
        linkedUser: { id: 'user-1', username: '13800138000' }, bindingLogs: [],
      } as any);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', status: 'ACTIVE', companyId: 'company-1', employeeId: 'employee-1',
      company: { status: 'ACTIVE' }, employee: { status: 'ACTIVE' }, wechatIdentity: null,
    } as any);

    const result = await service.bind('wx-1', 'user-1', 'admin-1', '已核验');

    expect(prisma.wechatIdentity.update).toHaveBeenCalledWith({
      where: { id: 'wx-1' },
      data: { linkedUserId: 'user-1', linkedAt: expect.any(Date) },
    });
    expect(prisma.wechatAccountBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        wechatIdentityId: 'wx-1', userId: 'user-1', action: 'BIND', operatedById: 'admin-1', note: '已核验',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'wx-1', openIdMasked: 'openid***7890' }));
  });

  it('后台账号已关联其他微信用户时拒绝重复关联', async () => {
    prisma.wechatIdentity.findUnique.mockResolvedValue({ id: 'wx-1', status: 'ACTIVE', linkedUserId: null } as any);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', status: 'ACTIVE', companyId: 'company-1', employeeId: 'employee-1',
      company: { status: 'ACTIVE' }, employee: { status: 'ACTIVE' },
      wechatIdentity: { id: 'wx-2' },
    } as any);

    await expect(service.bind('wx-1', 'user-1', 'admin-1')).rejects.toThrow(ConflictException);
    expect(prisma.wechatIdentity.update).not.toHaveBeenCalled();
  });

  it('解除关联时清空当前关系并保留解绑记录', async () => {
    prisma.wechatIdentity.findUnique
      .mockResolvedValueOnce({ id: 'wx-1', openId: 'openid-1234567890', linkedUserId: 'user-1' } as any)
      .mockResolvedValueOnce({ id: 'wx-1', openId: 'openid-1234567890', linkedUserId: null, linkedUser: null, bindingLogs: [] } as any);

    await service.unbind('wx-1', 'admin-1', '人员离职');

    expect(prisma.wechatIdentity.update).toHaveBeenCalledWith({
      where: { id: 'wx-1' }, data: { linkedUserId: null, linkedAt: null },
    });
    expect(prisma.wechatAccountBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UNBIND', userId: 'user-1', note: '人员离职' }),
    });
  });
});
