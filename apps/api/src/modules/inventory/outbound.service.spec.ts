import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboundService } from './outbound.service';

describe('OutboundService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: OutboundService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [OutboundService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(OutboundService);
  });

  it('只选择待发运、常规销售且已有复核出库磅单的运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);

    await service.eligibleWaybills();

    expect(prisma.waybill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'PENDING',
        dispatchNotice: expect.objectContaining({
          type: 'SALES',
          mode: 'STANDARD',
        }),
        weighTickets: {
          some: expect.objectContaining({
            status: 'REVIEWED',
            direction: 'OUTBOUND',
            settlementWeight: { gt: 0 },
          }),
        },
      }),
    }));
  });

  it('出库入账在同一事务中扣减批次并写入负数台账', async () => {
    const receipt = {
      id: 'receipt-1',
      receiptNo: 'LOR-20260723-0001',
      status: 'DEPARTURE_CONFIRMED',
      warehouseId: 'warehouse-1',
      materialId: 'material-1',
      materialName: '测试物料',
      customerName: '测试客户',
      outboundQuantity: 10,
      waybill: { status: 'PENDING' },
      salesOutbound: null,
      allocations: [{
        id: 'allocation-1',
        inventoryLotId: 'lot-1',
        quantity: 10,
        inventoryLot: { id: 'lot-1', lotNo: 'LOT-001' },
      }],
    };
    prisma.outboundReceipt.findFirst.mockResolvedValue(receipt as any);
    prisma.salesOutbound.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.salesOutbound.create.mockResolvedValue({ id: 'sales-out-1' } as any);
    prisma.inventoryLot.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryLot.findUniqueOrThrow.mockResolvedValue({
      id: 'lot-1',
      availableQuantity: 15,
    } as any);

    await service.post(receipt.id, 'user-1');

    expect(prisma.inventoryLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ availableQuantity: { gte: 10 } }),
      data: { availableQuantity: { decrement: 10 } },
    }));
    expect(prisma.inventoryLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessType: 'OUTBOUND',
        quantityChange: -10,
        balanceAfter: 15,
      }),
    }));
    expect(prisma.outboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'POSTED' },
    }));
  });
});
