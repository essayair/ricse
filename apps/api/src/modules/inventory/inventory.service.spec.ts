import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(InventoryService);
  });

  it('只选择已到货、已复核且存在非熔断确认质检单的采购运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);

    await service.eligibleWaybills();

    expect(prisma.waybill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['ARRIVED', 'SIGNED'] },
        dispatchNotice: { type: 'PURCHASE' },
        weighTickets: {
          some: expect.objectContaining({
            status: 'REVIEWED',
            qualityInspections: {
              some: expect.objectContaining({
                status: 'CONFIRMED',
                conclusion: { in: ['PASS', 'DEDUCTION'] },
              }),
            },
          }),
        },
      }),
    }));
  });

  it('库存总览按批次汇总可用数量、物料数和仓库数', async () => {
    prisma.inventoryLot.findMany.mockResolvedValue([
      { materialId: 'm1', warehouseId: 'w1', availableQuantity: 12.5 },
      { materialId: 'm1', warehouseId: 'w2', availableQuantity: 7.5 },
    ] as any);

    const result = await service.inventoryOverview({});

    expect(result.summary).toEqual({
      lotCount: 2,
      materialCount: 1,
      warehouseCount: 2,
      totalQuantity: 20,
    });
  });
});
