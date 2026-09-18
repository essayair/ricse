import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('审批路由角色的权限模板不能在页面中直接改写', async () => {
    prisma.role.findUnique.mockResolvedValue({ id: 'role-owner', code: 'BUSINESS_OWNER' } as any);

    await expect(service.replaceRolePermissions('role-owner', []))
      .rejects.toThrow(BadRequestException);
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('系统管理员角色不能与其他角色叠加', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', companyId: null, company: null,
    } as any);
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-admin', code: 'ADMIN', status: 'ACTIVE', permissions: [] },
      { id: 'role-user', code: 'USER', status: 'ACTIVE', permissions: [] },
    ] as any);

    await expect(service.replaceUserAssignments(
      'user-1',
      [
        { roleId: 'role-admin', scopeType: 'ALL' },
        { roleId: 'role-user', scopeType: 'ALL' },
      ],
      'operator-1',
    )).rejects.toThrow('系统管理员已经拥有全部权限，不能再叠加其他角色');
  });

  it('外部企业账号不能获得内部合同审批角色', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'external-user',
      companyId: 'external-company',
      company: { id: 'external-company', type: 'EXTERNAL' },
    } as any);
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-owner', code: 'BUSINESS_OWNER', status: 'ACTIVE', permissions: [] },
    ] as any);

    await expect(service.replaceUserAssignments(
      'external-user',
      [{ roleId: 'role-owner', scopeType: 'COMPANY' }],
      'operator-1',
    )).rejects.toThrow('外部企业账号不能授予内部合同审批角色');
  });

  it('外部企业账号可查看本企业作为任一交易方的全部合同及本企业未选主体草稿', async () => {
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
        { status: 'DRAFT', creator: { companyId: 'external-company' } },
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
                  { status: 'DRAFT', creator: { companyId: 'external-company' } },
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

  it('权限与业务单元范围按同一个角色绑定，不跨角色拼接', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'scoped-user',
      username: 'scoped',
      name: '跨单元用户',
      role: 'USER',
      company: { id: 'internal-company', type: 'INTERNAL', partnerId: 'partner-internal' },
      businessUnits: [
        {
          status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          businessUnitId: 'bu-yumen', businessUnit: { status: 'ACTIVE' },
        },
        {
          status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          businessUnitId: 'bu-longyou', businessUnit: { status: 'ACTIVE' },
        },
      ],
      roleAssignments: [
        {
          id: 'approval-yumen', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'BUSINESS_UNIT',
          role: { code: 'BUSINESS_MANAGER', status: 'ACTIVE', permissions: [{ permission: { code: 'contract.approve' } }] },
          scopes: [{ targetType: 'BUSINESS_UNIT', targetId: 'bu-yumen' }],
        },
        {
          id: 'view-longyou', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'BUSINESS_UNIT',
          role: { code: 'OBSERVER', status: 'ACTIVE', permissions: [{ permission: { code: 'contract.view' } }] },
          scopes: [{ targetType: 'BUSINESS_UNIT', targetId: 'bu-longyou' }],
        },
      ],
    } as any);

    await expect(service.getContractScope('scoped-user', 'contract.approve')).resolves.toEqual({
      AND: [
        { businessUnitId: { in: ['bu-yumen', 'bu-longyou'] } },
        { businessUnitId: { in: ['bu-yumen'] } },
      ],
    });
    await expect(service.getContractScope('scoped-user', 'contract.view')).resolves.toEqual({
      AND: [
        { businessUnitId: { in: ['bu-yumen', 'bu-longyou'] } },
        { businessUnitId: { in: ['bu-longyou'] } },
      ],
    });
  });

  it('内部普通账号的全部范围仍以有效业务单元归属为上限', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'all-user', username: 'all-user', name: '全范围用户', role: 'USER',
      company: { id: 'internal-company', type: 'INTERNAL', partnerId: 'partner-internal' },
      businessUnits: [
        {
          status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          businessUnitId: 'bu-yumen', businessUnit: { status: 'ACTIVE' },
        },
        {
          status: 'DISABLED', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          businessUnitId: 'bu-disabled', businessUnit: { status: 'ACTIVE' },
        },
      ],
      roleAssignments: [{
        id: 'all-scope', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
        scopeType: 'ALL',
        role: { code: 'RISK_MANAGER', status: 'ACTIVE', permissions: [{ permission: { code: 'contract.view' } }] },
        scopes: [],
      }],
    } as any);

    await expect(service.getContractScope('all-user')).resolves.toEqual({
      businessUnitId: { in: ['bu-yumen'] },
    });
  });

  it('内部普通账号没有有效业务单元归属时拒绝业务数据访问', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'no-unit-user', username: 'no-unit-user', name: '无归属用户', role: 'USER',
      company: { id: 'internal-company', type: 'INTERNAL', partnerId: 'partner-internal' },
      businessUnits: [],
      roleAssignments: [{
        id: 'all-scope', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
        scopeType: 'ALL',
        role: { code: 'USER', status: 'ACTIVE', permissions: [{ permission: { code: 'contract.view' } }] },
        scopes: [],
      }],
    } as any);

    await expect(service.getContractScope('no-unit-user')).resolves.toEqual({
      id: { equals: '__NO_ACCESS__' },
    });
  });

  it('生产任务的全部范围同样受有效业务单元归属限制', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'production-user', username: 'production-user', name: '生产用户', role: 'PRODUCTION_MANAGER',
      company: { id: 'internal-company', type: 'INTERNAL', partnerId: 'partner-internal' },
      businessUnits: [{
        status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
        businessUnitId: 'bu-yumen', businessUnit: { status: 'ACTIVE' },
      }],
      roleAssignments: [{
        id: 'production-all', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
        scopeType: 'ALL',
        role: { code: 'PRODUCTION_MANAGER', status: 'ACTIVE', permissions: [{ permission: { code: 'production.view' } }] },
        scopes: [],
      }],
    } as any);

    await expect(service.getProductionTaskScope('production-user')).resolves.toEqual({
      businessUnitId: { in: ['bu-yumen'] },
    });
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

  describe('物流合同与结算数据范围', () => {
    it('内部管理员不受公司范围限制', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin', role: 'ADMIN',
        company: { id: 'internal-company', type: 'INTERNAL' },
        roleAssignments: [{
          id: 'assignment-admin', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'ALL',
          role: { code: 'ADMIN', status: 'ACTIVE', permissions: [] },
          scopes: [],
        }],
      } as any);

      await expect(service.getLogisticsContractScope('admin')).resolves.toEqual({});
      await expect(service.getLogisticsSettlementScope('admin')).resolves.toEqual({});
    });

    it('外部企业账号没有物流合同与结算数据范围', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'external-user', role: 'USER',
        company: { id: 'external-company', type: 'EXTERNAL', partnerId: 'partner-1' },
        roleAssignments: [{
          id: 'assignment-1', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'COMPANY',
          role: { code: 'USER', status: 'ACTIVE', permissions: [{ permission: { code: 'logistics.contract.view' } }] },
          scopes: [],
        }],
      } as any);

      await expect(service.getLogisticsContractScope('external-user')).resolves.toEqual({
        id: { equals: '__NO_ACCESS__' },
      });
    });

    it('COMPANY 范围按本企业 companyId 收口', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'logistics-user', role: 'USER',
        company: { id: 'internal-company', type: 'INTERNAL' },
        roleAssignments: [{
          id: 'assignment-1', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'COMPANY',
          role: { code: 'LOGISTICS_OPERATOR', status: 'ACTIVE', permissions: [{ permission: { code: 'logistics.contract.view' } }] },
          scopes: [],
        }],
      } as any);

      await expect(service.getLogisticsContractScope('logistics-user')).resolves.toEqual({
        companyId: { in: ['internal-company'] },
      });
    });

    it('SPECIFIED_COMPANIES 范围按角色配置的目标企业收口', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'finance-user', role: 'USER',
        company: { id: 'internal-company', type: 'INTERNAL' },
        roleAssignments: [{
          id: 'assignment-1', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'SPECIFIED_COMPANIES',
          role: { code: 'FINANCE_SPECIALIST', status: 'ACTIVE', permissions: [{ permission: { code: 'logistics.settlement.view' } }] },
          scopes: [{ targetType: 'COMPANY', targetId: 'other-company' }],
        }],
      } as any);

      await expect(service.getLogisticsSettlementScope('finance-user', 'logistics.settlement.view')).resolves.toEqual({
        payerCompanyId: { in: ['other-company'] },
      });
    });

    it('没有对应权限的角色分配时拒绝访问', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'no-permission-user', role: 'USER',
        company: { id: 'internal-company', type: 'INTERNAL' },
        roleAssignments: [{
          id: 'assignment-1', status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null,
          scopeType: 'COMPANY',
          role: { code: 'USER', status: 'ACTIVE', permissions: [{ permission: { code: 'contract.view' } }] },
          scopes: [],
        }],
      } as any);

      await expect(service.getLogisticsContractScope('no-permission-user')).resolves.toEqual({
        id: { equals: '__NO_ACCESS__' },
      });
    });
  });
});
