import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { ContractService } from '../contract/contract.service';
import { DispatchNoticeService } from '../dispatch-notice/dispatch-notice.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../inventory/outbound.service';
import { WaybillService } from '../logistics/waybill.service';
import { OrderService } from '../order/order.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';
import { PartnerService } from '../master-data/partner.service';
import { DriverService } from '../master-data/driver.service';
import { MobileWorkspaceService } from './mobile-workspace.service';

describe('MobileWorkspaceService', () => {
  const prisma = mockDeep<PrismaService>();
  const access = mockDeep<AccessControlService>();
  const contracts = mockDeep<ContractService>();
  const orders = mockDeep<OrderService>();
  const dispatchNotices = mockDeep<DispatchNoticeService>();
  const waybills = mockDeep<WaybillService>();
  const weighTickets = mockDeep<WeighTicketService>();
  const quality = mockDeep<QualityInspectionService>();
  const inventory = mockDeep<InventoryService>();
  const outbound = mockDeep<OutboundService>();
  const partners = mockDeep<PartnerService>();
  const drivers = mockDeep<DriverService>();
  let service: MobileWorkspaceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MobileWorkspaceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: access },
        { provide: ContractService, useValue: contracts },
        { provide: OrderService, useValue: orders },
        { provide: DispatchNoticeService, useValue: dispatchNotices },
        { provide: WaybillService, useValue: waybills },
        { provide: WeighTicketService, useValue: weighTickets },
        { provide: QualityInspectionService, useValue: quality },
        { provide: InventoryService, useValue: inventory },
        { provide: OutboundService, useValue: outbound },
        { provide: PartnerService, useValue: partners },
        { provide: DriverService, useValue: drivers },
      ],
    }).compile();
    service = module.get(MobileWorkspaceService);
  });

  it('系统管理员工作台按合同节点去重待审批数量', async () => {
    access.getContext.mockResolvedValue({
      isAdmin: true,
      user: {
        id: 'admin', username: 'admin', name: '管理员', company: null, employee: null,
        businessUnits: [{
          status: 'ACTIVE', effectiveAt: new Date('2026-01-01'), expiresAt: null, isDefault: true,
          businessUnit: { id: 'bu-1', code: 'BU-300000-001', name: '综合事业部', status: 'ACTIVE' },
        }],
      },
      roleCodes: ['ADMIN'], roleNames: ['系统管理员'], permissions: [],
    } as any);
    access.getContractScope.mockResolvedValue({});
    access.getWaybillScope.mockResolvedValue({});
    access.getQualityTaskScope.mockResolvedValue({});
    access.getInboundReceiptScope.mockResolvedValue({});
    access.getOutboundReceiptScope.mockResolvedValue({});
    prisma.approval.findMany.mockResolvedValue([
      { contractId: 'contract-1', round: 1, step: 1 },
      { contractId: 'contract-1', round: 1, step: 1 },
      { contractId: 'contract-2', round: 1, step: 2 },
    ] as any);
    prisma.contract.count.mockResolvedValueOnce(9).mockResolvedValueOnce(3);
    prisma.weighTask.count.mockResolvedValue(4);
    prisma.qualityTask.count.mockResolvedValue(5);
    prisma.waybill.count.mockResolvedValue(6);
    prisma.inboundReceipt.count.mockResolvedValue(7);
    prisma.outboundReceipt.count.mockResolvedValue(8);

    const result = await service.overview('admin');

    expect(result.summary).toEqual({
      pendingApprovals: 2, contracts: 9, executingContracts: 3,
      pendingDispatch: 6, pendingAssignment: 6, pendingDeparture: 6, inTransit: 6,
      pendingWeighing: 4, pendingQuality: 5, pendingReceipt: 6, pendingInbound: 7, pendingOutbound: 8,
    });
    expect(result.account.roleNames).toEqual(['系统管理员']);
    expect(result.account.businessUnits).toEqual([
      { id: 'bu-1', code: 'BU-300000-001', name: '综合事业部', isDefault: true },
    ]);
    expect(prisma.qualityTask.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['PENDING_SAMPLING', 'PENDING_SENDING', 'INSPECTING', 'PENDING_DECISION', 'RECHECK_REQUIRED', 'EXCEPTION'] },
      }),
    }));
    expect(prisma.approval.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ assigneeId: expect.anything() }),
    }));
  });

  it('移动审批复用现有合同状态流转服务', async () => {
    contracts.updateStatus.mockResolvedValue({ id: 'contract-1', status: 'APPROVED' } as any);

    await service.decide('user-1', 'APPROVER', 'contract-1', 'APPROVED', ' 同意 ');

    expect(contracts.updateStatus).toHaveBeenCalledWith(
      'contract-1',
      { status: 'APPROVED', comment: '同意' },
      { id: 'user-1', role: 'APPROVER' },
    );
  });

  it('只开放后台账号已有权限对应的移动业务模块', async () => {
    access.getContext.mockResolvedValue({
      isAdmin: false,
      permissions: ['contract.view', 'logistics.view'],
    } as any);

    const result = await service.businessModules('user-1');

    expect(result.find((item) => item.key === 'contracts')?.enabled).toBe(true);
    expect(result.find((item) => item.key === 'waybills')?.enabled).toBe(true);
    expect(result.find((item) => item.key === 'waybills')?.canManage).toBe(false);
    expect(result.find((item) => item.key === 'inventory')?.enabled).toBe(false);
  });

  it('移动业务查询复用物流服务的数据范围与查看权限', async () => {
    waybills.findAll.mockResolvedValue({ items: [{ id: 'waybill-1' }], total: 1 } as any);

    const result = await service.businessList('user-1', 'waybills', { search: '浙A' });

    expect(waybills.findAll).toHaveBeenCalledWith({ search: '浙A', status: undefined }, 'user-1');
    expect(result).toEqual({ items: [{ id: 'waybill-1' }], total: 1 });
  });

  it.each([
    ['weigh-tickets', weighTickets.findManagementFiles],
    ['quality-tasks', quality.findTasks],
    ['inbound-receipts', inventory.findReceipts],
    ['outbound-receipts', outbound.findAll],
  ] as Array<['weigh-tickets' | 'quality-tasks' | 'inbound-receipts' | 'outbound-receipts', jest.Mock]>)('兼容旧版小程序 %s 待办占位状态，不把 status=1 传给领域查询', async (businessModule, queryMethod) => {
    queryMethod.mockResolvedValue({ items: [], total: 0 });

    await service.businessList('user-1', businessModule, { status: '1', page: 1, pageSize: 100 });

    expect(queryMethod).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }), 'user-1');
  });

  it('现场待办由服务端按四类业务真实可操作状态直接筛选', async () => {
    weighTickets.findManagementFiles.mockResolvedValue({ items: [
      { id: 'weigh-active', weighTask: { status: 'PENDING_WEIGHING' } },
      { id: 'weigh-done', weighTask: { status: 'COMPLETED' } },
    ], total: 2 } as any);
    quality.findTasks.mockResolvedValue({ items: [
      { id: 'quality-active', status: 'RECHECK_REQUIRED' },
      { id: 'quality-done', status: 'COMPLETED' },
    ], pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 } } as any);
    inventory.findReceipts.mockResolvedValue({ items: [
      { id: 'inbound-active', status: 'RECEIVED' },
      { id: 'inbound-done', status: 'POSTED' },
    ], total: 2 } as any);
    outbound.findAll.mockResolvedValue({ items: [
      { id: 'outbound-active', status: 'VARIANCE_PENDING' },
      { id: 'outbound-done', status: 'POSTED' },
    ], total: 2 } as any);

    const weighResult = await service.businessList('user-1', 'weigh-tickets', { todo: 'ACTIVE' });
    const qualityResult = await service.businessList('user-1', 'quality-tasks', { todo: 'ACTIVE', pageSize: 100 });
    const inboundResult = await service.businessList('user-1', 'inbound-receipts', { todo: 'ACTIVE' });
    const outboundResult = await service.businessList('user-1', 'outbound-receipts', { todo: 'ACTIVE' });

    expect(weighResult.items.map((item: any) => item.id)).toEqual(['weigh-active']);
    expect(qualityResult.items.map((item: any) => item.id)).toEqual(['quality-active']);
    expect(qualityResult.pagination.total).toBe(1);
    expect(inboundResult.items.map((item: any) => item.id)).toEqual(['inbound-active']);
    expect(outboundResult.items.map((item: any) => item.id)).toEqual(['outbound-active']);
  });

  it('移动端保存车辆和司机档案前校验主数据维护权限', async () => {
    partners.createVehicle.mockResolvedValue({ id: 'vehicle-1', plateNo: '浙A12345' } as any);
    drivers.create.mockResolvedValue({ id: 'driver-1', name: '张师傅' } as any);
    const vehicle = {
      plateNo: '浙A12345', vehicleType: 'TRUCK', loadCapacity: 32,
      ownerType: 'OUTSOURCED', ownerId: 'partner-1',
    };
    const driver = { serviceOrganizationId: 'carrier-1', name: '张师傅', phone: '13800138000' };

    await expect(service.createLogisticsVehicle('user-1', vehicle)).resolves.toMatchObject({ id: 'vehicle-1' });
    await expect(service.createLogisticsDriver('user-1', driver)).resolves.toMatchObject({ id: 'driver-1' });

    expect(access.assertPermission).toHaveBeenNthCalledWith(1, 'user-1', 'master_data.manage');
    expect(access.assertPermission).toHaveBeenNthCalledWith(2, 'user-1', 'master_data.manage');
    expect(partners.createVehicle).toHaveBeenCalledWith(vehicle);
    expect(drivers.create).toHaveBeenCalledWith(driver);
  });

  it('库存批次详情只能从当前用户可见库存中取得', async () => {
    inventory.inventoryOverview.mockResolvedValue({ lots: [{ id: 'lot-1', lotNo: 'LOT001' }] } as any);

    await expect(service.businessDetail('user-1', 'inventory', 'lot-1')).resolves.toMatchObject({ lotNo: 'LOT001' });
    await expect(service.businessDetail('user-1', 'inventory', 'lot-2')).rejects.toThrow('库存批次不存在');
  });
});
