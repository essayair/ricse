import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from '../inventory/inventory.service';
import { evaluateIndicator, QualityInspectionService } from './quality-inspection.service';

describe('质检指标判定', () => {
  it('按上下限判定合格或扣款', () => {
    expect(evaluateIndicator({ code: 'grade', name: '品位', operator: 'GTE', standardValue: 97, measuredValue: 97.2 })).toBe('PASS');
    expect(evaluateIndicator({ code: 'moisture', name: '水分', operator: 'LTE', standardValue: 0.5, measuredValue: 0.8 })).toBe('FAIL');
  });

  it('达到拒收红线时判定熔断', () => {
    expect(evaluateIndicator({ code: 'moisture', name: '水分', operator: 'LTE', standardValue: 0.5, fuseValue: 1.5, measuredValue: 1.8 })).toBe('FUSE');
    expect(evaluateIndicator({ code: 'grade', name: '品位', operator: 'GTE', standardValue: 97, fuseValue: 95, measuredValue: 94.8 })).toBe('FUSE');
  });
});

describe('QualityInspectionService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getWeighTicketScope: jest.fn().mockResolvedValue({}),
    getQualityInspectionScope: jest.fn().mockResolvedValue({}),
  };
  const inventoryService = {
    createPendingReceiptForConfirmedQuality: jest.fn().mockResolvedValue({ id: 'receipt-1', status: 'PENDING' }),
  };
  let service: QualityInspectionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        QualityInspectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
        { provide: InventoryService, useValue: inventoryService },
      ],
    }).compile();
    service = module.get(QualityInspectionService);
  });

  it('质检单列表支持关键词、状态、结论和日期组合检索', async () => {
    prisma.qualityInspection.findMany.mockResolvedValue([]);
    prisma.qualityInspection.count.mockResolvedValue(0);

    await service.findAll({ search: 'QC-001', status: 'REPORTED', conclusion: 'PASS', dateFrom: '2026-07-01', dateTo: '2026-07-21' }, 'user-1');

    expect(prisma.qualityInspection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'REPORTED', conclusion: 'PASS', sampledAt: expect.any(Object), OR: expect.any(Array),
      }),
    }));
  });

  it('同一磅单可以重复进入可质检列表', async () => {
    prisma.weighTicket.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([]);

    await service.eligibleWeighTickets('user-1');

    const where = prisma.weighTicket.findMany.mock.calls[0][0]?.where;
    expect(where).toEqual(expect.objectContaining({ status: { in: ['COMPLETED', 'REVIEWED'] } }));
    expect(where).not.toHaveProperty('qualityInspections');
  });

  it('采购质检确认合格后补齐入库作业单验收依据', async () => {
    const item = {
      id: 'quality-1',
      status: 'REPORTED',
      conclusion: 'PASS',
      indicators: [{ measuredValue: 1 }],
      weighTicket: {
        status: 'REVIEWED',
        waybill: {
          status: 'ARRIVED',
          dispatchNotice: { type: 'PURCHASE' },
        },
      },
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(item as any);
    prisma.qualityInspection.update.mockResolvedValue({} as any);

    await service.updateStatus('quality-1', 'CONFIRMED', 'user-1');

    expect(inventoryService.createPendingReceiptForConfirmedQuality)
      .toHaveBeenCalledWith('quality-1', 'user-1');
  });
});
