import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';

type ActivityType = 'error' | 'warning' | 'success' | 'info';

type Activity = {
  id: string;
  occurredAt: Date;
  title: string;
  subtitle: string;
  href: string;
  type: ActivityType;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async overview(userId: string) {
    const context = await this.accessControl.getContext(userId);
    const can = (permission: string) => context.isAdmin || context.permissions.includes(permission);
    const permissions = {
      contracts: can('contract.view'),
      execution: can('execution.view'),
      logistics: can('logistics.view'),
      quality: can('quality.view'),
      inventory: can('inventory.view'),
      settlement: can('settlement.view'),
    };
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const activities: Activity[] = [];
    const alerts: Activity[] = [];

    const metrics = {
      monthlyPurchaseQuantity: 0,
      inTransitVehicles: 0,
      inventoryPhysicalQuantity: 0,
      inventoryAvailableQuantity: 0,
      alertCount: 0,
      activeContracts: 0,
      pendingApprovalContracts: 0,
      activeOrders: 0,
      pendingDispatchNotices: 0,
      overdueWaybills: 0,
      todayWeighTickets: 0,
      abnormalWeighTickets: 0,
      pendingQualityInspections: 0,
      fuseQualityInspections: 0,
      inventoryLotCount: 0,
      pendingInboundReceipts: 0,
      pendingOutboundOrders: 0,
    };

    if (permissions.contracts || permissions.execution) {
      const contractScope = await this.accessControl.getContractScope(userId);
      if (permissions.contracts) {
        const [activeContracts, pendingContracts, recentContracts] = await Promise.all([
          this.prisma.contract.count({ where: { AND: [contractScope, { deletedAt: null, status: { in: ['APPROVED', 'EXECUTING'] } }] } }),
          this.prisma.contract.count({ where: { AND: [contractScope, { deletedAt: null, status: 'PENDING_APPROVAL' }] } }),
          this.prisma.contract.findMany({
            where: { AND: [contractScope, { deletedAt: null }] },
            select: { id: true, contractNo: true, title: true, status: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' }, take: 4,
          }),
        ]);
        metrics.activeContracts = activeContracts;
        metrics.pendingApprovalContracts = pendingContracts;
        activities.push(...recentContracts.map((item): Activity => ({
          id: `contract:${item.id}`,
          occurredAt: item.updatedAt,
          title: `合同 ${item.contractNo} ${this.contractStatus(item.status)}`,
          subtitle: item.title,
          href: `/dashboard/contracts/${item.id}`,
          type: item.status === 'REJECTED' ? 'warning' : ['APPROVED', 'EXECUTING', 'COMPLETED'].includes(item.status) ? 'success' : 'info',
        })));
      }
      if (permissions.execution) {
        const orderScope = await this.accessControl.getOrderScope(userId);
        const dispatchScope = await this.accessControl.getDispatchNoticeScope(userId);
        const [activeOrders, pendingNotices] = await Promise.all([
          this.prisma.order.count({ where: { AND: [orderScope, { deletedAt: null, status: { in: ['CONFIRMED', 'DISPATCHED'] } }] } }),
          this.prisma.dispatchNotice.count({ where: { AND: [dispatchScope, { deletedAt: null, status: { in: ['DRAFT', 'ISSUED', 'IN_PROGRESS'] } }] } }),
        ]);
        metrics.activeOrders = activeOrders;
        metrics.pendingDispatchNotices = pendingNotices;
      }
    }

    if (permissions.logistics) {
      const waybillScope = await this.accessControl.getWaybillScope(userId);
      const [inTransit, overdue, recentWaybills, overdueItems] = await Promise.all([
        this.prisma.waybill.count({ where: { AND: [waybillScope, { deletedAt: null, status: 'IN_TRANSIT' }] } }),
        this.prisma.waybill.count({ where: { AND: [waybillScope, { deletedAt: null, status: 'IN_TRANSIT', plannedArrivalAt: { lt: now } }] } }),
        this.prisma.waybill.findMany({
          where: { AND: [waybillScope, { deletedAt: null }] },
          select: { id: true, waybillNo: true, plateNo: true, status: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 4,
        }),
        this.prisma.waybill.findMany({
          where: { AND: [waybillScope, { deletedAt: null, status: 'IN_TRANSIT', plannedArrivalAt: { lt: now } }] },
          select: { id: true, waybillNo: true, plateNo: true, plannedArrivalAt: true, updatedAt: true },
          orderBy: { plannedArrivalAt: 'asc' }, take: 8,
        }),
      ]);
      metrics.inTransitVehicles = inTransit;
      metrics.overdueWaybills = overdue;
      activities.push(...recentWaybills.map((item): Activity => ({
        id: `waybill:${item.id}`,
        occurredAt: item.updatedAt,
        title: `运单 ${item.waybillNo} ${this.waybillStatus(item.status)}`,
        subtitle: item.plateNo || '未绑定车辆',
        href: `/dashboard/waybills/${item.id}`,
        type: ['ARRIVED', 'SIGNED'].includes(item.status) ? 'success' : 'info',
      })));
      alerts.push(...overdueItems.map((item): Activity => ({
        id: `waybill-overdue:${item.id}`,
        occurredAt: item.updatedAt,
        title: `运单 ${item.waybillNo} 超过计划到达时间`,
        subtitle: item.plateNo || '未绑定车辆',
        href: `/dashboard/waybills/${item.id}`,
        type: 'warning',
      })));
    }

    if (permissions.quality) {
      const weighScope = await this.accessControl.getWeighTicketScope(userId);
      const qualityScope = await this.accessControl.getQualityTaskScope(userId);
      const [todayTickets, abnormalCount, pendingQuality, fuseCount, recentTickets, recentQuality, abnormalItems, fuseItems] = await Promise.all([
        this.prisma.weighTicket.count({ where: { AND: [weighScope, { deletedAt: null, status: { not: 'VOIDED' }, ticketDate: { gte: startOfDay } }] } }),
        this.prisma.weighTicket.count({ where: { AND: [weighScope, { deletedAt: null, status: { not: 'VOIDED' }, abnormal: true }] } }),
        this.prisma.qualityTask.count({ where: { AND: [qualityScope, { deletedAt: null, status: { in: ['PENDING_SAMPLING', 'INSPECTING', 'PENDING_DECISION', 'RECHECK_REQUIRED'] } }] } }),
        this.prisma.qualityTask.count({ where: { AND: [qualityScope, { deletedAt: null, status: { not: 'VOIDED' }, finalConclusion: 'FUSE' }] } }),
        this.prisma.weighTicket.findMany({
          where: { AND: [weighScope, { deletedAt: null, status: { not: 'VOIDED' } }] },
          select: { id: true, ticketNo: true, plateNo: true, status: true, abnormal: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 4,
        }),
        this.prisma.qualityTask.findMany({
          where: { AND: [qualityScope, { deletedAt: null, status: { not: 'VOIDED' } }] },
          select: { id: true, taskNo: true, status: true, finalConclusion: true, updatedAt: true, waybill: { select: { plateNo: true, lineItems: { select: { materialName: true }, take: 1 } } } },
          orderBy: { updatedAt: 'desc' }, take: 4,
        }),
        this.prisma.weighTicket.findMany({
          where: { AND: [weighScope, { deletedAt: null, status: { not: 'VOIDED' }, abnormal: true }] },
          select: { id: true, ticketNo: true, plateNo: true, varianceRate: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 8,
        }),
        this.prisma.qualityTask.findMany({
          where: { AND: [qualityScope, { deletedAt: null, status: { not: 'VOIDED' }, finalConclusion: 'FUSE' }] },
          select: { id: true, taskNo: true, decisionReason: true, updatedAt: true, waybill: { select: { plateNo: true, lineItems: { select: { materialName: true }, take: 1 } } } },
          orderBy: { updatedAt: 'desc' }, take: 8,
        }),
      ]);
      metrics.todayWeighTickets = todayTickets;
      metrics.abnormalWeighTickets = abnormalCount;
      metrics.pendingQualityInspections = pendingQuality;
      metrics.fuseQualityInspections = fuseCount;
      activities.push(...recentTickets.map((item): Activity => ({
        id: `weigh:${item.id}`,
        occurredAt: item.updatedAt,
        title: `磅单 ${item.ticketNo} ${item.abnormal ? '发现偏差' : this.weighStatus(item.status)}`,
        subtitle: item.plateNo || '未绑定车辆',
        href: `/dashboard/weighbridge/${item.id}`,
        type: item.abnormal ? 'error' : ['COMPLETED', 'REVIEWED'].includes(item.status) ? 'success' : 'info',
      })));
      activities.push(...recentQuality.map((item): Activity => ({
        id: `quality:${item.id}`,
        occurredAt: item.updatedAt,
        title: `质检任务 ${item.taskNo} ${this.qualityConclusion(item.finalConclusion)}`,
        subtitle: item.waybill.lineItems[0]?.materialName || item.waybill.plateNo || '到货质检',
        href: `/dashboard/quality/${item.id}`,
        type: item.finalConclusion === 'FUSE' ? 'error' : item.finalConclusion === 'DEDUCTION' ? 'warning' : item.finalConclusion === 'PASS' ? 'success' : 'info',
      })));
      alerts.push(...abnormalItems.map((item): Activity => ({
        id: `weigh-abnormal:${item.id}`,
        occurredAt: item.updatedAt,
        title: `磅单 ${item.ticketNo} 偏差异常`,
        subtitle: `${item.plateNo || '未绑定车辆'}${item.varianceRate === null ? '' : ` · 偏差率 ${Number(item.varianceRate)}%`}`,
        href: `/dashboard/weighbridge/${item.id}`,
        type: 'error',
      })));
      alerts.push(...fuseItems.map((item): Activity => ({
        id: `quality-fuse:${item.id}`,
        occurredAt: item.updatedAt,
        title: `质检任务 ${item.taskNo} 触发熔断`,
        subtitle: item.decisionReason || item.waybill.lineItems[0]?.materialName || '到货质检异常',
        href: `/dashboard/quality/${item.id}`,
        type: 'error',
      })));
    }

    if (permissions.inventory) {
      const inventoryScope = await this.accessControl.getInventoryLotScope(userId);
      const inboundScope = await this.accessControl.getInboundReceiptScope(userId);
      const dispatchScope = await this.accessControl.getDispatchNoticeScope(userId);
      const businessInboundScope = await this.accessControl.getBusinessInboundScope(userId);
      const [inventoryAggregate, lotCount, pendingInbound, pendingOutbound, monthlyInbound, recentInbounds] = await Promise.all([
        this.prisma.inventoryLot.aggregate({
          where: { AND: [inventoryScope, { availableQuantity: { gt: 0 } }] },
          _sum: { availableQuantity: true },
        }),
        this.prisma.inventoryLot.count({ where: { AND: [inventoryScope, { availableQuantity: { gt: 0 } }] } }),
        this.prisma.inboundReceipt.count({ where: { AND: [inboundScope, { deletedAt: null, status: { in: ['PENDING', 'RECEIVED'] } }] } }),
        this.prisma.outboundOrder.count({ where: { dispatchNotice: dispatchScope, status: { in: ['PENDING', 'PARTIAL'] } } }),
        this.prisma.businessInbound.aggregate({
          where: { AND: [businessInboundScope, { postedAt: { gte: startOfMonth }, status: { not: 'CANCELLED' } }] },
          _sum: { quantity: true },
        }),
        this.prisma.businessInbound.findMany({
          where: businessInboundScope,
          select: { id: true, inboundNo: true, receiptId: true, materialName: true, quantity: true, postedAt: true },
          orderBy: { postedAt: 'desc' }, take: 4,
        }),
      ]);
      metrics.inventoryPhysicalQuantity = Number(inventoryAggregate._sum.availableQuantity || 0);
      metrics.inventoryAvailableQuantity = metrics.inventoryPhysicalQuantity;
      metrics.inventoryLotCount = lotCount;
      metrics.pendingInboundReceipts = pendingInbound;
      metrics.pendingOutboundOrders = pendingOutbound;
      metrics.monthlyPurchaseQuantity = Number(monthlyInbound._sum.quantity || 0);
      activities.push(...recentInbounds.map((item): Activity => ({
        id: `inbound:${item.id}`,
        occurredAt: item.postedAt,
        title: `入库单 ${item.inboundNo} 已入账`,
        subtitle: `${item.materialName} · ${Number(item.quantity).toLocaleString('zh-CN')} 吨`,
        href: `/dashboard/inbound/${item.receiptId}`,
        type: 'success',
      })));
    }

    metrics.alertCount = metrics.abnormalWeighTickets + metrics.fuseQualityInspections + metrics.overdueWaybills;
    return {
      generatedAt: now.toISOString(),
      permissions,
      metrics,
      alerts: alerts.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 8),
      activities: activities.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 10),
    };
  }

  private contractStatus(status: string) {
    return ({ DRAFT: '保存为草稿', PENDING_APPROVAL: '已提交审批', APPROVED: '已通过', REJECTED: '已驳回', EXECUTING: '执行中', COMPLETED: '已完成', CLOSED: '已关闭', VOIDED: '已作废' } as Record<string, string>)[status] || status;
  }

  private waybillStatus(status: string) {
    return ({ PENDING: '待发运', IN_TRANSIT: '运输中', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已作废' } as Record<string, string>)[status] || status;
  }

  private weighStatus(status: string) {
    return ({ PENDING: '待称重', WEIGHING: '称重中', COMPLETED: '已完成', REVIEWED: '已复核' } as Record<string, string>)[status] || status;
  }

  private qualityConclusion(conclusion: string) {
    return ({ PENDING: '待判定', PASS: '合格', DEDUCTION: '超标扣款', FUSE: '熔断' } as Record<string, string>)[conclusion] || conclusion;
  }
}
