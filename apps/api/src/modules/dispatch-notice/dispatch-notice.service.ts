import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateDispatchNoticeDto } from './dto/create-dispatch-notice.dto';

@Injectable()
export class DispatchNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    order: {
      include: {
        contract: {
          select: {
            id: true, contractNo: true, title: true, type: true, deliveryLocation: true,
            signingPartner: { select: { id: true, name: true } },
            seller: { select: { id: true, name: true, address: true } },
            buyer: { select: { id: true, name: true, address: true } },
          },
        },
      },
    },
    warehouse: { select: { id: true, code: true, name: true, address: true } },
    creator: { select: { id: true, name: true } },
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    waybills: {
      where: { deletedAt: null },
      select: { id: true, waybillNo: true, status: true, totalQuantity: true, plateNo: true },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private async generateNo(type: string) {
    const prefix = type === 'PURCHASE' ? 'PI' : 'SD';
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.dispatchNotice.count({ where: { type, createdAt: { gte: start, lt: end } } });
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async getOrderAvailability(orderId: string, userId: string, permission = 'execution.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getOrderScope(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null, AND: [scope] },
      include: { lineItems: { orderBy: { createdAt: 'asc' } }, contract: true },
    });
    if (!order) throw new NotFoundException('执行批次不存在');
    if (!['CONFIRMED', 'DISPATCHED'].includes(order.status)) {
      throw new BadRequestException('仅已确认或执行中的批次可以建立执行通知');
    }
    const used = await this.prisma.dispatchNoticeLineItem.groupBy({
      by: ['orderLineItemId'],
      where: { dispatchNotice: { orderId, deletedAt: null, status: { not: 'CANCELLED' } } },
      _sum: { quantity: true },
    });
    const map = new Map(used.map(item => [item.orderLineItemId, Number(item._sum.quantity || 0)]));
    return {
      order,
      lineItems: order.lineItems.map(item => ({
        orderLineItemId: item.id,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        batchQuantity: Number(item.quantity),
        notifiedQuantity: map.get(item.id) || 0,
        availableQuantity: Math.max(0, Number(item.quantity) - (map.get(item.id) || 0)),
      })),
    };
  }

  async create(dto: CreateDispatchNoticeDto, userId: string) {
    const availability = await this.getOrderAvailability(dto.orderId, userId, 'execution.manage');
    const order = availability.order;
    const mode = dto.mode || 'STANDARD';
    if (order.type === 'SALES' && mode === 'STANDARD' && !dto.warehouseId) {
      throw new BadRequestException('销售常规出库必须选择发货仓库');
    }
    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null },
      });
      if (!warehouse) throw new BadRequestException('所选仓库不存在或已停用');
    }
    if (!dto.lineItems.length) throw new BadRequestException('请至少填写一条通知明细');
    const availableMap = new Map(availability.lineItems.map(item => [item.orderLineItemId, item]));
    const seen = new Set<string>();
    const lines = dto.lineItems.map(item => {
      const source = availableMap.get(item.orderLineItemId);
      if (!source || seen.has(item.orderLineItemId)) throw new BadRequestException('通知明细无效或重复');
      seen.add(item.orderLineItemId);
      if (item.quantity <= 0 || item.quantity > source.availableQuantity) {
        throw new BadRequestException(`物料 ${source.materialName || source.materialId} 的通知数量超过剩余可通知数量 ${source.availableQuantity}`);
      }
      return {
        orderLineItemId: item.orderLineItemId,
        materialId: source.materialId,
        materialName: source.materialName,
        quantity: item.quantity,
        unit: source.unit,
      };
    });
    const noticeNo = await this.generateNo(order.type);
    return this.prisma.dispatchNotice.create({
      data: {
        noticeNo,
        orderId: order.id,
        type: order.type,
        mode,
        warehouseId: dto.warehouseId || null,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
        originLocation: dto.originLocation,
        destinationLocation: dto.destinationLocation || order.deliveryLocation,
        totalQuantity: lines.reduce((sum, item) => sum + Number(item.quantity), 0),
        remarks: dto.remarks,
        createdBy: userId,
        lineItems: { create: lines },
      },
      include: this.include,
    });
  }

  async findAll(params: { status?: string; type?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'execution.view');
    const scope = await this.accessControl.getDispatchNoticeScope(userId);
    const where: Prisma.DispatchNoticeWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { noticeNo: { contains: params.search, mode: 'insensitive' } },
        { order: { orderNo: { contains: params.search, mode: 'insensitive' } } },
        { order: { name: { contains: params.search, mode: 'insensitive' } } },
        { order: { contract: { contractNo: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    const items = await this.prisma.dispatchNotice.findMany({
      where, include: this.include, take: 100, orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findOne(id: string, userId: string, permission = 'execution.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getDispatchNoticeScope(userId);
    const notice = await this.prisma.dispatchNotice.findFirst({
      where: { id, deletedAt: null, AND: [scope] }, include: this.include,
    });
    if (!notice) throw new NotFoundException('执行通知不存在');
    return notice;
  }

  async updateStatus(id: string, status: string, userId: string) {
    const notice = await this.findOne(id, userId, 'execution.manage');
    const allowed: Record<string, string[]> = {
      DRAFT: ['ISSUED', 'CANCELLED'],
      ISSUED: ['CANCELLED', 'COMPLETED'],
      IN_PROGRESS: ['COMPLETED'],
    };
    if (!(allowed[notice.status] || []).includes(status)) {
      throw new BadRequestException(`不能从 ${notice.status} 变更为 ${status}`);
    }
    if (status === 'CANCELLED' && notice.waybills.some(item => item.status !== 'CANCELLED')) {
      throw new BadRequestException('已有有效物流运单，不能取消执行通知');
    }
    if (status === 'COMPLETED') {
      const active = notice.waybills.filter(item => item.status !== 'CANCELLED');
      if (!active.length || active.some(item => item.status !== 'SIGNED')) {
        throw new BadRequestException('所有有效物流运单签收后才能完成执行通知');
      }
      const transported = await this.prisma.waybillLineItem.groupBy({
        by: ['dispatchNoticeLineItemId'],
        where: {
          dispatchNoticeLineItem: { dispatchNoticeId: id },
          waybill: { deletedAt: null, status: { not: 'CANCELLED' } },
        },
        _sum: { quantity: true },
      });
      const transportedMap = new Map(transported.map(item => [item.dispatchNoticeLineItemId, Number(item._sum.quantity || 0)]));
      if (notice.lineItems.some(item => (transportedMap.get(item.id) || 0) < Number(item.quantity))) {
        throw new BadRequestException('物流运单累计数量覆盖全部通知数量后才能完成执行通知');
      }
    }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.dispatchNotice.update({
        where: { id },
        data: {
          status,
          issuedAt: status === 'ISSUED' ? new Date() : undefined,
          completedAt: status === 'COMPLETED' ? new Date() : undefined,
        },
        include: this.include,
      });
      if (status === 'ISSUED' && notice.order.status === 'CONFIRMED') {
        await tx.order.update({
          where: { id: notice.orderId },
          data: { status: 'DISPATCHED', dispatchedAt: new Date() },
        });
      }
      if (status === 'COMPLETED') {
        const pending = await tx.dispatchNotice.count({
          where: { orderId: notice.orderId, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        });
        const [orderLines, notified] = await Promise.all([
          tx.orderLineItem.findMany({ where: { orderId: notice.orderId }, select: { id: true, quantity: true } }),
          tx.dispatchNoticeLineItem.groupBy({
            by: ['orderLineItemId'],
            where: { dispatchNotice: { orderId: notice.orderId, deletedAt: null, status: { not: 'CANCELLED' } } },
            _sum: { quantity: true },
          }),
        ]);
        const notifiedMap = new Map(notified.map(item => [item.orderLineItemId, Number(item._sum.quantity || 0)]));
        const fullyCovered = orderLines.every(item => (notifiedMap.get(item.id) || 0) >= Number(item.quantity));
        if (pending === 0 && fullyCovered) {
          await tx.order.update({ where: { id: notice.orderId }, data: { status: 'COMPLETED', completedAt: new Date() } });
        }
      }
      return updated;
    });
  }

  async remove(id: string, userId: string) {
    const notice = await this.findOne(id, userId, 'execution.manage');
    if (!['DRAFT', 'CANCELLED'].includes(notice.status)) {
      throw new BadRequestException('仅草稿或已取消执行通知可以删除');
    }
    return this.prisma.dispatchNotice.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
