import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { ContractService } from '../contract/contract.service';
import { DispatchNoticeService } from '../dispatch-notice/dispatch-notice.service';
import { InventoryService } from '../inventory/inventory.service';
import { WaybillService } from '../logistics/waybill.service';
import { OrderService } from '../order/order.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';

export const MOBILE_BUSINESS_MODULES = [
  'contracts', 'orders', 'dispatch-notices', 'waybills', 'weigh-tickets', 'quality-tasks', 'inventory',
] as const;
export type MobileBusinessModule = typeof MOBILE_BUSINESS_MODULES[number];

@Injectable()
export class MobileWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly contracts: ContractService,
    private readonly orders: OrderService,
    private readonly dispatchNotices: DispatchNoticeService,
    private readonly waybills: WaybillService,
    private readonly weighTickets: WeighTicketService,
    private readonly quality: QualityInspectionService,
    private readonly inventory: InventoryService,
  ) {}

  private modulePermission(module: MobileBusinessModule) {
    const permissions: Record<MobileBusinessModule, string> = {
      contracts: 'contract.view',
      orders: 'execution.view',
      'dispatch-notices': 'execution.view',
      waybills: 'logistics.view',
      'weigh-tickets': 'quality.view',
      'quality-tasks': 'quality.view',
      inventory: 'inventory.view',
    };
    return permissions[module];
  }

  async businessModules(userId: string) {
    const context = await this.access.getContext(userId);
    const definitions: Array<{ key: MobileBusinessModule; name: string; description: string }> = [
      { key: 'contracts', name: '合同查询', description: '合同基础信息、履约状态及明细' },
      { key: 'orders', name: '执行批次', description: '合同拆分后的具体执行批次' },
      { key: 'dispatch-notices', name: '执行通知', description: '采购发货指令和销售发货通知' },
      { key: 'waybills', name: '物流运单', description: '车辆、司机、线路和运输进度' },
      { key: 'weigh-tickets', name: '磅单信息', description: '运单关联的发货及收货称重' },
      { key: 'quality-tasks', name: '质检管理', description: '质检任务、检测报告和最终结论' },
      { key: 'inventory', name: '库存查询', description: '库存主体、仓库及可用库存' },
    ];
    return definitions.map((item) => ({
      ...item,
      permission: this.modulePermission(item.key),
      enabled: context.isAdmin || context.permissions.includes(this.modulePermission(item.key)),
    }));
  }

  async businessList(
    userId: string,
    module: MobileBusinessModule,
    query: { search?: string; status?: string; page?: number; pageSize?: number },
  ) {
    switch (module) {
      case 'contracts':
        return this.contracts.findAll({
          search: query.search, status: query.status, page: query.page, pageSize: query.pageSize,
        }, userId);
      case 'orders':
        return this.orders.findAll({
          search: query.search, status: query.status, page: query.page, pageSize: query.pageSize,
        }, userId);
      case 'dispatch-notices':
        return this.dispatchNotices.findAll({ search: query.search, status: query.status }, userId);
      case 'waybills':
        return this.waybills.findAll({ search: query.search, status: query.status }, userId);
      case 'weigh-tickets':
        return this.weighTickets.findManagementFiles({ search: query.search, status: query.status }, userId);
      case 'quality-tasks':
        return this.quality.findTasks({
          search: query.search, status: query.status, page: query.page, pageSize: query.pageSize,
        }, userId);
      case 'inventory':
        return this.inventory.inventoryOverview({ search: query.search }, userId);
    }
  }

  async businessDetail(userId: string, module: MobileBusinessModule, id: string) {
    switch (module) {
      case 'contracts': return this.contracts.findOne(id, userId);
      case 'orders': return this.orders.findOne(id, userId);
      case 'dispatch-notices': return this.dispatchNotices.findOne(id, userId);
      case 'waybills': return this.waybills.findOne(id, userId);
      case 'weigh-tickets': return this.weighTickets.findManagementFile(id, userId);
      case 'quality-tasks': return this.quality.findTask(id, userId);
      case 'inventory': {
        const overview = await this.inventory.inventoryOverview({}, userId);
        const lot = overview.lots.find((item) => item.id === id);
        if (!lot) throw new NotFoundException('库存批次不存在');
        return lot;
      }
    }
  }

  async overview(userId: string) {
    const context = await this.access.getContext(userId);
    const canApprove = context.isAdmin || context.permissions.includes('contract.approve');
    const canViewContracts = context.isAdmin || context.permissions.includes('contract.view');
    const pendingWhere = context.isAdmin ? {} : { assigneeId: userId };
    const contractScope = canViewContracts ? await this.access.getContractScope(userId) : null;
    const [pendingRows, contractCount, executingCount] = await Promise.all([
      canApprove ? this.prisma.approval.findMany({
        where: { status: 'PENDING', ...pendingWhere, contract: { deletedAt: null, status: 'PENDING_APPROVAL' } },
        select: { contractId: true, round: true, step: true },
        take: 500,
      }) : Promise.resolve([]),
      contractScope ? this.prisma.contract.count({ where: { deletedAt: null, AND: [contractScope] } }) : Promise.resolve(0),
      contractScope ? this.prisma.contract.count({ where: { deletedAt: null, status: 'EXECUTING', AND: [contractScope] } }) : Promise.resolve(0),
    ]);
    const pendingCount = new Set(pendingRows.map((item) => `${item.contractId}:${item.round}:${item.step}`)).size;
    return {
      account: {
        id: context.user.id,
        username: context.user.username,
        name: context.user.name,
        company: context.user.company,
        employee: context.user.employee,
        roles: context.roleCodes,
        roleNames: context.roleNames,
        permissions: context.permissions,
      },
      summary: { pendingApprovals: pendingCount, contracts: contractCount, executingContracts: executingCount },
    };
  }

  async approvalList(userId: string, status: 'PENDING' | 'DONE' = 'PENDING') {
    await this.access.assertPermission(userId, 'contract.approve');
    const context = await this.access.getContext(userId);
    const where: Prisma.ApprovalWhereInput = status === 'PENDING'
      ? {
        status: 'PENDING',
        ...(context.isAdmin ? {} : { assigneeId: userId }),
        contract: { deletedAt: null, status: 'PENDING_APPROVAL' },
      }
      : {
        actedById: userId,
        status: { in: ['APPROVED', 'REJECTED'] },
        contract: { deletedAt: null },
      };
    const rows = await this.prisma.approval.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true } },
        contract: {
          select: {
            id: true, contractNo: true, title: true, type: true, status: true, totalAmount: true,
            createdAt: true, signedAt: true,
            seller: { select: { id: true, name: true } },
            buyer: { select: { id: true, name: true } },
            signingPartner: { select: { id: true, name: true } },
            company: { select: { id: true, code: true, name: true } },
            creator: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: status === 'PENDING' ? { createdAt: 'asc' } : { actedAt: 'desc' },
      take: 300,
    });
    const unique = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = status === 'PENDING' ? `${row.contractId}:${row.round}:${row.step}` : row.id;
      if (!unique.has(key)) unique.set(key, row);
    }
    return {
      status,
      total: unique.size,
      list: Array.from(unique.values()).map((item) => ({
        id: item.id,
        nodeName: item.nodeName,
        roleName: item.roleName,
        approvalMode: item.approvalMode,
        step: item.step,
        round: item.round,
        status: item.status,
        comment: item.comment,
        actedAt: item.actedAt,
        assignee: item.assignee,
        contract: item.contract,
      })),
    };
  }

  async approvalDetail(userId: string, contractId: string) {
    const context = await this.access.getContext(userId);
    const contract = await this.contracts.findOne(contractId, userId, 'contract.approve');
    const currentTasks = await this.prisma.approval.findMany({
      where: { contractId, status: 'PENDING' },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: [{ round: 'desc' }, { step: 'asc' }],
    });
    const latestRound = currentTasks[0]?.round;
    const currentStep = currentTasks.filter((item) => item.round === latestRound)
      .reduce((min, item) => Math.min(min, item.step), Number.MAX_SAFE_INTEGER);
    const activeTasks = currentTasks.filter((item) => item.round === latestRound && item.step === currentStep);
    return {
      contract,
      currentNode: activeTasks[0] ? {
        nodeName: activeTasks[0].nodeName,
        roleName: activeTasks[0].roleName,
        approvalMode: activeTasks[0].approvalMode,
        step: activeTasks[0].step,
        assignees: activeTasks.map((item) => item.assignee),
      } : null,
      canAct: Boolean(activeTasks.length && (context.isAdmin || activeTasks.some((item) => item.assigneeId === userId))),
    };
  }

  decide(userId: string, userRole: string, contractId: string, decision: string, comment: string) {
    return this.contracts.updateStatus(
      contractId,
      { status: decision, comment: comment.trim() },
      { id: userId, role: userRole },
    );
  }
}
