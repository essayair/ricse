import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AccessControlService', () => {
  let service: AccessControlService;
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: PrismaService) => unknown) => callback(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AccessControlService);
  });

  it('外部企业账号可查看本企业作为任一交易方的全部合同', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'external-user',
      username: 'external',
      name: '外部用户',
      role: 'USER',
      company: {
        id: 'external-company',
        code: '80000001',
        name: '外部企业',
        type: 'EXTERNAL',
        partnerId: 'partner-1',
      },
      roleAssignments: [{
        id: 'assignment-1',
        status: 'ACTIVE',
        effectiveAt: new Date('2026-01-01'),
        expiresAt: null,
        scopeType: 'COMPANY',
        role: {
          code: 'USER',
          status: 'ACTIVE',
          permissions: [{ permission: { code: 'contract.view' } }],
        },
        scopes: [{ targetType: 'COMPANY', targetId: 'external-company' }],
      }],
    } as any);

    await expect(service.getContractScope('external-user')).resolves.toEqual({
      OR: [
        { sellerId: 'partner-1' },
        { buyerId: 'partner-1' },
        { signingPartnerId: 'partner-1' },
      ],
    });
  });

  it('质检及下游单据沿合同链继承外部企业范围', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'external-user',
      username: 'external',
      name: '外部用户',
      role: 'USER',
      company: {
        id: 'external-company',
        code: '80000001',
        name: '外部企业',
        type: 'EXTERNAL',
        partnerId: 'partner-1',
      },
      roleAssignments: [{
        id: 'assignment-1',
        status: 'ACTIVE',
        effectiveAt: new Date('2026-01-01'),
        expiresAt: null,
        scopeType: 'COMPANY',
        role: { code: 'USER', status: 'ACTIVE', permissions: [] },
        scopes: [{ targetType: 'COMPANY', targetId: 'external-company' }],
      }],
    } as any);

    await expect(service.getQualityInspectionScope('external-user')).resolves.toEqual({
      weighTicket: {
        waybill: {
          dispatchNotice: {
            order: {
              contract: {
                OR: [
                  { sellerId: 'partner-1' },
                  { buyerId: 'partner-1' },
                  { signingPartnerId: 'partner-1' },
                ],
              },
            },
          },
        },
      },
    });
  });

  it('外部企业未关联合作伙伴时拒绝访问业务数据', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'external-user',
      username: 'external',
      name: '外部用户',
      role: 'USER',
      company: {
        id: 'external-company',
        code: '80000001',
        name: '外部企业',
        type: 'EXTERNAL',
        partnerId: null,
      },
      roleAssignments: [],
    } as any);

    await expect(service.getContractScope('external-user')).rejects.toThrow(ForbiddenException);
  });

  it('内部管理员拥有全部合同数据范围', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin',
      username: 'admin',
      name: '管理员',
      role: 'ADMIN',
      company: { id: 'internal-company', type: 'INTERNAL', partnerId: 'partner-internal' },
      roleAssignments: [{
        id: 'assignment-admin',
        status: 'ACTIVE',
        effectiveAt: new Date('2026-01-01'),
        expiresAt: null,
        scopeType: 'ALL',
        role: {
          code: 'ADMIN',
          status: 'ACTIVE',
          permissions: [],
        },
        scopes: [],
      }],
    } as any);

    await expect(service.getContractScope('admin')).resolves.toEqual({});
  });

  it('保存外部企业授权时强制锁定为所属企业范围', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'external-user',
      username: 'external',
      name: '外部用户',
      role: 'USER',
      companyId: 'external-company',
      company: {
        id: 'external-company',
        code: '80000001',
        name: '外部企业',
        type: 'EXTERNAL',
        partnerId: 'partner-1',
      },
      roleAssignments: [],
    } as any);
    prisma.role.findMany.mockResolvedValue([{
      id: 'role-user',
      code: 'USER',
      name: '普通用户',
      status: 'ACTIVE',
    }] as any);
    prisma.company.count.mockResolvedValue(1);
    prisma.userRoleAssignment.findFirst.mockResolvedValue(null);
    prisma.userRoleAssignment.create.mockResolvedValue({ id: 'assignment-1' } as any);

    await service.replaceUserAssignments(
      'external-user',
      [{ roleId: 'role-user', scopeType: 'ALL', targetCompanyIds: [] }],
      'admin',
    );

    expect(prisma.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'external-user',
        roleId: 'role-user',
        scopeType: 'COMPANY',
      }),
    });
    expect(prisma.userRoleScope.createMany).toHaveBeenCalledWith({
      data: [{
        assignmentId: 'assignment-1',
        targetType: 'COMPANY',
        targetId: 'external-company',
      }],
    });
  });
});
