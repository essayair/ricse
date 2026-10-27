import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
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

  it('折干计价使用最终报告全部实测水分，不把质量扣价误扣为库存数量', async () => {
    prisma.material.findUnique.mockResolvedValue({ name: '萤石精粉', pricingQuantityBasis: 'DRY_MATTER' } as any);
    prisma.qualityInspection.findUnique.mockResolvedValue({ status: 'CONFIRMED', indicators: [
      { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
    ] } as any);
    await expect((service as any).pricingSnapshot('material-1', 'report-1', 100)).resolves.toEqual({
      pricingQuantity: 88, pricingQuantityBasis: 'DRY_MATTER', measuredMoisturePct: 12,
    });
  });

  it('按实物计价仍记录最终报告实测水分，不将水分扣减实物数量', async () => {
    prisma.material.findUnique.mockResolvedValue({ name: '萤石精粉', pricingQuantityBasis: 'PHYSICAL' } as any);
    prisma.qualityInspection.findUnique.mockResolvedValue({ status: 'CONFIRMED', indicators: [
      { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
    ] } as any);
    await expect((service as any).pricingSnapshot('material-1', 'report-1', 100)).resolves.toEqual({
      pricingQuantity: 100, pricingQuantityBasis: 'PHYSICAL', measuredMoisturePct: 12,
    });
  });

  it('折干物料缺少水分实测值时拒绝确认计价数量', async () => {
    prisma.material.findUnique.mockResolvedValue({ name: '萤石精粉', pricingQuantityBasis: 'DRY_MATTER' } as any);
    prisma.qualityInspection.findUnique.mockResolvedValue({ status: 'CONFIRMED', indicators: [] } as any);
    await expect((service as any).pricingSnapshot('material-1', 'report-1', 100)).rejects.toThrow('水分实测值');
  });

  it('待入库详情在最终报告与磅单已确定后直接预览折干计价数量，并带出当前操作人', async () => {
    prisma.user.findUnique.mockResolvedValue({ name: '入库员' } as any);
    prisma.material.findUnique.mockResolvedValue({ name: '萤石精粉', pricingQuantityBasis: 'DRY_MATTER' } as any);
    prisma.qualityInspection.findUnique.mockResolvedValue({ status: 'CONFIRMED', indicators: [
      { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
    ] } as any);
    prisma.inboundReceipt.findFirst.mockResolvedValue({
      id: 'receipt-1', status: 'PENDING', qualityInspectionId: 'report-1', acceptanceConclusion: 'PASS',
      weighTicket: { status: 'REVIEWED', netWeight: new Prisma.Decimal(100) },
      qualityInspection: { status: 'CONFIRMED', conclusion: 'PASS', indicators: [] },
      waybill: { status: 'ARRIVED', weighTickets: [], lineItems: [{ materialId: 'material-1' }],
        qualityTask: { status: 'COMPLETED', basisInspectionId: 'report-1', qualityDisposition: 'PASS' }, dispatchNotice: {} },
    } as any);

    const result = await service.findReceipt('receipt-1', 'user-1');
    expect(result).toMatchObject({ currentOperatorName: '入库员', pricingPreview: {
      pricingQuantity: 88, pricingQuantityBasis: 'DRY_MATTER', measuredMoisturePct: 12,
    } });
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('质检异常经人工说明后可确认收货，系统记录确认人和原因', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      id: 'receipt-1', status: 'PENDING', qualityInspectionId: 'report-1', waybillId: 'waybill-1', weighTicketId: 'ticket-1',
      warehouseId: 'warehouse-1', receivedAt: new Date(), currentOperatorName: '入库员',
      acceptanceConclusion: 'REJECT', qualityInspection: { status: 'CONFIRMED', conclusion: 'FUSE', indicators: [] },
      weighTicket: { netWeight: new Prisma.Decimal(100) },
      waybill: { lineItems: [{ materialId: 'material-1' }], qualityTask: { status: 'COMPLETED', basisInspectionId: 'report-1' } },
    } as any);
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'warehouse-1' } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({ weighTicketId: 'ticket-1' } as any);
    prisma.material.findUnique.mockResolvedValue({ name: '萤石精粉', pricingQuantityBasis: 'DRY_MATTER' } as any);
    prisma.qualityInspection.findUnique.mockResolvedValue({ status: 'CONFIRMED', indicators: [
      { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
    ] } as any);
    prisma.inboundReceipt.update.mockResolvedValue({ status: 'RECEIVED' } as any);

    await service.confirmReceipt('receipt-1', 'user-1', '已复核异常，扣水后接收');
    expect(prisma.inboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'RECEIVED', receiverName: '入库员', pricingQuantity: 88,
      qualityExceptionReason: '已复核异常，扣水后接收', qualityExceptionAcceptedBy: 'user-1',
    }) }));
  });
  it('迁移后未核对的已收货历史单不得直接过账', async () => {
    prisma.inboundReceipt.findFirst.mockResolvedValue({
      id: 'legacy-receipt', status: 'RECEIVED', quantitySource: 'LEGACY_UNVERIFIED',
      waybill: { weighTickets: [], lineItems: [], dispatchNotice: { order: { contract: {} } } },
    } as any);
    await expect(service.postInventory('legacy-receipt', 'user-1')).rejects.toThrow('历史收货数量尚未');
    expect(prisma.businessInbound.create).not.toHaveBeenCalled();
  });

  it('只选择已到货、已复核且存在最终质检报告的采购运单，异常不被硬拦截', async () => {
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
                basisForTasks: { some: { status: 'COMPLETED' } },
              }),
            },
          }),
        },
      }),
    }));
  });

  it('详情返回统一收货默认值，读取不回填数据库', async () => {
    const signedAt = new Date('2026-10-22T09:10:11Z');
    prisma.inboundReceipt.findFirst.mockResolvedValue({
      id: 'receipt-defaults', status: 'PENDING', warehouseId: null, receivedAt: null, receiverName: null,
      waybill: {
        status: 'SIGNED', signedAt, weighTickets: [],
        dispatchNotice: {
          destinationWarehouseId: 'warehouse-destination', destinationContactPerson: '现场联系人',
          destinationWarehouse: { id: 'warehouse-destination', status: 'ACTIVE', manager: '仓库负责人' },
        },
      },
    } as any);

    const result = await service.findReceipt('receipt-defaults', 'user-1');

    expect(result).toMatchObject({
      warehouseId: null, receivedAt: null, receiverName: null,
      receiptDefaults: { warehouseId: 'warehouse-destination', receivedAt: signedAt, receiverName: null, receivedAtSource: 'SIGNED' },
    });
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('待收货详情直接显示关联检测报告的实测水分', async () => {
    prisma.inboundReceipt.findFirst.mockResolvedValue({
      id: 'receipt-moisture', status: 'PENDING', measuredMoisturePct: null,
      qualityInspection: { status: 'CONFIRMED', indicators: [
        { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
      ] },
      waybill: { weighTickets: [], dispatchNotice: {} },
    } as any);
    const result = await service.findReceipt('receipt-moisture', 'user-1');
    expect(result.reportMeasuredMoisturePct).toBe(12);
    expect(prisma.inboundReceipt.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        qualityInspection: expect.objectContaining({
          select: expect.objectContaining({ indicators: expect.anything() }),
        }),
      }),
    }));
  });

  it('异常质检报告可作为入库候选，仓库等基础信息仍须有效', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
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
      qualityTask: { qualityDisposition: 'DEDUCTION_PENDING' },
    } as any);

    await expect(service.createReceipt({
      waybillId: 'waybill-1',
      weighTicketId: 'ticket-1',
      qualityInspectionId: 'quality-1',
      warehouseId: 'warehouse-1',
      receivedAt: new Date().toISOString(),
      receiverName: '收货员',
    }, 'user-1')).rejects.toThrow('入库仓库不存在或已停用');
    expect(prisma.qualityInspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ qualityTask: { status: 'COMPLETED', basisInspectionId: 'quality-1' } }),
    }));
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
      qualityTask: { qualityDisposition: 'LEGACY', qualityDeductionPerTon: null, contractQualityEvaluation: null },
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
          dispatchNotice: { type: 'PURCHASE', destinationWarehouseId: 'warehouse-1' },
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
        contractQualityEvaluation: Prisma.DbNull,
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

  it.each([
    { conclusion: 'DEDUCTION', disposition: 'DEDUCTION_PENDING', deductionPerTon: 20,
      evaluation: { disposition: 'DEDUCTION', items: [] }, expectedEvaluation: { disposition: 'DEDUCTION', items: [] } },
    { conclusion: 'FUSE', disposition: 'REJECT', deductionPerTon: null,
      evaluation: null, expectedEvaluation: Prisma.DbNull },
  ])('最终报告为 $conclusion 时均同步已提前生成的入库单', async ({ conclusion, disposition, deductionPerTon, evaluation, expectedEvaluation }) => {
    const existing = {
      id: 'receipt-1', receiptNo: 'LIR-001', status: 'PENDING',
      qualityInspectionId: null, waybill: { status: 'ARRIVED', weighTickets: [] },
    };
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-2', materialName: '铁矿石', materialSpec: '粉矿', supplierName: '供应商A',
      settlementWeight: 98, moistureDeductionWeight: 1, impurityDeductionWeight: 1, deductionAmount: 0,
      status: 'CONFIRMED',
      conclusion,
      qualityTask: { qualityDisposition: disposition, qualityDeductionPerTon: deductionPerTon,
        contractQualityEvaluation: evaluation },
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
      acceptanceConclusion: disposition,
      qualityInspection: { status: 'CONFIRMED', conclusion },
    } as any);

    await service.createPendingReceiptForConfirmedQuality('quality-2', 'user-1');

    expect(prisma.inboundReceipt.create).not.toHaveBeenCalled();
    expect(prisma.inboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'receipt-1' },
      data: expect.objectContaining({
        weighTicketId: 'ticket-1',
        qualityInspectionId: 'quality-2',
        acceptanceConclusion: disposition,
        contractQualityDeductionPerTon: deductionPerTon,
        contractQualityEvaluation: expectedEvaluation,
        receivedQuantity: 100,
      }),
    }));
  });

  it('不合格报告先形成最终结论时先同步质检依据，不等待磅单复核和运单到达', async () => {
    const existing = { id: 'receipt-1', status: 'PENDING', qualityInspectionId: null,
      waybill: { status: 'IN_TRANSIT', weighTickets: [] } };
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'report-fuse', status: 'CONFIRMED', conclusion: 'FUSE', materialName: '萤石精粉',
      moistureDeductionWeight: 0, impurityDeductionWeight: 0, deductionAmount: 0,
      qualityTask: { qualityDisposition: 'REJECT', qualityDeductionPerTon: null, contractQualityEvaluation: null },
      weighTicket: { id: 'ticket-1', status: 'COMPLETED', netWeight: 100,
        waybill: { id: 'waybill-1', status: 'IN_TRANSIT', inboundReceipts: [existing],
          dispatchNotice: { type: 'PURCHASE' } } },
    } as any);
    prisma.inboundReceipt.update.mockResolvedValue({ ...existing, qualityInspectionId: 'report-fuse',
      acceptanceConclusion: 'REJECT', qualityInspection: { status: 'CONFIRMED', conclusion: 'FUSE', indicators: [] } } as any);

    await service.createPendingReceiptForConfirmedQuality('report-fuse', 'user-1');

    const data = prisma.inboundReceipt.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ qualityInspectionId: 'report-fuse', acceptanceConclusion: 'REJECT',
      contractQualityEvaluation: Prisma.DbNull });
    expect(data).not.toHaveProperty('weighTicketId');
    expect(data).not.toHaveProperty('receivedQuantity');
  });

  it('仓管可以重新同步同一运单下的最终采用报告', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      id: 'receipt-1', waybillId: 'waybill-1', status: 'PENDING', plateNo: '沪A12345',
      weighTicketId: 'ticket-1',
      weighTicket: { id: 'ticket-1', status: 'REVIEWED', netWeight: 100 },
    } as any);
    prisma.qualityInspection.findFirst.mockResolvedValue({
      id: 'quality-2', weighTicketId: 'ticket-2', materialName: '铁矿石', materialSpec: '粉矿',
      supplierName: '供应商A', plateNo: '沪A12345', settlementWeight: 97.5,
      moistureDeductionWeight: 1, impurityDeductionWeight: 0.5, deductionAmount: 0,
      qualityTask: { qualityDisposition: 'LEGACY', qualityDeductionPerTon: null, contractQualityEvaluation: null },
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
        id: 'quality-2', status: 'CONFIRMED',
        weighTicket: expect.objectContaining({ waybillId: 'waybill-1', deletedAt: null }),
      }),
    }));
    expect(prisma.inboundReceipt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        weighTicketId: 'ticket-1', qualityInspectionId: 'quality-2', receivedQuantity: 100,
      }),
    }));
  });

  it('质检异常待入库单需要人工接收原因', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'PENDING',
      qualityInspectionId: 'quality-1',
      acceptanceConclusion: 'DEDUCTION',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'DEDUCTION' },
    } as any);

    await expect(service.confirmReceipt('receipt-1', 'user-1'))
      .rejects.toThrow('质检指标存在异常');
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('待入库单补齐仓库、时间和收货人后才能确认', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'PENDING',
      warehouseId: null,
      receivedAt: null,
      receiverName: null,
      qualityInspectionId: 'quality-1',
      acceptanceConclusion: 'PASS',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'PASS' },
    } as any);

    await expect(service.confirmReceipt('receipt-1', 'user-1')).rejects.toThrow('请先选择入库仓库');
    expect(prisma.inboundReceipt.update).not.toHaveBeenCalled();
  });

  it('历史异常已收货单缺少人工确认记录时不能正式入账', async () => {
    jest.spyOn(service, 'findReceipt').mockResolvedValue({
      status: 'RECEIVED',
      acceptanceConclusion: 'DEDUCTION',
      qualityInspectionId: 'quality-1',
      qualityInspection: { status: 'CONFIRMED', conclusion: 'DEDUCTION' },
      businessInbound: null,
    } as any);

    await expect(service.postInventory('receipt-1', 'user-1'))
      .rejects.toThrow('质检指标存在异常');
    expect(prisma.businessInbound.create).not.toHaveBeenCalled();
  });

  it('库存总览按库存主体和仓库汇总账面、冻结与可用数量', async () => {
    prisma.inventoryLot.findMany.mockResolvedValue([
      {
        id: 'lot-1', materialId: 'm1', warehouseId: 'w1', ownerPartnerId: 'owner-1', businessUnitId: 'bu-1',
        availableQuantity: 12.5, createdAt: new Date('2026-01-01'),
        businessUnit: { id: 'bu-1', code: 'BU-YM', name: '玉门事业部' },
        warehouse: { id: 'w1', code: 'WH01', name: '一号仓' },
        inventoryOwner: { id: 'owner-1', code: 'OWN01', name: '采购主体一' },
        material: { unit: '吨' },
      },
      {
        id: 'lot-2', materialId: 'm1', warehouseId: 'w2', ownerPartnerId: 'owner-1', businessUnitId: 'bu-1',
        availableQuantity: 7.5, createdAt: new Date('2026-01-02'),
        businessUnit: { id: 'bu-1', code: 'BU-YM', name: '玉门事业部' },
        warehouse: { id: 'w2', code: 'WH02', name: '二号仓' },
        inventoryOwner: { id: 'owner-1', code: 'OWN01', name: '采购主体一' },
        material: { unit: '吨' },
      },
      {
        id: 'lot-3', materialId: 'm2', warehouseId: 'w1', ownerPartnerId: 'owner-2', businessUnitId: 'bu-2',
        availableQuantity: 5, createdAt: new Date('2026-01-03'),
        businessUnit: { id: 'bu-2', code: 'BU-LY', name: '龙游事业部' },
        warehouse: { id: 'w1', code: 'WH01', name: '一号仓' },
        inventoryOwner: { id: 'owner-2', code: 'OWN02', name: '采购主体二' },
        material: { unit: '吨' },
      },
    ] as any);
    prisma.outboundOrderLine.findMany.mockResolvedValue([]);

    const result = await service.inventoryOverview({}, 'user-1');

    expect(result.summary).toEqual({
      lotCount: 3,
      materialCount: 2,
      warehouseCount: 2,
      ownerCount: 2,
      businessUnitCount: 2,
      totalQuantity: 25,
      totalPhysicalQuantity: 25,
      totalReservedQuantity: 0,
      totalAvailableQuantity: 25,
      quantityTotalsByUnit: [{ unit: '吨', physicalQuantity: 25, reservedQuantity: 0, availableQuantity: 25 }],
    });
    expect(result.ownerSummaries).toHaveLength(2);
    expect(result.businessUnitSummaries).toHaveLength(2);
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
