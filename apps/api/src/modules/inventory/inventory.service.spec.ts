import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
    getInboundReceiptScope: jest.fn().mockResolvedValue({}),
    getInventoryLotScope: jest.fn().mockResolvedValue({}),
    getInventoryLedgerScope: jest.fn().mockResolvedValue({}),
  };
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(InventoryService);
  });

  it('只选择已到货、已复核且存在已确认合格质检单的采购运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);

    await service.eligibleWaybills('user-1');

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
                conclusion: 'PASS',
              }),
            },
          }),
        },
      }),
    }));
  });

  it('超标扣款质检单不能创建物流入库单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1',
      status: 'ARRIVED',
      dispatchNotice: { type: 'PURCHASE' },
      inboundReceipts: [],
      lineItems: [{ materialId: 'material-1' }],
    } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({
      id: 'ticket-1',
      status: 'REVIEWED',
      settlementWeight: 100,
    } as any);
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-1',
      status: 'CONFIRMED',
      conclusion: 'DEDUCTION',
    } as any);

    await expect(service.createReceipt({
      waybillId: 'waybill-1',
      weighTicketId: 'ticket-1',
      qualityInspectionId: 'quality-1',
      warehouseId: 'warehouse-1',
      receivedAt: new Date().toISOString(),
      receiverName: '收货员',
    }, 'user-1')).rejects.toThrow('只有质检结论为“合格”的货物才能入库');
  });

  it('历史超标扣款入库草稿不能确认收货', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'DRAFT',
      acceptanceConclusion: 'DEDUCTION',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'DEDUCTION' },
    } as any);

    await expect(service.confirmReceipt('receipt-1', 'user-1'))
      .rejects.toThrow('只有已确认且质检合格的货物才能形成系统库存');
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('历史超标扣款已收货单不能正式入账库存', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'RECEIVED',
      acceptanceConclusion: 'DEDUCTION',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'DEDUCTION' },
      businessInbound: null,
    } as any);

    await expect(service.postInventory('receipt-1', 'user-1'))
      .rejects.toThrow('只有已确认且质检合格的货物才能形成系统库存');
    expect(prisma.businessInbound.create).not.toHaveBeenCalled();
  });

  it('库存总览按批次汇总可用数量、物料数和仓库数', async () => {
    prisma.inventoryLot.findMany.mockResolvedValue([
      { materialId: 'm1', warehouseId: 'w1', availableQuantity: 12.5 },
      { materialId: 'm1', warehouseId: 'w2', availableQuantity: 7.5 },
    ] as any);

    const result = await service.inventoryOverview({}, 'user-1');

    expect(result.summary).toEqual({
      lotCount: 2,
      materialCount: 1,
      warehouseCount: 2,
      totalQuantity: 20,
    });
  });
});
