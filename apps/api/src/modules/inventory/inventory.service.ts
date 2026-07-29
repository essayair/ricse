import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateInboundReceiptDto } from './dto/create-inbound-receipt.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    warehouse: { select: { id: true, code: true, name: true } },
    creator: { select: { id: true, name: true } },
    weighTicket: { select: { id: true, ticketNo: true, settlementWeight: true, netWeight: true } },
    qualityInspection: {
      select: {
        id: true, inspectionNo: true, institutionType: true, institutionName: true,
        reportNo: true, status: true, conclusion: true, settlementWeight: true,
        moistureDeductionWeight: true, impurityDeductionWeight: true, deductionAmount: true,
      },
    },
    waybill: {
      include: {
        lineItems: { orderBy: { createdAt: 'asc' as const } },
        dispatchNotice: { include: { order: { include: { contract: { select: { id: true, contractNo: true, title: true } } } } } },
      },
    },
    businessInbound: { include: { inventoryLot: true } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
  };

  private async nextNo(prefix: string, model: 'inboundReceipt' | 'businessInbound') {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = model === 'inboundReceipt'
      ? await this.prisma.inboundReceipt.count({ where: { createdAt: { gte: start, lt: end } } })
      : await this.prisma.businessInbound.count({ where: { createdAt: { gte: start, lt: end } } });
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async eligibleWaybills(userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getWaybillScope(userId);
    return this.prisma.waybill.findMany({
      where: {
        deletedAt: null,
        AND: [scope],
        status: { in: ['ARRIVED', 'SIGNED'] },
        dispatchNotice: { type: 'PURCHASE' },
        inboundReceipts: { none: { deletedAt: null, status: { not: 'CANCELLED' } } },
        weighTickets: {
          some: {
            deletedAt: null, status: 'REVIEWED',
            qualityInspections: { some: { deletedAt: null, status: 'CONFIRMED', conclusion: 'PASS' } },
          },
        },
      },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: { include: { order: { include: { contract: { select: { contractNo: true, title: true } } } } } },
        weighTickets: {
          where: { deletedAt: null, status: 'REVIEWED' },
          include: {
            qualityInspections: {
              where: { deletedAt: null, status: 'CONFIRMED', conclusion: 'PASS' },
              orderBy: { testedAt: 'desc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { arrivedAt: 'desc' },
      take: 100,
    });
  }

  async createReceipt(dto: CreateInboundReceiptDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.manage');
    const scope = await this.accessControl.getWaybillScope(userId);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, deletedAt: null, AND: [scope] },
      include: {
        inboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, select: { receiptNo: true } },
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: true,
      },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    if (waybill.dispatchNotice.type !== 'PURCHASE') throw new BadRequestException('只有采购物流运单可以创建物流入库单');
    if (!['ARRIVED', 'SIGNED'].includes(waybill.status)) throw new BadRequestException('物流运单到达后才能创建物流入库单');
    if (waybill.inboundReceipts.length) throw new BadRequestException(`该运单已存在入库单 ${waybill.inboundReceipts[0].receiptNo}`);

    const weighTicket = await this.prisma.weighTicket.findFirst({ where: { id: dto.weighTicketId, waybillId: waybill.id, deletedAt: null } });
    if (!weighTicket || weighTicket.status !== 'REVIEWED') throw new BadRequestException('请选择该运单已复核的磅单');
    const quality = await this.prisma.qualityInspection.findFirst({ where: { id: dto.qualityInspectionId, weighTicketId: weighTicket.id, deletedAt: null } });
    if (!quality || quality.status !== 'CONFIRMED') throw new BadRequestException('请选择该磅单已确认的质检单');
    if (quality.conclusion !== 'PASS') {
      throw new BadRequestException('只有质检结论为“合格”的货物才能入库；超标扣款、熔断或待判定货物不能入库');
    }
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null } });
    if (!warehouse) throw new BadRequestException('入库仓库不存在或已停用');
    if (!dto.receiverName.trim()) throw new BadRequestException('请填写收货人');
    const quantity = Number(quality.settlementWeight || weighTicket.settlementWeight || 0);
    if (quantity <= 0) throw new BadRequestException('质检后结算重量必须大于 0');

    return this.prisma.inboundReceipt.create({
      data: {
        receiptNo: await this.nextNo('LIR', 'inboundReceipt'), waybillId: waybill.id,
        weighTicketId: weighTicket.id, qualityInspectionId: quality.id, warehouseId: warehouse.id,
        acceptanceConclusion: quality.conclusion, materialName: quality.materialName,
        materialSpec: quality.materialSpec, supplierName: quality.supplierName,
        plateNo: quality.plateNo || waybill.plateNo, receivedQuantity: quantity,
        moistureDeductionWeight: quality.moistureDeductionWeight,
        impurityDeductionWeight: quality.impurityDeductionWeight,
        deductionAmount: quality.deductionAmount, receivedAt: new Date(dto.receivedAt),
        receiverName: dto.receiverName.trim(), remarks: dto.remarks?.trim() || null, createdBy: userId,
      },
      include: this.include,
    });
  }

  async findReceipts(params: { search?: string; status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInboundReceiptScope(userId);
    const where: Prisma.InboundReceiptWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.search) where.OR = [
      { receiptNo: { contains: params.search, mode: 'insensitive' } },
      { materialName: { contains: params.search, mode: 'insensitive' } },
      { supplierName: { contains: params.search, mode: 'insensitive' } },
      { plateNo: { contains: params.search, mode: 'insensitive' } },
      { waybill: { waybillNo: { contains: params.search, mode: 'insensitive' } } },
      { weighTicket: { ticketNo: { contains: params.search, mode: 'insensitive' } } },
      { qualityInspection: { inspectionNo: { contains: params.search, mode: 'insensitive' } } },
    ];
    const items = await this.prisma.inboundReceipt.findMany({ where, include: this.include, orderBy: { createdAt: 'desc' } });
    return { items, total: items.length };
  }

  async findReceipt(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getInboundReceiptScope(userId);
    const item = await this.prisma.inboundReceipt.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!item) throw new NotFoundException('物流入库单不存在');
    return item;
  }

  async confirmReceipt(id: string, userId: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿入库单可以确认收货');
    this.assertQualifiedForInventory(item);
    return this.prisma.inboundReceipt.update({ where: { id }, data: { status: 'RECEIVED' }, include: this.include });
  }

  async cancelReceipt(id: string, userId: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿入库单可以作废');
    return this.prisma.inboundReceipt.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.include,
    });
  }

  async createAttachment(data: {
    inboundReceiptId: string; fileName: string; originalName: string;
    mimeType: string; size: number; category: string;
  }, userId: string) {
    const receipt = await this.findReceipt(data.inboundReceiptId, userId, 'inventory.manage');
    if (receipt.status !== 'DRAFT') throw new BadRequestException('只有草稿入库单可以上传附件');
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getInboundReceiptScope(userId);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        inboundReceiptId: { not: null },
        inboundReceipt: { deletedAt: null, AND: [scope] },
      },
      include: { inboundReceipt: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.findAttachmentById(id, userId, 'inventory.manage');
    if (!attachment) return null;
    if (attachment.inboundReceipt?.status !== 'DRAFT') {
      throw new BadRequestException('只有草稿入库单可以删除附件');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  async postInventory(id: string, userId: string) {
    const receipt = await this.findReceipt(id, userId, 'inventory.manage');
    if (receipt.status !== 'RECEIVED') throw new BadRequestException('确认收货后才能生成业务入库单');
    this.assertQualifiedForInventory(receipt);
    if (receipt.businessInbound) throw new BadRequestException('该物流入库单已生成业务入库单');
    const line = receipt.waybill.lineItems[0];
    if (!line) throw new BadRequestException('运单缺少物料明细');
    const quantity = Number(receipt.receivedQuantity);
    const inboundNo = await this.nextNo('BIN', 'businessInbound');
    const lotNo = `LOT-${inboundNo.replace('BIN-', '')}`;
    await this.prisma.$transaction(async tx => {
      const inbound = await tx.businessInbound.create({
        data: {
          inboundNo, receiptId: receipt.id, warehouseId: receipt.warehouseId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, quantity, lotNo, createdBy: userId,
        },
      });
      const lot = await tx.inventoryLot.create({
        data: {
          lotNo, businessInboundId: inbound.id, warehouseId: receipt.warehouseId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, initialQuantity: quantity,
          availableQuantity: quantity, qualityConclusion: receipt.acceptanceConclusion,
        },
      });
      await tx.inventoryLedger.create({
        data: {
          lotId: lot.id, warehouseId: receipt.warehouseId, materialId: line.materialId,
          businessType: 'INBOUND', businessNo: inboundNo, quantityChange: quantity,
          balanceAfter: quantity, remarks: `由物流入库单 ${receipt.receiptNo} 生成`, createdBy: userId,
        },
      });
      await tx.inboundReceipt.update({ where: { id: receipt.id }, data: { status: 'POSTED' } });
    });
    return this.findReceipt(id, userId, 'inventory.manage');
  }

  private assertQualifiedForInventory(receipt: {
    acceptanceConclusion: string;
    qualityInspection?: { status: string; conclusion: string } | null;
  }) {
    if (
      receipt.acceptanceConclusion !== 'PASS'
      || receipt.qualityInspection?.status !== 'CONFIRMED'
      || receipt.qualityInspection.conclusion !== 'PASS'
    ) {
      throw new BadRequestException('只有已确认且质检合格的货物才能形成系统库存');
    }
  }

  async inventoryOverview(params: { search?: string; warehouseId?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInventoryLotScope(userId);
    const where: Prisma.InventoryLotWhereInput = { AND: [scope] };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.search) where.OR = [
      { lotNo: { contains: params.search, mode: 'insensitive' } },
      { materialName: { contains: params.search, mode: 'insensitive' } },
      { supplierName: { contains: params.search, mode: 'insensitive' } },
    ];
    const lots = await this.prisma.inventoryLot.findMany({
      where, include: { warehouse: { select: { code: true, name: true } }, material: { select: { code: true, unit: true } }, businessInbound: { select: { inboundNo: true, postedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const totalQuantity = lots.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0);
    return { lots, summary: { lotCount: lots.length, materialCount: new Set(lots.map(item => item.materialId)).size, warehouseCount: new Set(lots.map(item => item.warehouseId)).size, totalQuantity } };
  }

  async inventoryLedger(userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInventoryLedgerScope(userId);
    return this.prisma.inventoryLedger.findMany({
      where: scope,
      include: { lot: { select: { lotNo: true } }, warehouse: { select: { name: true } }, material: { select: { name: true, unit: true } }, creator: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }
}
