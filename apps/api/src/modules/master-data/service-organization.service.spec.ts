import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceOrganizationService } from './service-organization.service';

describe('ServiceOrganizationService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: ServiceOrganizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [ServiceOrganizationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ServiceOrganizationService);
  });

  it('只有具备供应商角色的合作伙伴可以建立专业服务档案', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'partner-1', code: '00000001', name: '客户单位',
      roles: ['CUSTOMER'], status: 'ACTIVE',
    } as any);

    await expect(service.create({
      partnerId: 'partner-1',
      organizationType: 'LOGISTICS_CARRIER',
    })).rejects.toThrow('必须具备供应商角色');
  });

  it('物流承运商档案关联统一合作伙伴并自动生成编码', async () => {
    prisma.partner.findFirst.mockResolvedValue({
      id: 'partner-1', code: '00000001', name: '物流公司',
      roles: ['SUPPLIER'], status: 'ACTIVE',
    } as any);
    prisma.serviceOrganization.findFirst.mockResolvedValue(null);
    prisma.serviceOrganization.count.mockResolvedValue(0);
    prisma.serviceOrganization.create.mockResolvedValue({
      id: 'carrier-1', code: 'CY000001', partnerId: 'partner-1',
      organizationType: 'LOGISTICS_CARRIER',
    } as any);

    const result = await service.create({
      partnerId: 'partner-1',
      organizationType: 'LOGISTICS_CARRIER',
      transportModes: ['ROAD'],
    });

    expect(result.code).toBe('CY000001');
    expect(prisma.serviceOrganization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        partnerId: 'partner-1',
        organizationType: 'LOGISTICS_CARRIER',
        transportModes: ['ROAD'],
      }),
    }));
  });
});
