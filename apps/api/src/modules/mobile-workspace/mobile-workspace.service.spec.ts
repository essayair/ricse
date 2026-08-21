import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { ContractService } from '../contract/contract.service';
import { DispatchNoticeService } from '../dispatch-notice/dispatch-notice.service';
import { InventoryService } from '../inventory/inventory.service';
import { WaybillService } from '../logistics/waybill.service';
import { OrderService } from '../order/order.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';
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
      ],
    }).compile();
    service = module.get(MobileWorkspaceService);
  });

  it('系统管理员工作台按合同节点去重待审批数量', async () => {
    access.getContext.mockResolvedValue({
      isAdmin: true,
      user: { id: 'admin', username: 'admin', name: '管理员', company: null, employee: null },
      roleCodes: ['ADMIN'], permissions: [],
    } as any);
    access.getContractScope.mockResolvedValue({});
    prisma.approval.findMany.mockResolvedValue([
      { contractId: 'contract-1', round: 1, step: 1 },
      { contractId: 'contract-1', round: 1, step: 1 },
      { contractId: 'contract-2', round: 1, step: 2 },
    ] as any);
    prisma.contract.count.mockResolvedValueOnce(9).mockResolvedValueOnce(3);

    const result = await service.overview('admin');

    expect(result.summary).toEqual({ pendingApprovals: 2, contracts: 9, executingContracts: 3 });
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
    expect(result.find((item) => item.key === 'inventory')?.enabled).toBe(false);
  });

  it('移动业务查询复用物流服务的数据范围与查看权限', async () => {
    waybills.findAll.mockResolvedValue({ items: [{ id: 'waybill-1' }], total: 1 } as any);

    const result = await service.businessList('user-1', 'waybills', { search: '浙A' });

    expect(waybills.findAll).toHaveBeenCalledWith({ search: '浙A', status: undefined }, 'user-1');
    expect(result).toEqual({ items: [{ id: 'waybill-1' }], total: 1 });
  });

  it('库存批次详情只能从当前用户可见库存中取得', async () => {
    inventory.inventoryOverview.mockResolvedValue({ lots: [{ id: 'lot-1', lotNo: 'LOT001' }] } as any);

    await expect(service.businessDetail('user-1', 'inventory', 'lot-1')).resolves.toMatchObject({ lotNo: 'LOT001' });
    await expect(service.businessDetail('user-1', 'inventory', 'lot-2')).rejects.toThrow('库存批次不存在');
  });
});
