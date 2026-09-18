import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { LogisticsContractService } from './logistics-contract.service';

describe('LogisticsContractService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({ user: { company: { id: 'company-1' } } }),
    getLogisticsContractScope: jest.fn().mockResolvedValue({}),
  };
  let service: LogisticsContractService;

  beforeEach(async () => {
    jest.clearAllMocks();
    accessControl.assertPermission.mockResolvedValue({ user: { company: { id: 'company-1' } } });
    accessControl.getLogisticsContractScope.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        LogisticsContractService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(LogisticsContractService);
    prisma.logisticsContract.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  describe('create', () => {
    it('承运方必须是有效的物流承运商主数据', async () => {
      prisma.serviceOrganization.findFirst.mockResolvedValue(null);
      await expect(service.create({ carrierPartnerId: 'partner-1' }, 'user-1'))
        .rejects.toThrow('承运方必须是有效的物流承运商主数据');
    });

    it('承运方校验通过后创建物流合同并生成编号', async () => {
      prisma.serviceOrganization.findFirst.mockResolvedValue({ id: 'so-1' } as any);
      prisma.logisticsContract.create.mockResolvedValue({ id: 'lc-1', contractNo: 'LC202609170001' } as any);

      const result = await service.create({ carrierPartnerId: 'partner-1' }, 'user-1');

      expect(result.contractNo).toBe('LC202609170001');
      expect(prisma.logisticsContract.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ carrierPartnerId: 'partner-1', createdBy: 'user-1', settlementBasis: 'NET_WEIGHT' }),
      }));
    });
  });

  describe('findOne', () => {
    it('超出数据范围或不存在时抛出 NotFoundException', async () => {
      prisma.logisticsContract.findFirst.mockResolvedValue(null);
      await expect(service.findOne('lc-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('允许 DRAFT 变更为 ACTIVE', async () => {
      prisma.logisticsContract.findFirst.mockResolvedValue({ id: 'lc-1', status: 'DRAFT' } as any);
      prisma.logisticsContract.update.mockResolvedValue({ id: 'lc-1', status: 'ACTIVE' } as any);
      const result = await service.updateStatus('lc-1', { status: 'ACTIVE' }, 'user-1');
      expect(result.status).toBe('ACTIVE');
    });

    it('不允许 DRAFT 直接变更为 TERMINATED', async () => {
      prisma.logisticsContract.findFirst.mockResolvedValue({ id: 'lc-1', status: 'DRAFT' } as any);
      await expect(service.updateStatus('lc-1', { status: 'TERMINATED' }, 'user-1'))
        .rejects.toThrow('不能从 DRAFT 变更为 TERMINATED');
    });
  });

  describe('addPriceTerm', () => {
    beforeEach(() => {
      prisma.logisticsContract.findFirst.mockResolvedValue({ id: 'lc-1', status: 'ACTIVE' } as any);
    });

    it('首次为某路线新增运价条款直接创建', async () => {
      prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([]);
      prisma.logisticsContractPriceTerm.create.mockResolvedValue({ id: 'term-1' } as any);

      await service.addPriceTerm('lc-1', {
        originLocation: '额济纳', destinationLocation: '玉门', unitPrice: 106.5, effectiveAt: '2026-07-01',
      }, 'user-1');

      expect(prisma.logisticsContractPriceTerm.update).not.toHaveBeenCalled();
      expect(prisma.logisticsContractPriceTerm.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ unitPrice: 106.5, expiresAt: null }),
      }));
    });

    it('新增更晚生效的条款时自动收口原当前生效条款', async () => {
      const openTerm = {
        id: 'term-old', originLocation: '额济纳', destinationLocation: '玉门',
        effectiveAt: new Date('2026-07-01'), expiresAt: null,
      };
      prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([openTerm] as any);
      prisma.logisticsContractPriceTerm.create.mockResolvedValue({ id: 'term-new' } as any);

      await service.addPriceTerm('lc-1', {
        originLocation: '额济纳', destinationLocation: '玉门', unitPrice: 110, effectiveAt: '2026-08-01',
      }, 'user-1');

      expect(prisma.logisticsContractPriceTerm.update).toHaveBeenCalledWith({
        where: { id: 'term-old' },
        data: { expiresAt: new Date('2026-08-01') },
      });
    });

    it('新条款生效日期早于或等于当前生效条款时拒绝', async () => {
      const openTerm = {
        id: 'term-old', originLocation: '额济纳', destinationLocation: '玉门',
        effectiveAt: new Date('2026-07-01'), expiresAt: null,
      };
      prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([openTerm] as any);

      await expect(service.addPriceTerm('lc-1', {
        originLocation: '额济纳', destinationLocation: '玉门', unitPrice: 110, effectiveAt: '2026-07-01',
      }, 'user-1')).rejects.toThrow('新运价生效日期必须晚于当前生效条款的生效日期');
    });

    it('与历史条款日期区间重叠时拒绝', async () => {
      const historicalTerm = {
        id: 'term-hist', originLocation: '额济纳', destinationLocation: '玉门',
        effectiveAt: new Date('2026-01-01'), expiresAt: new Date('2026-06-01'),
      };
      prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([historicalTerm] as any);

      await expect(service.addPriceTerm('lc-1', {
        originLocation: '额济纳', destinationLocation: '玉门', unitPrice: 110, effectiveAt: '2026-03-01', expiresAt: '2026-04-01',
      }, 'user-1')).rejects.toThrow('该路线在此日期区间内已存在运价条款');
    });

    it('失效日期早于或等于生效日期时拒绝', async () => {
      await expect(service.addPriceTerm('lc-1', {
        originLocation: '额济纳', destinationLocation: '玉门', unitPrice: 110, effectiveAt: '2026-08-01', expiresAt: '2026-07-01',
      }, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });
});
