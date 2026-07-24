import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryReversalDto } from './dto/create-inventory-reversal.dto';

const ACTIVE_RESERVATION_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'POSTED'];

@Injectable()
export class InventoryReversalService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    creator: { select: { id: true, name: true, role: true } },
    approver: { select: { id: true, name: true } },
    poster: { select: { id: true, name: true } },
    businessInbound: {
      include: {
        receipt: { select: { id: true, receiptNo: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true, unit: true } },
        inventoryLot: true,
      },
    },
    salesOutbound: {
      include: {
        receipt: { select: { id: true, receiptNo: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        material: { select: { id: true, code: true, name: true, unit: true } },
        lines: { include: { inventoryLot: true }, orderBy: { createdAt: 'asc' as const } },
      },
    },
    lines: {
      include: {
        inventoryLot: {
          include: {
            warehouse: { select: { code: true, name: true } },
            material: { select: { code: true, name: true, unit: true } },
          },
        },
        sourceSalesOutboundLine: true,
      },
      orderBy: { createdAt: 'asc' as const },
    },
    attachments: { orderBy: { createdAt: 'desc' as const } },
  };

  private async generateNo(type: string) {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.inventoryReversal.count({
      where: { type, createdAt: { gte: start, lt: end } },
    });
    return `${type === 'INBOUND' ? 'IRV' : 'ORV'}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async eligibleSources(type: string, search?: string) {
    if (type === 'INBOUND') {
      const items = await this.prisma.businessInbound.findMany({
        where: {
          status: { in: ['POSTED', 'PARTIALLY_REVERSED'] },
          ...(search ? {
            OR: [
              { inboundNo: { contains: search, mode: 'insensitive' as const } },
              { materialName: { contains: search, mode: 'insensitive' as const } },
              { supplierName: { contains: search, mode: 'insensitive' as const } },
              { receipt: { receiptNo: { contains: search, mode: 'insensitive' as const } } },
            ],
          } : {}),
        },
        include: {
          receipt: { select: { receiptNo: true } },
          warehouse: { select: { code: true, name: true } },
          material: { select: { code: true, name: true, unit: true } },
          inventoryLot: true,
          reversals: {
            where: { status: { in: ACTIVE_RESERVATION_STATUSES } },
            include: { lines: true },
          },
        },
        orderBy: { postedAt: 'desc' },
        take: 100,
      });
      return items.map((item) => {
        const requested = item.reversals.flatMap(reversal => reversal.lines)
          .reduce((sum, line) => sum + Number(line.quantity), 0);
        const sourceRemaining = Math.max(0, Number(item.quantity) - requested);
        const available = Number(item.inventoryLot?.availableQuantity || 0);
        return {
          ...item,
          reversedOrReservedQuantity: requested,
          reversibleQuantity: Math.min(sourceRemaining, available),
        };
      }).filter(item => item.reversibleQuantity > 0);
    }

    if (type === 'OUTBOUND') {
      const items = await this.prisma.salesOutbound.findMany({
        where: {
          status: { in: ['POSTED', 'PARTIALLY_REVERSED'] },
          ...(search ? {
            OR: [
              { outboundNo: { contains: search, mode: 'insensitive' as const } },
              { materialName: { contains: search, mode: 'insensitive' as const } },
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { receipt: { receiptNo: { contains: search, mode: 'insensitive' as const } } },
            ],
          } : {}),
        },
        include: {
          receipt: { select: { receiptNo: true } },
          warehouse: { select: { code: true, name: true } },
          material: { select: { code: true, name: true, unit: true } },
          lines: { include: { inventoryLot: true }, orderBy: { createdAt: 'asc' } },
          reversals: {
            where: { status: { in: ACTIVE_RESERVATION_STATUSES } },
            include: { lines: true },
          },
        },
        orderBy: { postedAt: 'desc' },
        take: 100,
      });
      return items.map((item) => {
        const reservedBySourceLine = new Map<string, number>();
        for (const line of item.reversals.flatMap(reversal => reversal.lines)) {
          if (!line.sourceSalesOutboundLineId) continue;
          reservedBySourceLine.set(
            line.sourceSalesOutboundLineId,
            (reservedBySourceLine.get(line.sourceSalesOutboundLineId) || 0) + Number(line.quantity),
          );
        }
        const lines = item.lines.map(line => ({
          ...line,
          reversedOrReservedQuantity: reservedBySourceLine.get(line.id) || 0,
          reversibleQuantity: Math.max(0, Number(line.quantity) - (reservedBySourceLine.get(line.id) || 0)),
        }));
        return {
          ...item,
          lines,
          reversibleQuantity: lines.reduce((sum, line) => sum + line.reversibleQuantity, 0),
        };
      }).filter(item => item.reversibleQuantity > 0);
    }

    throw new BadRequestException('冲销类型无效');
  }

  async create(dto: CreateInventoryReversalDto, userId: string) {
    if (!dto.reason.trim()) throw new BadRequestException('请填写冲销原因');
    const seenLots = new Set<string>();
    if (dto.lines.some(line => seenLots.has(line.inventoryLotId) || !seenLots.add(line.inventoryLotId))) {
      throw new BadRequestException('同一库存批次不能重复');
    }

    if (dto.type === 'INBOUND') {
      const source = await this.prisma.businessInbound.findFirst({
        where: { id: dto.sourceId, status: { in: ['POSTED', 'PARTIALLY_REVERSED'] } },
        include: { inventoryLot: true },
      });
      if (!source || !source.inventoryLot) throw new NotFoundException('可冲销业务入库单不存在');
      if (dto.lines.length !== 1 || dto.lines[0].inventoryLotId !== source.inventoryLot.id) {
        throw new BadRequestException('入库冲销必须使用原业务入库库存批次');
      }
      const reserved = await this.reservedForInbound(source.id);
      const maximum = Math.min(
        Number(source.quantity) - reserved,
        Number(source.inventoryLot.availableQuantity),
      );
      const quantity = Number(dto.lines[0].quantity);
      if (quantity <= 0 || quantity > maximum + 0.0005) {
        throw new BadRequestException(`本次最多可冲销 ${Math.max(0, maximum)} 吨`);
      }
      return this.prisma.inventoryReversal.create({
        data: {
          reversalNo: await this.generateNo('INBOUND'),
          type: 'INBOUND',
          businessInboundId: source.id,
          reason: dto.reason.trim(),
          remarks: dto.remarks?.trim() || null,
          createdBy: userId,
          lines: {
            create: [{
              inventoryLotId: source.inventoryLot.id,
              sourceQuantity: source.quantity,
              quantity,
            }],
          },
        },
        include: this.include,
      });
    }

    if (dto.type === 'OUTBOUND') {
      const source = await this.prisma.salesOutbound.findFirst({
        where: { id: dto.sourceId, status: { in: ['POSTED', 'PARTIALLY_REVERSED'] } },
        include: { lines: true },
      });
      if (!source) throw new NotFoundException('可冲销销售出库单不存在');
      const sourceMap = new Map(source.lines.map(line => [line.id, line]));
      const createLines = [];
      for (const line of dto.lines) {
        if (!line.sourceSalesOutboundLineId) throw new BadRequestException('出库冲销必须关联原销售出库明细');
        const sourceLine = sourceMap.get(line.sourceSalesOutboundLineId);
        if (!sourceLine || sourceLine.inventoryLotId !== line.inventoryLotId) {
          throw new BadRequestException('出库冲销批次与原销售出库明细不一致');
        }
        const reserved = await this.reservedForSalesLine(sourceLine.id);
        const maximum = Number(sourceLine.quantity) - reserved;
        const quantity = Number(line.quantity);
        if (quantity <= 0 || quantity > maximum + 0.0005) {
          throw new BadRequestException(`批次本次最多可冲销 ${Math.max(0, maximum)} 吨`);
        }
        createLines.push({
          inventoryLotId: line.inventoryLotId,
          sourceSalesOutboundLineId: sourceLine.id,
          sourceQuantity: sourceLine.quantity,
          quantity,
        });
      }
      return this.prisma.inventoryReversal.create({
        data: {
          reversalNo: await this.generateNo('OUTBOUND'),
          type: 'OUTBOUND',
          salesOutboundId: source.id,
          reason: dto.reason.trim(),
          remarks: dto.remarks?.trim() || null,
          createdBy: userId,
          lines: { create: createLines },
        },
        include: this.include,
      });
    }

    throw new BadRequestException('冲销类型无效');
  }

  async findAll(params: { search?: string; status?: string; type?: string }) {
    const where: Prisma.InventoryReversalWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { reversalNo: { contains: params.search, mode: 'insensitive' } },
        { reason: { contains: params.search, mode: 'insensitive' } },
        { businessInbound: { inboundNo: { contains: params.search, mode: 'insensitive' } } },
        { salesOutbound: { outboundNo: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    const items = await this.prisma.inventoryReversal.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findOne(id: string) {
    const item = await this.prisma.inventoryReversal.findUnique({
      where: { id },
      include: this.include,
    });
    if (!item) throw new NotFoundException('库存冲销单不存在');
    return item;
  }

  async submit(id: string) {
    const item = await this.findOne(id);
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿冲销单可以提交审批');
    await this.validateCapacity(item, true);
    return this.prisma.inventoryReversal.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
      include: this.include,
    });
  }

  async review(id: string, action: string, comment: string | undefined, userId: string) {
    const item = await this.findOne(id);
    if (item.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批冲销单可以审核');
    await this.assertReviewer(userId);
    if (action === 'REJECT') {
      if (!comment?.trim()) throw new BadRequestException('驳回时必须填写原因');
      return this.prisma.inventoryReversal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedBy: userId,
          approvedAt: new Date(),
          rejectedReason: comment.trim(),
        },
        include: this.include,
      });
    }
    if (action !== 'APPROVE') throw new BadRequestException('审核操作无效');
    await this.validateCapacity(item, true);
    return this.prisma.inventoryReversal.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        approvalComment: comment?.trim() || null,
      },
      include: this.include,
    });
  }

  async cancel(id: string) {
    const item = await this.findOne(id);
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿冲销单可以取消');
    return this.prisma.inventoryReversal.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.include,
    });
  }

  async post(id: string, userId: string) {
    const item = await this.findOne(id);
    if (item.status !== 'APPROVED') throw new BadRequestException('审批通过后才能过账');

    await this.prisma.$transaction(async tx => {
      if (item.type === 'INBOUND') {
        if (!item.businessInbound) throw new BadRequestException('原业务入库单不存在');
        const alreadyPosted = await tx.inventoryReversalLine.aggregate({
          where: {
            reversalId: { not: item.id },
            reversal: { businessInboundId: item.businessInbound.id, status: 'POSTED' },
          },
          _sum: { quantity: true },
        });
        const current = item.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
        if (Number(alreadyPosted._sum.quantity || 0) + current > Number(item.businessInbound.quantity) + 0.0005) {
          throw new BadRequestException('累计冲销数量超过原业务入库数量');
        }
        for (const line of item.lines) {
          const quantity = Number(line.quantity);
          const updated = await tx.inventoryLot.updateMany({
            where: {
              id: line.inventoryLotId,
              availableQuantity: { gte: quantity },
              initialQuantity: { gte: quantity },
            },
            data: {
              availableQuantity: { decrement: quantity },
              initialQuantity: { decrement: quantity },
            },
          });
          if (updated.count !== 1) throw new BadRequestException(`批次 ${line.inventoryLot.lotNo} 当前可用库存不足`);
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: line.inventoryLotId } });
          const balanceAfter = Number(lot.availableQuantity);
          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { status: balanceAfter <= 0 ? 'DEPLETED' : 'AVAILABLE' },
          });
          await tx.inventoryReversalLine.update({ where: { id: line.id }, data: { balanceAfter } });
          await tx.inventoryLedger.create({
            data: {
              lotId: lot.id,
              warehouseId: lot.warehouseId,
              materialId: lot.materialId,
              businessType: 'INBOUND_REVERSAL',
              businessNo: item.reversalNo,
              quantityChange: -quantity,
              balanceAfter,
              remarks: `冲销业务入库单 ${item.businessInbound.inboundNo}：${item.reason}`,
              createdBy: userId,
            },
          });
        }
        const total = Number(alreadyPosted._sum.quantity || 0) + current;
        await tx.businessInbound.update({
          where: { id: item.businessInbound.id },
          data: {
            status: total >= Number(item.businessInbound.quantity) - 0.0005
              ? 'REVERSED'
              : 'PARTIALLY_REVERSED',
          },
        });
      } else {
        if (!item.salesOutbound) throw new BadRequestException('原销售出库单不存在');
        const currentBySourceLine = new Map<string, number>();
        for (const line of item.lines) {
          if (!line.sourceSalesOutboundLineId) throw new BadRequestException('原销售出库明细不存在');
          const posted = await tx.inventoryReversalLine.aggregate({
            where: {
              reversalId: { not: item.id },
              sourceSalesOutboundLineId: line.sourceSalesOutboundLineId,
              reversal: { status: 'POSTED' },
            },
            _sum: { quantity: true },
          });
          const quantity = Number(line.quantity);
          if (Number(posted._sum.quantity || 0) + quantity > Number(line.sourceQuantity) + 0.0005) {
            throw new BadRequestException(`批次 ${line.inventoryLot.lotNo} 累计冲销数量超过原出库数量`);
          }
          await tx.inventoryLot.update({
            where: { id: line.inventoryLotId },
            data: {
              availableQuantity: { increment: quantity },
              status: 'AVAILABLE',
            },
          });
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: line.inventoryLotId } });
          const balanceAfter = Number(lot.availableQuantity);
          await tx.inventoryReversalLine.update({ where: { id: line.id }, data: { balanceAfter } });
          await tx.inventoryLedger.create({
            data: {
              lotId: lot.id,
              warehouseId: lot.warehouseId,
              materialId: lot.materialId,
              businessType: 'OUTBOUND_REVERSAL',
              businessNo: item.reversalNo,
              quantityChange: quantity,
              balanceAfter,
              remarks: `冲销销售出库单 ${item.salesOutbound.outboundNo}：${item.reason}`,
              createdBy: userId,
            },
          });
          currentBySourceLine.set(line.sourceSalesOutboundLineId, quantity);
        }
        let fullyReversed = true;
        for (const sourceLine of item.salesOutbound.lines) {
          const posted = await tx.inventoryReversalLine.aggregate({
            where: {
              sourceSalesOutboundLineId: sourceLine.id,
              reversal: { status: 'POSTED' },
            },
            _sum: { quantity: true },
          });
          const total = Number(posted._sum.quantity || 0) + (currentBySourceLine.get(sourceLine.id) || 0);
          if (total < Number(sourceLine.quantity) - 0.0005) fullyReversed = false;
        }
        await tx.salesOutbound.update({
          where: { id: item.salesOutbound.id },
          data: { status: fullyReversed ? 'REVERSED' : 'PARTIALLY_REVERSED' },
        });
      }
      await tx.inventoryReversal.update({
        where: { id: item.id },
        data: { status: 'POSTED', postedBy: userId, postedAt: new Date() },
      });
    });
    return this.findOne(id);
  }

  async createAttachment(data: {
    inventoryReversalId: string; fileName: string; originalName: string;
    mimeType: string; size: number; category: string;
  }) {
    const item = await this.findOne(data.inventoryReversalId);
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿冲销单可以上传附件');
    return this.prisma.attachment.create({ data });
  }

  findAttachmentById(id: string) {
    return this.prisma.attachment.findFirst({
      where: { id, inventoryReversalId: { not: null } },
      include: { inventoryReversal: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string) {
    const attachment = await this.findAttachmentById(id);
    if (!attachment) return null;
    if (attachment.inventoryReversal?.status !== 'DRAFT') {
      throw new BadRequestException('只有草稿冲销单可以删除附件');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  private async reservedForInbound(businessInboundId: string, excludingId?: string) {
    const result = await this.prisma.inventoryReversalLine.aggregate({
      where: {
        ...(excludingId ? { reversalId: { not: excludingId } } : {}),
        reversal: {
          businessInboundId,
          status: { in: ACTIVE_RESERVATION_STATUSES },
        },
      },
      _sum: { quantity: true },
    });
    return Number(result._sum.quantity || 0);
  }

  private async reservedForSalesLine(sourceLineId: string, excludingId?: string) {
    const result = await this.prisma.inventoryReversalLine.aggregate({
      where: {
        ...(excludingId ? { reversalId: { not: excludingId } } : {}),
        sourceSalesOutboundLineId: sourceLineId,
        reversal: { status: { in: ACTIVE_RESERVATION_STATUSES } },
      },
      _sum: { quantity: true },
    });
    return Number(result._sum.quantity || 0);
  }

  private async validateCapacity(item: any, excludeCurrent: boolean) {
    if (item.type === 'INBOUND') {
      if (!item.businessInbound?.inventoryLot) throw new BadRequestException('原业务入库库存批次不存在');
      const reserved = await this.reservedForInbound(
        item.businessInbound.id,
        excludeCurrent ? item.id : undefined,
      );
      const quantity = item.lines.reduce((sum: number, line: any) => sum + Number(line.quantity), 0);
      const maximum = Math.min(
        Number(item.businessInbound.quantity) - reserved,
        Number(item.businessInbound.inventoryLot.availableQuantity),
      );
      if (quantity > maximum + 0.0005) throw new BadRequestException(`当前最多可冲销 ${Math.max(0, maximum)} 吨`);
      return;
    }
    for (const line of item.lines) {
      if (!line.sourceSalesOutboundLineId) throw new BadRequestException('原销售出库明细不存在');
      const reserved = await this.reservedForSalesLine(
        line.sourceSalesOutboundLineId,
        excludeCurrent ? item.id : undefined,
      );
      const maximum = Number(line.sourceQuantity) - reserved;
      if (Number(line.quantity) > maximum + 0.0005) {
        throw new BadRequestException(`批次 ${line.inventoryLot.lotNo} 当前最多可冲销 ${Math.max(0, maximum)} 吨`);
      }
    }
  }

  private async assertReviewer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !['ADMIN', 'APPROVER'].includes(user.role)) {
      throw new ForbiddenException('仅系统管理员或审批人可以审核库存冲销');
    }
  }
}
