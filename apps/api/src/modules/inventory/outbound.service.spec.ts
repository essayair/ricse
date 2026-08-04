import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { OutboundService } from './outbound.service';

describe('OutboundService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
    getInventoryLotScope: jest.fn().mockResolvedValue({}),
    getOutboundReceiptScope: jest.fn().mockResolvedValue({}),
  };
  let service: OutboundService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OutboundService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(OutboundService);
  });

  it('只选择待发运、常规销售且已有复核出库磅单的运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);

    await service.eligibleWaybills('user-1');

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
            weighingStage: 'SHIPPING',
            netWeight: { gt: 0 },
          }),
        },
      }),
    }));
  });

  it('销售发货通知下达后按当前库存生成出库管理单和库存缺口', async () => {
    prisma.dispatchNotice.findUnique.mockResolvedValue({
      id: 'notice-1', type: 'SALES', mode: 'STANDARD', warehouseId: 'warehouse-1',
      outboundOrder: null,
      order: { contract: { signingPartnerId: 'owner-1' } },
      lineItems: [{
        id: 'notice-line-1', materialId: 'material-1', materialName: '测试物料',
        unit: 'TON', quantity: 100,
      }],
    } as any);
    prisma.inventoryLot.aggregate.mockResolvedValue({ _sum: { availableQuantity: 70 } } as any);
    prisma.outboundOrderLine.findMany.mockResolvedValue([]);
    prisma.outboundOrder.count.mockResolvedValue(0);
    prisma.outboundOrder.create.mockResolvedValue({ id: 'order-1' } as any);

    await service.ensureOrderForNotice('notice-1', 'user-1');

    expect(prisma.outboundOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plannedQuantity: 100,
        ownerPartnerId: 'owner-1',
        reservedQuantity: 70,
        shortageQuantity: 30,
        lineItems: { create: [expect.objectContaining({ reservedQuantity: 70 })] },
      }),
    }));
  });

  it('销售直拨通知下达后生成不占用我方库存的发运管理占位单', async () => {
    prisma.dispatchNotice.findUnique.mockResolvedValue({
      id: 'notice-direct', type: 'SALES', mode: 'DIRECT', warehouseId: null,
      outboundOrder: null,
      order: { contract: { signingPartnerId: 'owner-1' } },
      lineItems: [{
        id: 'notice-line-direct', materialId: 'material-1', materialName: '测试物料',
        unit: 'TON', quantity: 120,
      }],
    } as any);
    prisma.outboundOrder.count.mockResolvedValue(0);
    prisma.outboundOrder.create.mockResolvedValue({ id: 'direct-order-1' } as any);

    await service.ensureOrderForNotice('notice-direct', 'user-1');

    expect(prisma.inventoryLot.aggregate).not.toHaveBeenCalled();
    expect(prisma.outboundOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orderNo: expect.stringMatching(/^DFM-/),
        warehouseId: null,
        ownerPartnerId: 'owner-1',
        plannedQuantity: 120,
        reservedQuantity: 0,
        shortageQuantity: 0,
        lineItems: { create: [expect.objectContaining({ reservedQuantity: 0 })] },
      }),
    }));
  });

  it('超装车次必须记录处理意见后才恢复待放行', async () => {
    prisma.outboundReceipt.findFirst.mockResolvedValue({
      id: 'receipt-1', status: 'VARIANCE_PENDING', varianceQuantity: 3,
    } as any);
    prisma.outboundReceipt.update.mockResolvedValue({ id: 'receipt-1', status: 'READY' } as any);

    await service.resolveVariance('receipt-1', {
      decision: 'OVERAGE_APPROVED', reason: '合同范围内，经仓储主管确认',
    }, 'user-1');

    expect(prisma.outboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'READY', varianceDecision: 'OVERAGE_APPROVED', varianceResolvedBy: 'user-1',
      }),
    }));
  });

  it('出库入账在同一事务中扣减批次并写入负数台账', async () => {
    const receipt = {
      id: 'receipt-1',
      receiptNo: 'LOR-20260723-0001',
      status: 'READY',
      warehouseId: 'warehouse-1',
      materialId: 'material-1',
      materialName: '测试物料',
      customerName: '测试客户',
      outboundOrderId: 'order-1',
      waybillId: 'waybill-1',
      weighTicketId: 'ticket-1',
      weighTicket: { id: 'ticket-1', status: 'REVIEWED' },
      outboundQuantity: 10,
      waybill: {
        status: 'PENDING', dispatchNoticeId: 'notice-1',
        dispatchNotice: { status: 'ISSUED' },
        lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1' }],
      },
      salesOutbound: null,
      allocations: [{
        id: 'allocation-1',
        inventoryLotId: 'lot-1',
        quantity: 10,
        inventoryLot: { id: 'lot-1', lotNo: 'LOT-001' },
      }],
    };
    prisma.outboundReceipt.findFirst.mockResolvedValue(receipt as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({
      waybillId: 'waybill-1', purpose: 'INVENTORY', weighTicketId: 'ticket-1', isCurrent: true,
    } as any);
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
