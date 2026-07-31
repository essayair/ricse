import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateWeighRecordDto } from './dto/create-weigh-record.dto';
import { CreateWeighTicketDto } from './dto/create-weigh-ticket.dto';

const BASES = ['RECEIVING', 'SHIPPING', 'CUSTOMER', 'THIRD_PARTY', 'MANUAL'];

@Injectable()
export class WeighTicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    waybill: {
      include: {
        lineItems: { orderBy: { createdAt: 'asc' as const } },
        dispatchNotice: {
          include: {
            order: {
              include: {
                contract: {
                  select: {
                    id: true, contractNo: true, title: true, type: true,
                    seller: { select: { id: true, name: true } },
                    buyer: { select: { id: true, name: true } },
                    signingPartner: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    },
    creator: { select: { id: true, name: true } },
    reviewer: { select: { id: true, name: true } },
    records: {
      include: { operator: { select: { id: true, name: true } } },
      orderBy: { sequence: 'asc' as const },
    },
    attachments: { orderBy: { createdAt: 'desc' as const } },
  };

  private async generateNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.weighTicket.count({ where: { createdAt: { gte: start, lt: end } } });
    return `PD-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async eligibleWaybills(userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWaybillScope(userId);
    return this.prisma.waybill.findMany({
      where: {
        deletedAt: null,
        AND: [scope],
        OR: [
          { dispatchNotice: { type: 'PURCHASE' }, status: { in: ['ARRIVED', 'SIGNED'] } },
          { dispatchNotice: { type: 'SALES' }, status: 'PENDING' },
        ],
        weighTickets: { none: { deletedAt: null, status: { not: 'VOIDED' } } },
      },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: {
          include: {
            order: {
              include: {
                contract: {
                  select: {
                    id: true, contractNo: true, title: true, type: true,
                    seller: { select: { id: true, name: true } },
                    buyer: { select: { id: true, name: true } },
                    signingPartner: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { arrivedAt: 'desc' },
      take: 100,
    });
  }

  async create(dto: CreateWeighTicketDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const scope = await this.accessControl.getWaybillScope(userId);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, deletedAt: null, AND: [scope] },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: {
          include: {
            order: {
              include: {
                contract: {
                  include: {
                    seller: { select: { id: true, name: true } },
                    buyer: { select: { id: true, name: true } },
                    signingPartner: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    const isPurchase = waybill.dispatchNotice.type === 'PURCHASE';
    const allowedStatus = isPurchase
      ? ['ARRIVED', 'SIGNED'].includes(waybill.status)
      : waybill.status === 'PENDING';
    if (!allowedStatus) {
      throw new BadRequestException(isPurchase
        ? '采购物流运单仅在已到达或已签收后可以创建磅单'
        : '销售物流运单仅在发运前可以创建出库磅单');
    }
    const existing = await this.prisma.weighTicket.findFirst({
      where: { waybillId: waybill.id, deletedAt: null, status: { not: 'VOIDED' } },
    });
    if (existing) throw new BadRequestException(`该物流运单已存在有效磅单 ${existing.ticketNo}`);
    const settlementBasis = dto.settlementBasis || 'RECEIVING';
    this.validateBasisWeight(settlementBasis, dto);
    const materialIds = [...new Set(waybill.lineItems.map(item => item.materialId))];
    const [materials, weighmaster] = await Promise.all([
      this.prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, spec: true, grade: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    const materialMap = new Map(materials.map(item => [item.id, item.spec || item.grade || '']));
    const materialNames = [...new Set(waybill.lineItems.map(item => item.materialName || item.materialId))];
    const materialSpecs = [...new Set(waybill.lineItems.map(item => materialMap.get(item.materialId)).filter(Boolean))];
    const contract = waybill.dispatchNotice.order.contract;
    const defaultShipper = isPurchase ? contract.seller?.name : contract.signingPartner?.name;
    const defaultReceiver = isPurchase
      ? contract.signingPartner?.name
      : (contract.type === 'BILATERAL' ? contract.buyer?.name : contract.seller?.name);
    return this.prisma.weighTicket.create({
      data: {
        ticketNo: await this.generateNo(),
        waybillId: waybill.id,
        direction: dto.direction || (isPurchase ? 'INBOUND' : 'OUTBOUND'),
        dataSource: dto.dataSource || 'MANUAL',
        ticketDate: dto.ticketDate ? new Date(dto.ticketDate) : new Date(),
        plateNo: dto.plateNo?.trim() || waybill.plateNo,
        materialName: dto.materialName?.trim() || materialNames.join('、'),
        materialSpec: dto.materialSpec?.trim() || materialSpecs.join('、') || null,
        shipperName: dto.shipperName?.trim() || defaultShipper || null,
        receiverName: dto.receiverName?.trim() || defaultReceiver || null,
        packageCount: dto.packageCount,
        driverName: dto.driverName?.trim() || waybill.driverName,
        weighmasterName: dto.weighmasterName?.trim() || weighmaster?.name || null,
        plannedQuantity: waybill.totalQuantity,
        settlementBasis,
        shippingWeight: dto.shippingWeight,
        customerWeight: dto.customerWeight,
        thirdPartyWeight: dto.thirdPartyWeight,
        manualWeight: dto.manualWeight,
        toleranceRate: dto.toleranceRate ?? 0.5,
        remarks: dto.remarks,
        createdBy: userId,
      },
      include: this.include,
    });
  }

  async findAll(params: { status?: string; abnormal?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWeighTicketScope(userId);
    const where: Prisma.WeighTicketWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.abnormal === 'true') where.abnormal = true;
    if (params.search) {
      where.OR = [
        { ticketNo: { contains: params.search, mode: 'insensitive' } },
        { materialName: { contains: params.search, mode: 'insensitive' } },
        { shipperName: { contains: params.search, mode: 'insensitive' } },
        { receiverName: { contains: params.search, mode: 'insensitive' } },
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { waybill: { waybillNo: { contains: params.search, mode: 'insensitive' } } },
        { waybill: { plateNo: { contains: params.search, mode: 'insensitive' } } },
        { waybill: { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } } },
        { waybill: { dispatchNotice: { order: { orderNo: { contains: params.search, mode: 'insensitive' } } } } },
      ];
    }
    const items = await this.prisma.weighTicket.findMany({
      where, include: this.include, take: 100, orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findOne(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWeighTicketScope(userId);
    const ticket = await this.prisma.weighTicket.findFirst({
      where: { id, deletedAt: null, AND: [scope] }, include: this.include,
    });
    if (!ticket) throw new NotFoundException('磅单不存在');
    return ticket;
  }

  async addRecord(id: string, dto: CreateWeighRecordDto, userId: string) {
    return this.addRecords(id, [dto], userId);
  }

  async addRecords(id: string, records: CreateWeighRecordDto[], userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (!['PENDING', 'WEIGHING'].includes(ticket.status)) {
      throw new BadRequestException('仅待称重或称重中的磅单可以追加称重记录');
    }
    if (!records.length || records.length > 20) {
      throw new BadRequestException('每次需要提交 1 至 20 条称重记录');
    }
    return this.prisma.$transaction(async tx => {
      const max = await tx.weighRecord.aggregate({
        where: { weighTicketId: id }, _max: { sequence: true },
      });
      let selectedGrossRecordId: string | undefined;
      let selectedTareRecordId: string | undefined;
      for (const [index, dto] of records.entries()) {
        const record = await tx.weighRecord.create({
          data: {
            weighTicketId: id,
            weighingType: dto.weighingType,
            sequence: (max._max.sequence || 0) + index + 1,
            weight: dto.weight,
            dataSource: dto.dataSource || 'MANUAL',
            weighedAt: dto.weighedAt ? new Date(dto.weighedAt) : new Date(),
            operatorId: userId,
            remarks: dto.remarks,
          },
        });
        if (dto.weighingType === 'GROSS') selectedGrossRecordId = record.id;
        if (dto.weighingType === 'TARE') selectedTareRecordId = record.id;
      }
      await tx.weighTicket.update({
        where: { id },
        data: {
          status: 'WEIGHING',
          ...(selectedGrossRecordId ? { selectedGrossRecordId } : {}),
          ...(selectedTareRecordId ? { selectedTareRecordId } : {}),
        },
      });
      await this.recalculate(tx, id);
      return tx.weighTicket.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async selectEffectiveRecords(id: string, data: { grossRecordId: string; tareRecordId: string }, userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (!['PENDING', 'WEIGHING'].includes(ticket.status)) {
      throw new BadRequestException('已完成磅单不能更换有效称重记录');
    }
    const gross = ticket.records.find(item => item.id === data.grossRecordId && item.weighingType === 'GROSS');
    const tare = ticket.records.find(item => item.id === data.tareRecordId && item.weighingType === 'TARE');
    if (!gross || !tare) throw new BadRequestException('有效毛重或皮重记录无效');
    return this.prisma.$transaction(async tx => {
      await tx.weighTicket.update({
        where: { id },
        data: { selectedGrossRecordId: gross.id, selectedTareRecordId: tare.id },
      });
      await this.recalculate(tx, id);
      return tx.weighTicket.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async updateSettlement(id: string, data: {
    settlementBasis: string;
    shippingWeight?: number;
    customerWeight?: number;
    thirdPartyWeight?: number;
    manualWeight?: number;
    toleranceRate?: number;
  }, userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (['REVIEWED', 'VOIDED'].includes(ticket.status)) throw new BadRequestException('已复核或已作废磅单不能修改结算口径');
    if (!BASES.includes(data.settlementBasis)) throw new BadRequestException('结算重量口径无效');
    this.validateBasisWeight(data.settlementBasis, { ...ticket, ...data });
    return this.prisma.$transaction(async tx => {
      await tx.weighTicket.update({
        where: { id },
        data: {
          settlementBasis: data.settlementBasis,
          shippingWeight: data.shippingWeight,
          customerWeight: data.customerWeight,
          thirdPartyWeight: data.thirdPartyWeight,
          manualWeight: data.manualWeight,
          toleranceRate: data.toleranceRate,
        },
      });
      await this.recalculate(tx, id);
      return tx.weighTicket.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async updateStatus(id: string, status: string, userId: string, reviewRemark?: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (status === 'COMPLETED') {
      if (!['PENDING', 'WEIGHING'].includes(ticket.status)) throw new BadRequestException('当前磅单不能完成称重');
      if (!ticket.selectedGrossRecordId || !ticket.selectedTareRecordId || !ticket.netWeight) {
        throw new BadRequestException('毛重和皮重均已称重后才能完成磅单');
      }
      if (!ticket.settlementWeight) throw new BadRequestException('当前结算口径缺少对应重量');
      if (!(ticket.attachments || []).length) throw new BadRequestException('完成称重前必须上传至少一份磅单附件');
      return this.prisma.weighTicket.update({ where: { id }, data: { status }, include: this.include });
    }
    if (status === 'REVIEWED') {
      if (ticket.status !== 'COMPLETED') throw new BadRequestException('仅已完成磅单可以复核');
      if (ticket.abnormal && !reviewRemark?.trim()) throw new BadRequestException('异常磅单复核必须填写处理意见');
      return this.prisma.weighTicket.update({
        where: { id },
        data: { status, reviewedBy: userId, reviewedAt: new Date(), reviewRemark: reviewRemark?.trim() },
        include: this.include,
      });
    }
    if (status === 'VOIDED') {
      if (ticket.status === 'REVIEWED') throw new BadRequestException('已复核磅单不能直接作废');
      return this.prisma.weighTicket.update({ where: { id }, data: { status }, include: this.include });
    }
    throw new BadRequestException('磅单状态无效');
  }

  async markPrinted(id: string, userId: string) {
    await this.findOne(id, userId, 'quality.manage');
    return this.prisma.weighTicket.update({
      where: { id }, data: { printedAt: new Date() }, include: this.include,
    });
  }

  async updateInfo(id: string, data: {
    ticketDate: string; plateNo: string; materialName: string; materialSpec: string;
    shipperName: string; receiverName: string; packageCount: number;
    driverName: string; weighmasterName: string; remarks?: string;
  }, userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (['REVIEWED', 'VOIDED'].includes(ticket.status)) {
      throw new BadRequestException('已复核或已作废磅单不能修改基本信息');
    }
    const required = [data.plateNo, data.materialName, data.materialSpec, data.shipperName,
      data.receiverName, data.driverName, data.weighmasterName];
    if (!data.ticketDate || required.some(value => !value?.trim())) {
      throw new BadRequestException('请完整填写磅单基本信息');
    }
    if (!Number.isInteger(data.packageCount) || data.packageCount < 0) {
      throw new BadRequestException('包/袋数必须是大于等于 0 的整数');
    }
    return this.prisma.weighTicket.update({
      where: { id },
      data: {
        ticketDate: new Date(data.ticketDate), plateNo: data.plateNo.trim(),
        materialName: data.materialName.trim(), materialSpec: data.materialSpec.trim(),
        shipperName: data.shipperName.trim(), receiverName: data.receiverName.trim(),
        packageCount: data.packageCount, driverName: data.driverName.trim(),
        weighmasterName: data.weighmasterName.trim(), remarks: data.remarks?.trim() || null,
      },
      include: this.include,
    });
  }

  async createAttachment(data: {
    weighTicketId: string; fileName: string; originalName: string;
    mimeType: string; size: number;
  }, userId: string) {
    const ticket = await this.findOne(data.weighTicketId, userId, 'quality.manage');
    if (['REVIEWED', 'VOIDED'].includes(ticket.status)) {
      throw new BadRequestException('已复核或已作废磅单不能上传附件');
    }
    return this.prisma.attachment.create({ data: { ...data, category: 'WEIGH_TICKET' } });
  }

  async findAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWeighTicketScope(userId);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        weighTicketId: { not: null },
        category: 'WEIGH_TICKET',
        weighTicket: { deletedAt: null, AND: [scope] },
      },
      include: { weighTicket: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.findAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return null;
    if (['COMPLETED', 'REVIEWED'].includes(attachment.weighTicket?.status || '')) {
      throw new BadRequestException('已完成称重的磅单附件不能删除');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  private validateBasisWeight(basis: string, data: any) {
    const field: Record<string, string> = {
      SHIPPING: 'shippingWeight', CUSTOMER: 'customerWeight',
      THIRD_PARTY: 'thirdPartyWeight', MANUAL: 'manualWeight',
    };
    if (basis !== 'RECEIVING' && (!data[field[basis]] || Number(data[field[basis]]) <= 0)) {
      throw new BadRequestException('所选结算口径必须填写对应重量');
    }
  }

  private async recalculate(tx: Prisma.TransactionClient, id: string) {
    const ticket = await tx.weighTicket.findUniqueOrThrow({
      where: { id }, include: { records: true },
    });
    const gross = ticket.records.find(item => item.id === ticket.selectedGrossRecordId);
    const tare = ticket.records.find(item => item.id === ticket.selectedTareRecordId);
    const grossWeight = gross ? Number(gross.weight) : null;
    const tareWeight = tare ? Number(tare.weight) : null;
    const netWeight = grossWeight !== null && tareWeight !== null ? Math.abs(grossWeight - tareWeight) : null;
    const receivingWeight = netWeight;
    const weights: Record<string, number | null> = {
      RECEIVING: receivingWeight,
      SHIPPING: ticket.shippingWeight ? Number(ticket.shippingWeight) : null,
      CUSTOMER: ticket.customerWeight ? Number(ticket.customerWeight) : null,
      THIRD_PARTY: ticket.thirdPartyWeight ? Number(ticket.thirdPartyWeight) : null,
      MANUAL: ticket.manualWeight ? Number(ticket.manualWeight) : null,
    };
    const settlementWeight = weights[ticket.settlementBasis];
    const planned = Number(ticket.plannedQuantity);
    const varianceWeight = netWeight === null ? null : netWeight - planned;
    const varianceRate = varianceWeight === null || planned === 0 ? null : Math.abs(varianceWeight) / planned * 100;
    await tx.weighTicket.update({
      where: { id },
      data: {
        grossWeight, tareWeight, netWeight, receivingWeight, settlementWeight,
        varianceWeight, varianceRate,
        abnormal: varianceRate !== null && varianceRate > Number(ticket.toleranceRate),
      },
    });
  }
}
