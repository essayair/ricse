import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryReversalService } from './inventory-reversal.service';

describe('InventoryReversalService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getContext: jest.fn().mockResolvedValue({ roleCodes: ['USER'] }),
    getBusinessInboundScope: jest.fn().mockResolvedValue({}),
    getSalesOutboundScope: jest.fn().mockResolvedValue({}),
    getInventoryReversalScope: jest.fn().mockResolvedValue({}),
  };
  let service: InventoryReversalService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        InventoryReversalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(InventoryReversalService);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('入库可冲销量同时受原单剩余量和批次当前可用量限制', async () => {
    prisma.businessInbound.findMany.mockResolvedValue([{
      id: 'inbound-1',
      quantity: 100,
      inventoryLot: { id: 'lot-1', availableQuantity: 60 },
      reversals: [{ lines: [{ quantity: 20 }] }],
    }] as any);

    const result = await service.eligibleSources('INBOUND', 'user-1') as any[];

    expect(result[0].reversedOrReservedQuantity).toBe(20);
    expect(result[0].reversibleQuantity).toBe(60);
  });

  it('入库冲销过账减少原批次初始量和可用量并写负数台账', async () => {
    const reversal = {
      id: 'reversal-in',
      reversalNo: 'IRV-20260723-0001',
      type: 'INBOUND',
      status: 'APPROVED',
      reason: '重复入库',
      businessInbound: {
        id: 'inbound-1',
        inboundNo: 'BIN-001',
        quantity: 100,
        inventoryLot: { id: 'lot-1' },
      },
      salesOutbound: null,
      lines: [{
        id: 'line-1',
        inventoryLotId: 'lot-1',
        quantity: 30,
        inventoryLot: { id: 'lot-1', lotNo: 'LOT-001' },
      }],
    };
    prisma.inventoryReversal.findFirst.mockResolvedValue(reversal as any);
    prisma.inventoryReversalLine.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as any);
    prisma.inventoryLot.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryLot.findUniqueOrThrow.mockResolvedValue({
      id: 'lot-1', warehouseId: 'warehouse-1', materialId: 'material-1', availableQuantity: 40,
    } as any);

    await service.post(reversal.id, 'user-1');

    expect(prisma.inventoryLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        availableQuantity: { decrement: 30 },
        initialQuantity: { decrement: 30 },
      },
    }));
    expect(prisma.inventoryLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessType: 'INBOUND_REVERSAL',
        quantityChange: -30,
        balanceAfter: 40,
      }),
    }));
  });

  it('出库冲销严格恢复原批次并写正数台账', async () => {
    const reversal = {
      id: 'reversal-out',
      reversalNo: 'ORV-20260723-0001',
      type: 'OUTBOUND',
      status: 'APPROVED',
      reason: '销售撤销',
      businessInbound: null,
      salesOutbound: {
        id: 'sales-out-1',
        outboundNo: 'SOUT-001',
        lines: [{ id: 'source-line-1', quantity: 20 }],
      },
      lines: [{
        id: 'line-1',
        inventoryLotId: 'lot-1',
        sourceSalesOutboundLineId: 'source-line-1',
        sourceQuantity: 20,
        quantity: 10,
        inventoryLot: { id: 'lot-1', lotNo: 'LOT-001' },
      }],
    };
    prisma.inventoryReversal.findFirst.mockResolvedValue(reversal as any);
    prisma.inventoryReversalLine.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as any);
    prisma.inventoryLot.findUniqueOrThrow.mockResolvedValue({
      id: 'lot-1', warehouseId: 'warehouse-1', materialId: 'material-1', availableQuantity: 80,
    } as any);

    await service.post(reversal.id, 'user-1');

    expect(prisma.inventoryLot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lot-1' },
      data: { availableQuantity: { increment: 10 }, status: 'AVAILABLE' },
    }));
    expect(prisma.inventoryLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessType: 'OUTBOUND_REVERSAL',
        quantityChange: 10,
        balanceAfter: 80,
      }),
    }));
  });

  it('普通用户不能审批库存冲销', async () => {
    prisma.inventoryReversal.findFirst.mockResolvedValue({
      id: 'reversal-1', status: 'PENDING_APPROVAL', type: 'INBOUND', lines: [],
    } as any);
    await expect(service.review('reversal-1', 'APPROVE', undefined, 'user-1'))
      .rejects.toThrow(ForbiddenException);
  });
});
