import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma: any = {
    contract: { count: jest.fn(), findMany: jest.fn() },
    order: { count: jest.fn() },
    dispatchNotice: { count: jest.fn() },
    waybill: { count: jest.fn(), findMany: jest.fn() },
    weighTicket: { count: jest.fn(), findMany: jest.fn() },
    qualityInspection: { count: jest.fn(), findMany: jest.fn() },
    inventoryLot: { aggregate: jest.fn(), count: jest.fn() },
    inboundReceipt: { count: jest.fn() },
    outboundOrder: { count: jest.fn() },
    businessInbound: { aggregate: jest.fn(), findMany: jest.fn() },
  };
  const accessControl: any = {
    getContext: jest.fn(),
    getContractScope: jest.fn().mockResolvedValue({}),
    getOrderScope: jest.fn().mockResolvedValue({}),
    getDispatchNoticeScope: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
    getWeighTicketScope: jest.fn().mockResolvedValue({}),
    getQualityInspectionScope: jest.fn().mockResolvedValue({}),
    getInventoryLotScope: jest.fn().mockResolvedValue({}),
    getInboundReceiptScope: jest.fn().mockResolvedValue({}),
    getBusinessInboundScope: jest.fn().mockResolvedValue({}),
  };
  const service = new DashboardService(prisma, accessControl);

  beforeEach(() => {
    jest.clearAllMocks();
    accessControl.getContext.mockResolvedValue({ isAdmin: true, permissions: [] });
    Object.values(prisma).forEach((model: any) => {
      model.count?.mockResolvedValue(0);
      model.findMany?.mockResolvedValue([]);
      model.aggregate?.mockResolvedValue({ _sum: { availableQuantity: null, quantity: null } });
    });
  });

  it('从真实业务表汇总总览指标并返回最近动态', async () => {
    prisma.contract.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.order.count.mockResolvedValueOnce(4);
    prisma.dispatchNotice.count.mockResolvedValueOnce(5);
    prisma.waybill.count.mockResolvedValueOnce(6).mockResolvedValueOnce(1);
    prisma.weighTicket.count.mockResolvedValueOnce(7).mockResolvedValueOnce(2);
    prisma.qualityInspection.count.mockResolvedValueOnce(8).mockResolvedValueOnce(3);
    prisma.inventoryLot.aggregate.mockResolvedValue({ _sum: { availableQuantity: 125.5 } });
    prisma.inventoryLot.count.mockResolvedValue(9);
    prisma.inboundReceipt.count.mockResolvedValue(10);
    prisma.outboundOrder.count.mockResolvedValue(11);
    prisma.businessInbound.aggregate.mockResolvedValue({ _sum: { quantity: 88.5 } });
    prisma.businessInbound.findMany.mockResolvedValue([{
      id: 'inbound-1', inboundNo: 'BIN-001', receiptId: 'receipt-1', materialName: '矿粉',
      quantity: 20, postedAt: new Date('2026-08-03T01:00:00Z'),
    }]);

    const result = await service.overview('user-1');

    expect(result.metrics).toEqual(expect.objectContaining({
      activeContracts: 3,
      pendingApprovalContracts: 2,
      activeOrders: 4,
      pendingDispatchNotices: 5,
      inTransitVehicles: 6,
      overdueWaybills: 1,
      todayWeighTickets: 7,
      abnormalWeighTickets: 2,
      pendingQualityInspections: 8,
      fuseQualityInspections: 3,
      inventoryPhysicalQuantity: 125.5,
      monthlyPurchaseQuantity: 88.5,
      inventoryLotCount: 9,
      pendingInboundReceipts: 10,
      pendingOutboundOrders: 11,
      alertCount: 6,
    }));
    expect(result.activities).toEqual([expect.objectContaining({
      title: '入库单 BIN-001 已入账',
      href: '/dashboard/inbound/receipt-1',
    })]);
  });

  it('无模块权限时不查询业务数据', async () => {
    accessControl.getContext.mockResolvedValue({ isAdmin: false, permissions: [] });

    const result = await service.overview('user-2');

    expect(result.permissions).toEqual({
      contracts: false, execution: false, logistics: false,
      quality: false, inventory: false, settlement: false,
    });
    expect(prisma.contract.count).not.toHaveBeenCalled();
    expect(prisma.inventoryLot.aggregate).not.toHaveBeenCalled();
  });
});
