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
    prisma.weighTicket.findFirst.mockResolvedValue(null);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue(null);
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

  it('历史漏单场景下确认合格质检可兜底生成入库作业单', async () => {
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-1',
      inspectionNo: 'QC-001',
      status: 'CONFIRMED',
      conclusion: 'PASS',
      materialName: '铁矿石',
      materialSpec: '粉矿',
      supplierName: '供应商A',
      plateNo: '沪A12345',
      settlementWeight: 98,
      moistureDeductionWeight: 1,
      impurityDeductionWeight: 1,
      deductionAmount: 0,
      weighTicket: {
        id: 'ticket-1',
        status: 'REVIEWED',
        netWeight: 100,
        settlementWeight: 100,
        waybill: {
          id: 'waybill-1',
          status: 'ARRIVED',
          arrivedAt: new Date('2026-07-30T08:00:00Z'),
          signedAt: null,
          plateNo: '沪A12345',
          inboundReceipts: [],
          dispatchNotice: { type: 'PURCHASE', warehouseId: 'warehouse-1' },
        },
      },
    } as any);
    prisma.inboundReceipt.count.mockResolvedValue(0);
    prisma.inboundReceipt.create.mockResolvedValue({ id: 'receipt-1', status: 'PENDING' } as any);

    await service.createPendingReceiptForConfirmedQuality('quality-1', 'user-1');

    expect(prisma.inboundReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        waybillId: 'waybill-1',
        qualityInspectionId: 'quality-1',
        warehouseId: 'warehouse-1',
        status: 'PENDING',
        receiverName: null,
      }),
    }));
  });

  it('采购运单进入在途后提前生成待到货入库作业单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', waybillNo: 'WB-001', status: 'IN_TRANSIT', totalQuantity: 100,
      plateNo: '沪A12345', inboundReceipts: [],
      lineItems: [{ materialId: 'material-1', materialName: '铁矿石' }],
      dispatchNotice: {
        type: 'PURCHASE', warehouseId: 'warehouse-1',
        order: { contract: { seller: { id: 'supplier-1', name: '供应商A' } } },
      },
    } as any);
    prisma.inboundReceipt.count.mockResolvedValue(0);
    prisma.inboundReceipt.create.mockResolvedValue({
      id: 'receipt-1', status: 'PENDING', waybill: { status: 'IN_TRANSIT', weighTickets: [] },
    } as any);

    await service.ensurePendingReceiptForWaybill('waybill-1', 'user-1');

    expect(prisma.inboundReceipt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        waybillId: 'waybill-1',
        plannedQuantity: 100,
        weighTicketId: null,
        qualityInspectionId: null,
        receivedQuantity: null,
        status: 'PENDING',
      }),
    }));
  });

  it('质检合格后补齐已提前生成入库作业单的验收依据', async () => {
    const existing = {
      id: 'receipt-1', receiptNo: 'LIR-001', status: 'PENDING',
      qualityInspectionId: null, waybill: { status: 'ARRIVED', weighTickets: [] },
    };
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-2', materialName: '铁矿石', materialSpec: '粉矿', supplierName: '供应商A',
      settlementWeight: 98, moistureDeductionWeight: 1, impurityDeductionWeight: 1, deductionAmount: 0,
      status: 'CONFIRMED',
      conclusion: 'PASS',
      weighTicket: {
        id: 'ticket-1', netWeight: 100, settlementWeight: 100,
        status: 'REVIEWED',
        waybill: {
          id: 'waybill-1', status: 'ARRIVED',
          inboundReceipts: [existing],
          dispatchNotice: { type: 'PURCHASE' },
        },
      },
    } as any);
    prisma.inboundReceipt.update.mockResolvedValue({
      ...existing,
      qualityInspectionId: 'quality-2',
      acceptanceConclusion: 'PASS',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'PASS' },
    } as any);

    await service.createPendingReceiptForConfirmedQuality('quality-2', 'user-1');

    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
    expect(prisma.inboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'receipt-1' },
      data: expect.objectContaining({
        weighTicketId: 'ticket-1',
        qualityInspectionId: 'quality-2',
        receivedQuantity: 98,
      }),
    }));
  });

  it('仓管可以改选同一运单下已确认合格质检单作为最终验收依据', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      id: 'receipt-1', waybillId: 'waybill-1', status: 'PENDING', plateNo: '沪A12345',
      weighTicketId: 'ticket-1',
      weighTicket: { id: 'ticket-1', status: 'REVIEWED', netWeight: 100 },
    } as any);
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-2', weighTicketId: 'ticket-2', materialName: '铁矿石', materialSpec: '粉矿',
      supplierName: '供应商A', plateNo: '沪A12345', settlementWeight: 97.5,
      moistureDeductionWeight: 1, impurityDeductionWeight: 0.5, deductionAmount: 0,
      weighTicket: { id: 'ticket-2', status: 'REVIEWED', settlementWeight: 99 },
    } as any);
    prisma.inboundReceipt.update.mockResolvedValue({
      id: 'receipt-1', status: 'PENDING', qualityInspectionId: 'quality-2',
      acceptanceConclusion: 'PASS', qualityInspection: { status: 'CONFIRMED', conclusion: 'PASS' },
      waybill: { status: 'ARRIVED', weighTickets: [] },
    } as any);

    await service.selectAcceptanceQuality('receipt-1', 'quality-2', 'user-1');

    expect(prisma.qualityInspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'quality-2', status: 'CONFIRMED', conclusion: 'PASS',
        weighTicket: expect.objectContaining({ waybillId: 'waybill-1', status: 'REVIEWED' }),
      }),
    }));
    expect(prisma.inboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        weighTicketId: 'ticket-1', qualityInspectionId: 'quality-2', receivedQuantity: 98.5,
      }),
    }));
  });

  it('历史超标扣款待入库单不能确认收货', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'PENDING',
      acceptanceConclusion: 'DEDUCTION',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'DEDUCTION' },
    } as any);

    await expect(service.confirmReceipt('receipt-1', 'user-1'))
      .rejects.toThrow('只有已确认且质检合格的货物才能形成系统库存');
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('待入库单补齐仓库、时间和收货人后才能确认', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'PENDING',
      warehouseId: null,
      receivedAt: null,
      receiverName: null,
      acceptanceConclusion: 'PASS',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'PASS' },
    } as any);

    await expect(service.confirmReceipt('receipt-1', 'user-1')).rejects.toThrow('请先选择入库仓库');
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

  it('库存总览按库存主体和仓库汇总账面、冻结与可用数量', async () => {
    prisma.inventoryLot.findMany.mockResolvedValue([
      {
        id: 'lot-1', materialId: 'm1', warehouseId: 'w1', ownerPartnerId: 'owner-1',
        availableQuantity: 12.5, createdAt: new Date('2026-01-01'),
        warehouse: { id: 'w1', code: 'WH01', name: '一号仓' },
        inventoryOwner: { id: 'owner-1', code: 'OWN01', name: '采购主体一' },
      },
      {
        id: 'lot-2', materialId: 'm1', warehouseId: 'w2', ownerPartnerId: 'owner-1',
        availableQuantity: 7.5, createdAt: new Date('2026-01-02'),
        warehouse: { id: 'w2', code: 'WH02', name: '二号仓' },
        inventoryOwner: { id: 'owner-1', code: 'OWN01', name: '采购主体一' },
      },
      {
        id: 'lot-3', materialId: 'm2', warehouseId: 'w1', ownerPartnerId: 'owner-2',
        availableQuantity: 5, createdAt: new Date('2026-01-03'),
        warehouse: { id: 'w1', code: 'WH01', name: '一号仓' },
        inventoryOwner: { id: 'owner-2', code: 'OWN02', name: '采购主体二' },
      },
    ] as any);
    prisma.outboundOrderLine.findMany.mockResolvedValue([]);

    const result = await service.inventoryOverview({}, 'user-1');

    expect(result.summary).toEqual({
      lotCount: 3,
      materialCount: 2,
      warehouseCount: 2,
      ownerCount: 2,
      totalQuantity: 25,
      totalPhysicalQuantity: 25,
      totalReservedQuantity: 0,
      totalAvailableQuantity: 25,
    });
    expect(result.ownerSummaries).toHaveLength(2);
    expect(result.ownerSummaries).toEqual(expect.arrayContaining([expect.objectContaining({
      ownerPartnerId: 'owner-1', ownerName: '采购主体一', warehouseCount: 2,
      totalPhysicalQuantity: 20, totalAvailableQuantity: 20,
    })]));
    expect(result.warehouseSummaries).toHaveLength(2);
    expect(result.warehouseSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        warehouseId: 'w1', ownerCount: 2, lotCount: 2,
        totalPhysicalQuantity: 17.5, totalAvailableQuantity: 17.5,
      }),
    ]));
    expect(result.ownerWarehouseSummaries).toHaveLength(3);
  });
});
