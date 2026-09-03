import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateOrderDto } from './dto/create-order.dto';

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    contract: {
      select: {
        id: true,
        contractNo: true,
        title: true,
        type: true,
        status: true,
        signingPartner: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
      },
    },
    creator: { select: { id: true, name: true, username: true } },
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    dispatchNotices: {
      where: { deletedAt: null },
      select: {
        id: true, noticeNo: true, type: true, status: true, totalQuantity: true, plannedDate: true,
        _count: { select: { waybills: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private async generateOrderNo(type: string) {
    const prefix = type === 'PURCHASE' ? 'CGDD' : 'XSDD';
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.order.count({
      where: { type, createdAt: { gte: start, lt: end } },
    });
    return `${prefix}${date}${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateOrderDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'execution.manage');
    const scope = await this.accessControl.getContractScope(userId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('请填写执行批次名称');
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null, AND: [scope] },
      include: { lineItems: true },
    });
    if (!contract) throw new NotFoundException('合同不存在');
    if (!['APPROVED', 'EXECUTING'].includes(contract.status)) {
      throw new BadRequestException('仅已通过或执行中的合同可以建立执行批次');
    }
    if (contract.type !== 'BILATERAL' && contract.type !== dto.type) {
      throw new BadRequestException('执行批次方向必须与合同类型一致');
    }
    if (!dto.lineItems.length) throw new BadRequestException('请至少选择一个合同行项');

    const orderedLines = await this.prisma.orderLineItem.groupBy({
      by: ['contractLineItemId'],
      where: {
        order: {
          contractId: contract.id,
          type: dto.type,
          deletedAt: null,
          status: { not: 'CANCELLED' },
        },
      },
      _sum: { quantity: true },
    });
    const orderedQuantity = new Map(
      orderedLines.map((item) => [item.contractLineItemId, Number(item._sum.quantity || 0)]),
    );
    const contractLines = new Map(contract.lineItems.map((item) => [item.id, item]));
    const duplicateIds = new Set<string>();
    const lines = dto.lineItems.map((item) => {
      if (duplicateIds.has(item.contractLineItemId)) throw new BadRequestException('批次明细不能重复选择同一合同明细');
      duplicateIds.add(item.contractLineItemId);
      const source = contractLines.get(item.contractLineItemId);
      if (!source) throw new BadRequestException('批次明细不属于所选合同');
      const remaining = Number(source.quantity) - (orderedQuantity.get(source.id) || 0);
      if (Number(item.quantity) > remaining) {
        throw new BadRequestException(`物料 ${source.materialName || source.materialId} 的本批次数量超过合同剩余可执行数量 ${remaining}`);
      }
      const unitPrice = contract.type === 'BILATERAL' && dto.type === 'SALES'
        ? source.salesUnitPrice
        : source.unitPrice;
      if (unitPrice === null || unitPrice === undefined) {
        throw new BadRequestException(`物料 ${source.materialName || source.materialId} 缺少${dto.type === 'SALES' ? '销售' : '采购'}单价`);
      }
      return {
        contractLineItemId: source.id,
        materialId: source.materialId,
        materialName: source.materialName,
        quantity: item.quantity,
        unit: source.unit,
        unitPrice,
        totalPrice: Number(item.quantity) * Number(unitPrice),
      };
    });
    const orderNo = await this.generateOrderNo(dto.type);
    const totalAmount = lines.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo,
          name,
          contractId: contract.id,
          type: dto.type,
          totalAmount,
          plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
          deliveryLocation: dto.deliveryLocation,
          remarks: dto.remarks,
          createdBy: userId,
          lineItems: { create: lines },
        },
        include: this.include,
      });
      if (contract.status === 'APPROVED') {
        await tx.contract.update({ where: { id: contract.id }, data: { status: 'EXECUTING' } });
      }
      return order;
    });
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; type?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'execution.view');
    const scope = await this.accessControl.getOrderScope(userId);
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 20, 100);
    const where: Prisma.OrderWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { orderNo: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { contract: { contractNo: { contains: params.search, mode: 'insensitive' } } },
        { contract: { title: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: this.include,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getContractAvailability(contractId: string, type: string, userId: string, excludeOrderId?: string) {
    await this.accessControl.assertPermission(userId, 'execution.view');
    const scope = await this.accessControl.getContractScope(userId);
    if (!['PURCHASE', 'SALES'].includes(type)) throw new BadRequestException('执行批次类型无效');
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null, AND: [scope] },
      include: { lineItems: { orderBy: { createdAt: 'asc' } } },
    });
    if (!contract) throw new NotFoundException('合同不存在');
    if (!['APPROVED', 'EXECUTING'].includes(contract.status)) {
      throw new BadRequestException('仅已通过或执行中的合同可以建立执行批次');
    }
    if (contract.type !== 'BILATERAL' && contract.type !== type) {
      throw new BadRequestException('执行批次方向必须与合同类型一致');
    }
    const orderedLines = await this.prisma.orderLineItem.groupBy({
      by: ['contractLineItemId'],
      where: {
        ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
        order: {
          contractId,
          type,
          deletedAt: null,
          status: { not: 'CANCELLED' },
        },
      },
      _sum: { quantity: true },
    });
    const ordered = new Map(
      orderedLines.map((item) => [item.contractLineItemId, Number(item._sum.quantity || 0)]),
    );
    return {
      contractId,
      type,
      lineItems: contract.lineItems.map((item) => {
        const orderedQuantity = ordered.get(item.id) || 0;
        return {
          contractLineItemId: item.id,
          contractQuantity: Number(item.quantity),
          orderedQuantity,
          availableQuantity: Math.max(0, Number(item.quantity) - orderedQuantity),
        };
      }),
    };
  }

  async findOne(id: string, userId: string, permission = 'execution.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getOrderScope(userId);
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!order) throw new NotFoundException('执行批次不存在');
    return order;
  }

  async update(id: string, data: {
    name?: string;
    plannedDate?: string;
    deliveryLocation?: string;
    remarks?: string;
    lineItems?: Array<{ contractLineItemId: string; quantity: number }>;
  }, userId: string) {
    const order = await this.findOne(id, userId, 'execution.manage');
    if (order.status !== 'DRAFT') throw new BadRequestException('仅草稿执行批次可以修改');
    const name = data.name === undefined ? undefined : data.name.trim();
    if (data.name !== undefined && !name) throw new BadRequestException('请填写执行批次名称');
    if (name && name.length > 100) throw new BadRequestException('执行批次名称不能超过 100 个字符');
    const lines = data.lineItems;
    if (lines) {
      if (!lines.length) throw new BadRequestException('请至少保留一条批次明细');
      const contract = await this.prisma.contract.findUnique({
        where: { id: order.contractId },
        include: { lineItems: true },
      });
      const orderedLines = await this.prisma.orderLineItem.groupBy({
        by: ['contractLineItemId'],
        where: {
          orderId: { not: id },
          order: {
            contractId: order.contractId,
            type: order.type,
            deletedAt: null,
            status: { not: 'CANCELLED' },
          },
        },
        _sum: { quantity: true },
      });
      const orderedQuantity = new Map(
        orderedLines.map((item) => [item.contractLineItemId, Number(item._sum.quantity || 0)]),
      );
      const sources = new Map(contract?.lineItems.map((item) => [item.id, item]) || []);
      const seen = new Set<string>();
      const prepared = lines.map((item) => {
        if (seen.has(item.contractLineItemId)) throw new BadRequestException('批次明细不能重复');
        seen.add(item.contractLineItemId);
        const source = sources.get(item.contractLineItemId);
        const remaining = source
          ? Number(source.quantity) - (orderedQuantity.get(source.id) || 0)
          : 0;
        if (!source || item.quantity <= 0 || item.quantity > remaining) {
          throw new BadRequestException('批次明细数量无效或超过合同剩余可执行数量');
        }
        const unitPrice = contract?.type === 'BILATERAL' && order.type === 'SALES'
          ? source.salesUnitPrice
          : source.unitPrice;
        if (unitPrice === null || unitPrice === undefined) {
          throw new BadRequestException(`物料 ${source.materialName || source.materialId} 缺少${order.type === 'SALES' ? '销售' : '采购'}单价`);
        }
        return {
          contractLineItemId: source.id,
          materialId: source.materialId,
          materialName: source.materialName,
          quantity: item.quantity,
          unit: source.unit,
          unitPrice,
          totalPrice: Number(item.quantity) * Number(unitPrice),
        };
      });
      return this.prisma.$transaction(async (tx) => {
        await tx.orderLineItem.deleteMany({ where: { orderId: id } });
        await tx.orderLineItem.createMany({ data: prepared.map((item) => ({ orderId: id, ...item })) });
        return tx.order.update({
          where: { id },
          data: {
            name,
            plannedDate: data.plannedDate ? new Date(data.plannedDate) : undefined,
            deliveryLocation: data.deliveryLocation,
            remarks: data.remarks,
            totalAmount: prepared.reduce((sum, item) => sum + Number(item.totalPrice), 0),
          },
          include: this.include,
        });
      });
    }
    return this.prisma.order.update({
      where: { id },
      data: {
        name,
        plannedDate: data.plannedDate ? new Date(data.plannedDate) : undefined,
        deliveryLocation: data.deliveryLocation,
        remarks: data.remarks,
      },
      include: this.include,
    });
  }

  async updateStatus(id: string, status: string, userId: string) {
    const order = await this.findOne(id, userId, 'execution.manage');
    if (!(TRANSITIONS[order.status] || []).includes(status)) {
      throw new BadRequestException(`不能从 ${order.status} 变更为 ${status}`);
    }
    return this.prisma.order.update({
      where: { id },
      data: {
        status,
        dispatchedAt: status === 'DISPATCHED' ? new Date() : undefined,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
      include: this.include,
    });
  }

  async remove(id: string, userId: string) {
    const order = await this.findOne(id, userId, 'execution.manage');
    if (!['DRAFT', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('仅草稿或已取消执行批次可以删除');
    }
    return this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
