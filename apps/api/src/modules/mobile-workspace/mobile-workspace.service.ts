import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export const MOBILE_BUSINESS_MODULES = [
  'contracts', 'orders', 'dispatch-notices', 'waybills', 'weigh-tickets', 'quality-tasks',
  'inbound-receipts', 'outbound-receipts', 'inventory',
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
    private readonly outbound: OutboundService,
  ) {}

  private modulePermission(module: MobileBusinessModule) {
    const permissions: Record<MobileBusinessModule, string> = {
      contracts: 'contract.view',
      orders: 'execution.view',
      'dispatch-notices': 'execution.view',
      waybills: 'logistics.view',
      'weigh-tickets': 'quality.view',
      'quality-tasks': 'quality.view',
      'inbound-receipts': 'inventory.view',
      'outbound-receipts': 'inventory.view',
      inventory: 'inventory.view',
    };
    return permissions[module];
  }

  async businessModules(userId: string) {
    const context = await this.access.getContext(userId);
    const definitions: Array<{ key: MobileBusinessModule; name: string; description: string; managePermission: string }> = [
      { key: 'contracts', name: '合同查询', description: '合同基础信息、履约状态及明细', managePermission: 'contract.edit' },
      { key: 'orders', name: '执行批次', description: '合同拆分后的具体执行批次', managePermission: 'execution.manage' },
      { key: 'dispatch-notices', name: '执行通知', description: '采购发货指令和销售发货通知', managePermission: 'execution.manage' },
      { key: 'waybills', name: '物流运单', description: '车辆、司机、线路和运输进度', managePermission: 'logistics.manage' },
      { key: 'weigh-tickets', name: '磅单管理', description: '现场证据、发货/收货称重及执行口径', managePermission: 'quality.manage' },
      { key: 'quality-tasks', name: '质检管理', description: '取样证据、多机构检测报告和最终结论', managePermission: 'quality.manage' },
      { key: 'inbound-receipts', name: '入库管理', description: '待入库、收货确认及库存入账', managePermission: 'inventory.manage' },
      { key: 'outbound-receipts', name: '出库管理', description: '出库差异处理、放行及库存扣减', managePermission: 'inventory.manage' },
      { key: 'inventory', name: '库存查询', description: '库存主体、仓库及可用库存', managePermission: 'inventory.manage' },
    ];
    return definitions.map((item) => ({
      ...item,
      permission: this.modulePermission(item.key),
      enabled: context.isAdmin || context.permissions.includes(this.modulePermission(item.key)),
      canManage: context.isAdmin || context.permissions.includes(item.managePermission),
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
      case 'inbound-receipts': return this.inventory.findReceipts({ search: query.search, status: query.status }, userId);
      case 'outbound-receipts': return this.outbound.findAll({ search: query.search, status: query.status }, userId);
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
      case 'inbound-receipts': return this.inventory.findReceipt(id, userId);
      case 'outbound-receipts': return this.outbound.findOne(id, userId);
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
    const canViewQuality = context.isAdmin || context.permissions.includes('quality.view');
    const canViewInventory = context.isAdmin || context.permissions.includes('inventory.view');
    const canViewLogistics = context.isAdmin || context.permissions.includes('logistics.view');
    const [pendingRows, contractCount, executingCount, pendingDispatch, inTransit, pendingReceipt, pendingWeighing, pendingQuality, pendingInbound, pendingOutbound] = await Promise.all([
      canApprove ? this.prisma.approval.findMany({
        where: { status: 'PENDING', ...pendingWhere, contract: { deletedAt: null, status: 'PENDING_APPROVAL' } },
        select: { contractId: true, round: true, step: true },
        take: 500,
      }) : Promise.resolve([]),
      contractScope ? this.prisma.contract.count({ where: { deletedAt: null, AND: [contractScope] } }) : Promise.resolve(0),
      contractScope ? this.prisma.contract.count({ where: { deletedAt: null, status: 'EXECUTING', AND: [contractScope] } }) : Promise.resolve(0),
      canViewLogistics ? this.access.getWaybillScope(userId).then(scope => this.prisma.waybill.count({
        where: { deletedAt: null, status: 'PENDING', AND: [scope] },
      })) : Promise.resolve(0),
      canViewLogistics ? this.access.getWaybillScope(userId).then(scope => this.prisma.waybill.count({
        where: { deletedAt: null, status: 'IN_TRANSIT', AND: [scope] },
      })) : Promise.resolve(0),
      canViewLogistics ? this.access.getWaybillScope(userId).then(scope => this.prisma.waybill.count({
        where: { deletedAt: null, status: 'ARRIVED', AND: [scope] },
      })) : Promise.resolve(0),
      canViewQuality ? this.access.getWaybillScope(userId).then(scope => this.prisma.weighTask.count({
        where: { deletedAt: null, status: { in: ['PENDING_WEIGHING', 'IN_PROGRESS', 'PENDING_CONFIRMATION', 'EXCEPTION'] }, waybill: { deletedAt: null, AND: [scope] } },
      })) : Promise.resolve(0),
      canViewQuality ? this.access.getQualityTaskScope(userId).then(scope => this.prisma.qualityTask.count({
        where: { deletedAt: null, status: { in: ['PENDING_SAMPLING', 'PENDING_SENDING', 'INSPECTING', 'PENDING_DECISION', 'EXCEPTION'] }, AND: [scope] },
      })) : Promise.resolve(0),
      canViewInventory ? this.access.getInboundReceiptScope(userId).then(scope => this.prisma.inboundReceipt.count({
        where: { deletedAt: null, status: { in: ['PENDING', 'RECEIVED'] }, AND: [scope] },
      })) : Promise.resolve(0),
      canViewInventory ? this.access.getOutboundReceiptScope(userId).then(scope => this.prisma.outboundReceipt.count({
        where: { deletedAt: null, status: { in: ['PENDING', 'READY', 'VARIANCE_PENDING'] }, AND: [scope] },
      })) : Promise.resolve(0),
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
      summary: {
        pendingApprovals: pendingCount, contracts: contractCount, executingContracts: executingCount,
        pendingDispatch, inTransit, pendingReceipt, pendingWeighing, pendingQuality, pendingInbound, pendingOutbound,
      },
    };
  }

  async activeWarehouses(userId: string) {
    await this.access.assertPermission(userId, 'inventory.manage');
    return this.prisma.warehouse.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, address: true },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
  }

  async logisticsOptions(userId: string, search?: string) {
    await this.access.assertPermission(userId, 'logistics.manage');
    const keyword = search?.trim();
    const [vehicles, drivers, carriers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          ...(keyword ? {
            OR: [
              { plateNo: { contains: keyword, mode: 'insensitive' as const } },
              { brand: { contains: keyword, mode: 'insensitive' as const } },
              { ownerName: { contains: keyword, mode: 'insensitive' as const } },
              { driverName: { contains: keyword, mode: 'insensitive' as const } },
            ],
          } : {}),
        },
        select: {
          id: true, plateNo: true, vehicleType: true, ownerType: true, ownerId: true,
          ownerName: true, driverName: true, driverPhone: true,
          waybills: {
            where: { deletedAt: null, status: 'IN_TRANSIT' },
            select: { id: true, waybillNo: true },
            take: 1,
          },
        },
        orderBy: [{ plateNo: 'asc' }],
        take: 200,
      }),
      this.prisma.driver.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          ...(keyword ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' as const } },
              { phone: { contains: keyword, mode: 'insensitive' as const } },
              { serviceOrganization: { partner: { name: { contains: keyword, mode: 'insensitive' as const } } } },
            ],
          } : {}),
        },
        select: {
          id: true, name: true, phone: true, serviceOrganizationId: true,
          serviceOrganization: { select: { partnerId: true, partner: { select: { id: true, name: true } } } },
          waybills: {
            where: { deletedAt: null, status: 'IN_TRANSIT' },
            select: { id: true, waybillNo: true },
            take: 1,
          },
        },
        orderBy: [{ name: 'asc' }],
        take: 200,
      }),
      this.prisma.serviceOrganization.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          organizationType: 'LOGISTICS_CARRIER',
          partner: {
            deletedAt: null,
            status: 'ACTIVE',
            roles: { has: 'SUPPLIER' },
          },
        },
        select: { id: true, partnerId: true, partner: { select: { id: true, code: true, name: true, isInternal: true } } },
        orderBy: { partner: { name: 'asc' } },
        take: 200,
      }),
    ]);
    return {
      vehicles: vehicles.map(item => ({
        ...item,
        available: item.waybills.length === 0,
        activeWaybill: item.waybills[0] || null,
      })),
      drivers: drivers.map(item => ({
        ...item,
        carrierPartnerId: item.serviceOrganization.partnerId,
        carrierName: item.serviceOrganization.partner.name,
        available: item.waybills.length === 0,
        activeWaybill: item.waybills[0] || null,
      })),
      carriers: carriers.map(item => ({
        id: item.partner.id,
        serviceOrganizationId: item.id,
        code: item.partner.code,
        name: item.partner.name,
        isInternal: item.partner.isInternal,
      })),
    };
  }

  async activeQualityInstitutions(userId: string) {
    await this.access.assertPermission(userId, 'quality.manage');
    const rows = await this.prisma.serviceOrganization.findMany({
      where: {
        organizationType: 'QUALITY_INSTITUTION', status: 'ACTIVE', deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
      },
      select: { partner: { select: { id: true, code: true, name: true } } },
      orderBy: { partner: { name: 'asc' } },
    });
    return rows.map(item => item.partner);
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
