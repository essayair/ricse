import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateOutboundReceiptDto } from './dto/create-outbound-receipt.dto';

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    warehouse: { select: { id: true, code: true, name: true } },
    material: { select: { id: true, code: true, name: true, unit: true } },
    creator: { select: { id: true, name: true } },
    weighTicket: {
      select: {
        id: true, ticketNo: true, direction: true, settlementBasis: true,
        settlementWeight: true, netWeight: true,
      },
    },
    waybill: {
      include: {
        lineItems: { orderBy: { createdAt: 'asc' as const } },
        dispatchNotice: {
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
            order: {
              include: {
                contract: { select: { id: true, contractNo: true, title: true } },
              },
            },
          },
        },
      },
    },
    allocations: {
      include: {
        inventoryLot: {
          include: {
            businessInbound: { select: { inboundNo: true, postedAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' as const },
    },
    attachments: { orderBy: { createdAt: 'desc' as const } },
    salesOutbound: {
      include: {
        lines: {
          include: { inventoryLot: { select: { lotNo: true } } },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    },
  };

  private async nextNo(prefix: string, model: 'outboundReceipt' | 'salesOutbound') {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = model === 'outboundReceipt'
      ? await this.prisma.outboundReceipt.count({ where: { createdAt: { gte: start, lt: end } } })
      : await this.prisma.salesOutbound.count({ where: { createdAt: { gte: start, lt: end } } });
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async eligibleWaybills(userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getWaybillScope(userId);
    return this.prisma.waybill.findMany({
      where: {
        deletedAt: null,
        AND: [scope],
        status: 'PENDING',
        dispatchNotice: {
          type: 'SALES',
          mode: 'STANDARD',
          warehouseId: { not: null },
        },
        outboundReceipts: {
          none: { deletedAt: null, status: { not: 'CANCELLED' } },
        },
        weighTickets: {
          some: {
            deletedAt: null,
            status: 'REVIEWED',
            direction: 'OUTBOUND',
            settlementWeight: { gt: 0 },
          },
        },
      },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: {
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
            order: {
              include: {
                contract: { select: { contractNo: true, title: true } },
              },
            },
          },
        },
        weighTickets: {
          where: {
            deletedAt: null,
            status: 'REVIEWED',
            direction: 'OUTBOUND',
            settlementWeight: { gt: 0 },
          },
          orderBy: { reviewedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async eligibleLots(waybillId: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const waybillScope = await this.accessControl.getWaybillScope(userId);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null, AND: [waybillScope] },
      include: { lineItems: true, dispatchNotice: true },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    if (waybill.dispatchNotice.type !== 'SALES' || waybill.dispatchNotice.mode !== 'STANDARD') {
      throw new BadRequestException('只有销售常规出库运单可以选择库存批次');
    }
    if (!waybill.dispatchNotice.warehouseId) throw new BadRequestException('销售发货通知单缺少发货仓库');
    const materialIds = [...new Set(waybill.lineItems.map(item => item.materialId))];
    if (materialIds.length !== 1) throw new BadRequestException('首版销售出库只支持单一物料运单');
    const lotScope = await this.accessControl.getInventoryLotScope(userId);
    return this.prisma.inventoryLot.findMany({
      where: {
        AND: [lotScope],
        warehouseId: waybill.dispatchNotice.warehouseId,
        materialId: materialIds[0],
        status: 'AVAILABLE',
        availableQuantity: { gt: 0 },
      },
      include: {
        warehouse: { select: { code: true, name: true } },
        material: { select: { code: true, name: true, unit: true } },
        businessInbound: { select: { inboundNo: true, postedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateOutboundReceiptDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.manage');
    const scope = await this.accessControl.getWaybillScope(userId);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, deletedAt: null, AND: [scope] },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        outboundReceipts: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          select: { receiptNo: true },
        },
        dispatchNotice: {
          include: {
            warehouse: true,
            order: { include: { contract: true } },
          },
        },
      },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    if (waybill.dispatchNotice.type !== 'SALES') throw new BadRequestException('只有销售物流运单可以创建物流出库单');
    if (waybill.dispatchNotice.mode !== 'STANDARD') throw new BadRequestException('直拨业务将在后续直拨闭环中处理');
    if (waybill.status !== 'PENDING') throw new BadRequestException('物流运单发运前才能创建物流出库单');
    if (!waybill.dispatchNotice.warehouseId || !waybill.dispatchNotice.warehouse) {
      throw new BadRequestException('销售发货通知单缺少有效发货仓库');
    }
    if (waybill.outboundReceipts.length) {
      throw new BadRequestException(`该运单已存在物流出库单 ${waybill.outboundReceipts[0].receiptNo}`);
    }
    const materialIds = [...new Set(waybill.lineItems.map(item => item.materialId))];
    if (materialIds.length !== 1) throw new BadRequestException('首版销售出库只支持单一物料运单');
    const materialId = materialIds[0];
    const line = waybill.lineItems[0];
    if (!line) throw new BadRequestException('物流运单缺少物料明细');

    const ticket = await this.prisma.weighTicket.findFirst({
      where: {
        id: dto.weighTicketId,
        waybillId: waybill.id,
        deletedAt: null,
        status: 'REVIEWED',
        direction: 'OUTBOUND',
      },
    });
    if (!ticket) throw new BadRequestException('请选择该运单已复核的出库磅单');
    const quantity = Number(ticket.settlementWeight);
    if (quantity <= 0) throw new BadRequestException('出库磅单结算重量必须大于 0');
    if (!dto.operatorName.trim()) throw new BadRequestException('请填写出库操作人');

    const allocationMap = new Map<string, number>();
    for (const allocation of dto.allocations) {
      if (allocationMap.has(allocation.inventoryLotId)) throw new BadRequestException('库存批次不能重复选择');
      allocationMap.set(allocation.inventoryLotId, Number(allocation.quantity));
    }
    const allocated = [...allocationMap.values()].reduce((sum, item) => sum + item, 0);
    if (Math.abs(allocated - quantity) > 0.0005) {
      throw new BadRequestException(`批次分配数量 ${allocated} 吨必须等于出库重量 ${quantity} 吨`);
    }
    const lotScope = await this.accessControl.getInventoryLotScope(userId);
    const lots = await this.prisma.inventoryLot.findMany({
      where: { id: { in: [...allocationMap.keys()] }, AND: [lotScope] },
    });
    if (lots.length !== allocationMap.size) throw new BadRequestException('选择的库存批次不存在');
    for (const lot of lots) {
      const allocation = allocationMap.get(lot.id)!;
      if (lot.warehouseId !== waybill.dispatchNotice.warehouseId || lot.materialId !== materialId) {
        throw new BadRequestException(`库存批次 ${lot.lotNo} 与发货仓库或物料不一致`);
      }
      if (lot.status !== 'AVAILABLE' || Number(lot.availableQuantity) < allocation) {
        throw new BadRequestException(`库存批次 ${lot.lotNo} 可用数量不足`);
      }
    }

    return this.prisma.outboundReceipt.create({
      data: {
        receiptNo: await this.nextNo('LOR', 'outboundReceipt'),
        waybillId: waybill.id,
        weighTicketId: ticket.id,
        warehouseId: waybill.dispatchNotice.warehouseId,
        materialId,
        materialName: line.materialName || ticket.materialName || materialId,
        customerName: ticket.receiverName,
        plateNo: ticket.plateNo || waybill.plateNo,
        outboundQuantity: quantity,
        departedAt: new Date(dto.departedAt),
        operatorName: dto.operatorName.trim(),
        remarks: dto.remarks?.trim() || null,
        createdBy: userId,
        allocations: {
          create: [...allocationMap].map(([inventoryLotId, allocationQuantity]) => ({
            inventoryLotId,
            quantity: allocationQuantity,
          })),
        },
      },
      include: this.include,
    });
  }

  async findAll(params: { search?: string; status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getOutboundReceiptScope(userId);
    const where: Prisma.OutboundReceiptWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { receiptNo: { contains: params.search, mode: 'insensitive' } },
        { materialName: { contains: params.search, mode: 'insensitive' } },
        { customerName: { contains: params.search, mode: 'insensitive' } },
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { waybill: { waybillNo: { contains: params.search, mode: 'insensitive' } } },
        { weighTicket: { ticketNo: { contains: params.search, mode: 'insensitive' } } },
      ];
    }
    const items = await this.prisma.outboundReceipt.findMany({
      where,
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findOne(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getOutboundReceiptScope(userId);
    const receipt = await this.prisma.outboundReceipt.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!receipt) throw new NotFoundException('物流出库单不存在');
    return receipt;
  }

  async confirm(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (receipt.status !== 'DRAFT') throw new BadRequestException('只有草稿物流出库单可以确认离场');
    return this.prisma.outboundReceipt.update({
      where: { id },
      data: { status: 'DEPARTURE_CONFIRMED' },
      include: this.include,
    });
  }

  async cancel(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (receipt.status !== 'DRAFT') throw new BadRequestException('只有草稿物流出库单可以作废');
    return this.prisma.outboundReceipt.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.include,
    });
  }

  async post(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (receipt.status !== 'DEPARTURE_CONFIRMED') throw new BadRequestException('确认货物离场后才能生成销售出库单');
    if (receipt.salesOutbound) throw new BadRequestException('该物流出库单已生成销售出库单');
    if (receipt.waybill.status !== 'PENDING') throw new BadRequestException('物流运单已发运或已取消，不能扣减库存');
    const outboundNo = await this.nextNo('SOUT', 'salesOutbound');

    await this.prisma.$transaction(async tx => {
      const outbound = await tx.salesOutbound.create({
        data: {
          outboundNo,
          receiptId: receipt.id,
          warehouseId: receipt.warehouseId,
          materialId: receipt.materialId,
          materialName: receipt.materialName,
          customerName: receipt.customerName,
          quantity: receipt.outboundQuantity,
          createdBy: userId,
        },
      });
      for (const allocation of receipt.allocations) {
        const quantity = Number(allocation.quantity);
        const updated = await tx.inventoryLot.updateMany({
          where: {
            id: allocation.inventoryLotId,
            warehouseId: receipt.warehouseId,
            materialId: receipt.materialId,
            status: 'AVAILABLE',
            availableQuantity: { gte: quantity },
          },
          data: { availableQuantity: { decrement: quantity } },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(`库存批次 ${allocation.inventoryLot.lotNo} 可用数量不足，出库已取消`);
        }
        const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: allocation.inventoryLotId } });
        const balanceAfter = Number(lot.availableQuantity);
        if (balanceAfter <= 0) {
          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { status: 'DEPLETED' },
          });
        }
        await tx.salesOutboundLine.create({
          data: {
            salesOutboundId: outbound.id,
            inventoryLotId: lot.id,
            quantity,
            balanceAfter,
          },
        });
        await tx.inventoryLedger.create({
          data: {
            lotId: lot.id,
            warehouseId: receipt.warehouseId,
            materialId: receipt.materialId,
            businessType: 'OUTBOUND',
            businessNo: outboundNo,
            quantityChange: -quantity,
            balanceAfter,
            remarks: `由物流出库单 ${receipt.receiptNo} 生成`,
            createdBy: userId,
          },
        });
      }
      await tx.outboundReceipt.update({
        where: { id: receipt.id },
        data: { status: 'POSTED' },
      });
    });
    return this.findOne(id, userId, 'inventory.manage');
  }

  async createAttachment(data: {
    outboundReceiptId: string; fileName: string; originalName: string;
    mimeType: string; size: number; category: string;
  }, userId: string) {
    const receipt = await this.findOne(data.outboundReceiptId, userId, 'inventory.manage');
    if (receipt.status !== 'DRAFT') throw new BadRequestException('只有草稿物流出库单可以上传附件');
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getOutboundReceiptScope(userId);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        outboundReceiptId: { not: null },
        outboundReceipt: { deletedAt: null, AND: [scope] },
      },
      include: { outboundReceipt: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.findAttachmentById(id, userId, 'inventory.manage');
    if (!attachment) return null;
    if (attachment.outboundReceipt?.status !== 'DRAFT') {
      throw new BadRequestException('只有草稿物流出库单可以删除附件');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }
}
