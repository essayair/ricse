import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateWeighRecordDto } from './dto/create-weigh-record.dto';
import { CreateWeighTicketDto } from './dto/create-weigh-ticket.dto';

const BASES = ['RECEIVING', 'SHIPPING', 'CUSTOMER', 'THIRD_PARTY', 'MANUAL'];
const WEIGHING_STAGES = ['SHIPPING', 'RECEIVING'];
const SELECTION_PURPOSES = ['INVENTORY', 'SETTLEMENT', 'SHIPPING', 'RECEIVING'];
const AUTO_STAGE_SELECTION_REASON = '该侧唯一有效磅单，系统自动采信';

export function normalizeWeight(value: number) {
  return Number(value.toFixed(3));
}

export function calculateNetWeight(grossWeight: number, tareWeight: number) {
  return normalizeWeight(Math.abs(grossWeight - tareWeight));
}

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
                    businessUnit: { select: { id: true, code: true, name: true } },
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
    weightSelections: {
      where: { isCurrent: true },
      include: { selector: { select: { id: true, name: true } } },
      orderBy: { selectedAt: 'desc' as const },
    },
  };

  private readonly managementInclude = {
    weighTask: {
      include: {
        creator: { select: { id: true, name: true } },
        attachments: {
          include: { uploader: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    },
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    dispatchNotice: {
      include: {
        order: {
          include: {
            contract: {
              select: {
                id: true, contractNo: true, title: true, type: true,
                businessUnit: { select: { id: true, code: true, name: true } },
                seller: { select: { id: true, name: true } },
                buyer: { select: { id: true, name: true } },
                signingPartner: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    },
    weighTickets: {
      where: { deletedAt: null },
      include: {
        creator: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        records: {
          include: { operator: { select: { id: true, name: true } } },
          orderBy: { sequence: 'asc' as const },
        },
        attachments: { orderBy: { createdAt: 'desc' as const } },
      },
      orderBy: [{ weighingStage: 'asc' as const }, { sequence: 'asc' as const }],
    },
    weightSelections: {
      where: { isCurrent: true },
      include: {
        selector: { select: { id: true, name: true } },
        weighTicket: {
          select: {
            id: true, ticketNo: true, weighingStage: true, sequence: true,
            netWeight: true, status: true,
          },
        },
      },
      orderBy: { selectedAt: 'desc' as const },
    },
  };

  private async generateNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.weighTicket.count({ where: { createdAt: { gte: start, lt: end } } });
    return `PD-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateTaskNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.weighTask.count({ where: { createdAt: { gte: start, lt: end } } });
    return `WT-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async ensureTaskForWaybill(waybillId: string, userId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null },
      select: { id: true, status: true, vehicleId: true, plateNo: true, totalQuantity: true },
    });
    if (!waybill || (!waybill.vehicleId && !waybill.plateNo)) return null;
    const existing = await this.prisma.weighTask.findUnique({ where: { waybillId } });
    if (existing) {
      if (existing.deletedAt || existing.plannedQuantity.toString() !== waybill.totalQuantity.toString()) {
        return this.prisma.weighTask.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            plannedQuantity: waybill.totalQuantity,
            status: waybill.status === 'CANCELLED' ? 'VOIDED' : existing.status === 'VOIDED' ? 'PENDING_WEIGHING' : existing.status,
          },
        });
      }
      return existing;
    }
    try {
      return await this.prisma.weighTask.create({
        data: {
          taskNo: await this.generateTaskNo(),
          waybillId,
          plannedQuantity: waybill.totalQuantity,
          status: waybill.status === 'CANCELLED' ? 'VOIDED' : 'PENDING_WEIGHING',
          createdBy: userId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.weighTask.findUnique({ where: { waybillId } });
      }
      throw error;
    }
  }

  async syncTaskForWaybill(waybillId: string, userId: string) {
    const task = await this.ensureTaskForWaybill(waybillId, userId);
    if (!task) return null;
    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
      select: {
        status: true,
        weighTickets: {
          where: { deletedAt: null, status: { not: 'VOIDED' } },
          select: { status: true, abnormal: true },
        },
        weightSelections: { where: { isCurrent: true }, select: { id: true, purpose: true } },
      },
    });
    if (!waybill) return null;
    let status = 'PENDING_WEIGHING';
    if (waybill.status === 'CANCELLED') status = 'VOIDED';
    else if (waybill.weighTickets.some(item => item.status === 'COMPLETED' && item.abnormal)) status = 'EXCEPTION';
    else if (waybill.weightSelections.some(item => item.purpose === 'INVENTORY')) status = 'COMPLETED';
    else if (waybill.weighTickets.some(item => ['COMPLETED', 'REVIEWED'].includes(item.status))) status = 'PENDING_CONFIRMATION';
    else if (waybill.weighTickets.length) status = 'IN_PROGRESS';
    return this.prisma.weighTask.update({ where: { id: task.id }, data: { status } });
  }

  /**
   * 为我方可控称重节点幂等生成首张待过磅单。
   * 销售在发货前生成我方发货磅单；采购仅在车辆到达后生成我方收货磅单。
   * 供应商发货、客户收货和第三方复磅仍由业务人员按实际凭证登记。
   */
  async ensurePrimaryTicketForWaybill(waybillId: string, userId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null },
      select: {
        id: true, status: true, vehicleId: true, plateNo: true,
        dispatchNotice: { select: { type: true } },
      },
    });
    if (!waybill || (!waybill.vehicleId && !waybill.plateNo) || waybill.status === 'CANCELLED') return null;

    const isPurchase = waybill.dispatchNotice.type === 'PURCHASE';
    if (isPurchase && !['ARRIVED', 'SIGNED'].includes(waybill.status)) return null;
    const weighingStage = isPurchase ? 'RECEIVING' : 'SHIPPING';
    const existing = await this.prisma.weighTicket.findFirst({
      where: { waybillId, weighingStage, deletedAt: null },
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });
    if (existing) return existing;

    return this.create({
      waybillId,
      weighingStage,
      remarks: `系统根据物流运单自动生成我方${isPurchase ? '收货' : '发货'}待过磅单`,
    }, userId, { systemGenerated: true });
  }

  async voidTaskForWaybill(waybillId: string, userId: string) {
    const task = await this.ensureTaskForWaybill(waybillId, userId);
    if (!task) return null;
    return this.prisma.weighTask.update({ where: { id: task.id }, data: { status: 'VOIDED' } });
  }

  async eligibleWaybills(userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.view');
    return this.prisma.waybill.findMany({
      where: {
        deletedAt: null,
        AND: [scope],
        status: { in: ['PENDING', 'IN_TRANSIT', 'ARRIVED', 'SIGNED'] },
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
        weighTickets: {
          where: { deletedAt: null },
          select: {
            id: true, ticketNo: true, status: true, weighingStage: true,
            sequence: true, isSupplementary: true, additionReason: true,
          },
          orderBy: [{ weighingStage: 'asc' }, { sequence: 'asc' }],
        },
      },
      orderBy: { arrivedAt: 'desc' },
      take: 100,
    });
  }

  async create(
    dto: CreateWeighTicketDto,
    userId: string,
    options: { systemGenerated?: boolean } = {},
  ) {
    if (!options.systemGenerated) {
      await this.accessControl.assertPermission(userId, 'quality.manage');
    }
    const scope = options.systemGenerated
      ? {}
      : await this.accessControl.getWaybillScope(userId, 'quality.manage');
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
    const weighingStage = dto.weighingStage || (isPurchase ? 'RECEIVING' : 'SHIPPING');
    this.assertStageAllowed(weighingStage, waybill.status);
    const existingTickets = await this.prisma.weighTicket.findMany({
      where: { waybillId: waybill.id, weighingStage, deletedAt: null },
      select: { id: true, ticketNo: true, sequence: true },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
    });
    const previousTicket = existingTickets[0];
    const additionReason = dto.additionReason?.trim();
    if (previousTicket && !additionReason) {
      throw new BadRequestException(`该运单的${weighingStage === 'SHIPPING' ? '发货' : '收货'}节点已存在磅单 ${previousTicket.ticketNo}，追加完整磅单必须填写追加原因`);
    }
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
    const created = await this.prisma.weighTicket.create({
      data: {
        ticketNo: await this.generateNo(),
        waybillId: waybill.id,
        direction: isPurchase ? 'INBOUND' : 'OUTBOUND',
        weighingStage,
        sequence: (previousTicket?.sequence || 0) + 1,
        isSupplementary: !!previousTicket,
        previousTicketId: previousTicket?.id || null,
        additionReason: additionReason || null,
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
        shippingWeight: dto.shippingWeight === undefined ? undefined : normalizeWeight(dto.shippingWeight),
        customerWeight: dto.customerWeight === undefined ? undefined : normalizeWeight(dto.customerWeight),
        thirdPartyWeight: dto.thirdPartyWeight === undefined ? undefined : normalizeWeight(dto.thirdPartyWeight),
        manualWeight: dto.manualWeight === undefined ? undefined : normalizeWeight(dto.manualWeight),
        toleranceRate: dto.toleranceRate ?? 0.5,
        remarks: dto.remarks,
        createdBy: userId,
      },
      include: this.include,
    });
    if (previousTicket) {
      await this.prisma.waybillWeightSelection.updateMany({
        where: { waybillId: waybill.id, purpose: weighingStage, isCurrent: true, reason: AUTO_STAGE_SELECTION_REASON },
        data: { isCurrent: false },
      });
    }
    await this.syncTaskForWaybill(waybill.id, userId);
    return created;
  }

  async updateWaybill(id: string, waybillId: string, userId: string, additionReason?: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (!['PENDING', 'WEIGHING'].includes(ticket.status)) {
      throw new BadRequestException('只有待称重或称重中的磅单可以更换物流运单');
    }
    if (ticket.waybillId === waybillId) return ticket;
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.manage');
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null, AND: [scope] },
      include: { dispatchNotice: true },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    const isPurchase = waybill.dispatchNotice.type === 'PURCHASE';
    this.assertStageAllowed(ticket.weighingStage, waybill.status);
    const existingTickets = await this.prisma.weighTicket.findMany({
      where: { waybillId, weighingStage: ticket.weighingStage, id: { not: id }, deletedAt: null },
      select: { id: true, ticketNo: true, sequence: true },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
    });
    const previousTicket = existingTickets[0];
    const normalizedReason = additionReason?.trim();
    if (previousTicket && !normalizedReason) {
      throw new BadRequestException(`目标运单的同一称重节点已存在磅单 ${previousTicket.ticketNo}，请填写追加原因`);
    }
    const moved = await this.prisma.$transaction(async tx => {
      const updated = await tx.weighTicket.update({
        where: { id },
        data: {
        waybillId,
        direction: isPurchase ? 'INBOUND' : 'OUTBOUND',
        sequence: (previousTicket?.sequence || 0) + 1,
        isSupplementary: !!previousTicket,
        previousTicketId: previousTicket?.id || null,
        additionReason: normalizedReason || null,
        plannedQuantity: waybill.totalQuantity,
        plateNo: waybill.plateNo || ticket.plateNo,
        driverName: waybill.driverName || ticket.driverName,
        },
        include: this.include,
      });
      if (previousTicket) {
        await tx.waybillWeightSelection.updateMany({
          where: { waybillId, purpose: ticket.weighingStage, isCurrent: true, reason: AUTO_STAGE_SELECTION_REASON },
          data: { isCurrent: false },
        });
      }
      return updated;
    });
    await this.restoreUniqueStageSelection(ticket.waybillId, ticket.weighingStage, userId);
    await this.syncTaskForWaybill(ticket.waybillId, userId);
    await this.syncTaskForWaybill(waybillId, userId);
    return moved;
  }

  async findAll(params: { status?: string; abnormal?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWeighTicketScope(userId, 'quality.view');
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

  async findManagementFiles(params: { status?: string; abnormal?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.view');
    const ticketFilter: Prisma.WeighTicketWhereInput = { deletedAt: null };
    if (params.status) ticketFilter.status = params.status;
    if (params.abnormal === 'true') ticketFilter.abnormal = true;
    const where: Prisma.WaybillWhereInput = {
      deletedAt: null,
      AND: [scope],
      weighTask: { is: { deletedAt: null } },
      ...((params.status || params.abnormal === 'true') ? { weighTickets: { some: ticketFilter } } : {}),
    };
    if (params.search) {
      where.OR = [
        { waybillNo: { contains: params.search, mode: 'insensitive' } },
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { driverName: { contains: params.search, mode: 'insensitive' } },
        { dispatchNotice: { noticeNo: { contains: params.search, mode: 'insensitive' } } },
        { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } },
        { dispatchNotice: { order: { orderNo: { contains: params.search, mode: 'insensitive' } } } },
        { dispatchNotice: { order: { contract: { businessUnit: { name: { contains: params.search, mode: 'insensitive' } } } } } },
        { dispatchNotice: { order: { contract: { businessUnit: { code: { contains: params.search, mode: 'insensitive' } } } } } },
        { weighTickets: { some: { deletedAt: null, ticketNo: { contains: params.search, mode: 'insensitive' } } } },
        { weighTickets: { some: { deletedAt: null, materialName: { contains: params.search, mode: 'insensitive' } } } },
        { weighTickets: { some: { deletedAt: null, shipperName: { contains: params.search, mode: 'insensitive' } } } },
        { weighTickets: { some: { deletedAt: null, receiverName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    const items = await this.prisma.waybill.findMany({
      where,
      include: this.managementInclude,
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findManagementFile(waybillId: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.view');
    const item = await this.prisma.waybill.findFirst({
      where: {
        id: waybillId,
        deletedAt: null,
        AND: [scope],
        weighTask: { is: { deletedAt: null } },
      },
      include: this.managementInclude,
    });
    if (!item) throw new NotFoundException('磅单信息不存在');
    return item;
  }

  async findOne(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWeighTicketScope(userId, permission);
    const ticket = await this.prisma.weighTicket.findFirst({
      where: { id, deletedAt: null, AND: [scope] }, include: this.include,
    });
    if (!ticket) throw new NotFoundException('磅单不存在');
    return ticket;
  }

  async addRecord(id: string, dto: CreateWeighRecordDto, userId: string) {
    return this.addRecords(id, [dto], userId);
  }

  async deleteRecord(id: string, recordId: string, userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (!['PENDING', 'WEIGHING', 'COMPLETED'].includes(ticket.status)) {
      throw new BadRequestException('磅单复核后不能删除称重记录');
    }
    const record = ticket.records.find(item => item.id === recordId);
    if (!record) throw new NotFoundException('称重记录不存在');
    const updated = await this.prisma.$transaction(async tx => {
      await tx.weighRecord.delete({ where: { id: recordId } });
      const remaining = ticket.records.filter(item => item.id !== recordId);
      const replacement = [...remaining].reverse().find(item => item.weighingType === record.weighingType);
      await tx.weighTicket.update({
        where: { id },
        data: {
          ...(ticket.selectedGrossRecordId === recordId ? { selectedGrossRecordId: replacement?.id || null } : {}),
          ...(ticket.selectedTareRecordId === recordId ? { selectedTareRecordId: replacement?.id || null } : {}),
          ...(ticket.status === 'COMPLETED' ? { status: 'WEIGHING' } : {}),
        },
      });
      await this.recalculate(tx, id);
      return tx.weighTicket.findUniqueOrThrow({ where: { id }, include: this.include });
    });
    await this.syncTaskForWaybill(ticket.waybillId, userId);
    return updated;
  }

  async addRecords(id: string, records: CreateWeighRecordDto[], userId: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (!['PENDING', 'WEIGHING'].includes(ticket.status)) {
      throw new BadRequestException('仅待称重或称重中的磅单可以追加称重记录');
    }
    if (!records.length || records.length > 20) {
      throw new BadRequestException('每次需要提交 1 至 20 条称重记录');
    }
    const updated = await this.prisma.$transaction(async tx => {
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
            weight: normalizeWeight(dto.weight),
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
    await this.syncTaskForWaybill(ticket.waybillId, userId);
    return updated;
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
          shippingWeight: data.shippingWeight === undefined ? undefined : normalizeWeight(data.shippingWeight),
          customerWeight: data.customerWeight === undefined ? undefined : normalizeWeight(data.customerWeight),
          thirdPartyWeight: data.thirdPartyWeight === undefined ? undefined : normalizeWeight(data.thirdPartyWeight),
          manualWeight: data.manualWeight === undefined ? undefined : normalizeWeight(data.manualWeight),
          toleranceRate: data.toleranceRate,
        },
      });
      await this.recalculate(tx, id);
      return tx.weighTicket.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async updateStatus(id: string, status: string, userId: string, reviewRemark?: string) {
    const ticket = await this.findOne(id, userId, 'quality.manage');
    if (status === 'WEIGHING') {
      if (ticket.status !== 'COMPLETED') throw new BadRequestException('仅待复核的磅单可以返回修改');
      const reopened = await this.prisma.weighTicket.update({
        where: { id }, data: { status: 'WEIGHING' }, include: this.include,
      });
      await this.syncTaskForWaybill(ticket.waybillId, userId);
      return reopened;
    }
    if (status === 'COMPLETED') {
      if (!['PENDING', 'WEIGHING'].includes(ticket.status)) throw new BadRequestException('当前磅单不能完成称重');
      if (!ticket.selectedGrossRecordId || !ticket.selectedTareRecordId || !ticket.netWeight) {
        throw new BadRequestException('毛重和皮重均已称重后才能完成磅单');
      }
      if (!ticket.settlementWeight) throw new BadRequestException('当前结算口径缺少对应重量');
      if (!(ticket.attachments || []).length) throw new BadRequestException('完成称重前必须上传至少一份磅单附件');
      const updated = await this.prisma.weighTicket.update({ where: { id }, data: { status }, include: this.include });
      await this.syncTaskForWaybill(ticket.waybillId, userId);
      return updated;
    }
    if (status === 'REVIEWED') {
      if (ticket.status !== 'COMPLETED') throw new BadRequestException('仅已完成磅单可以复核');
      const reviewed = await this.prisma.weighTicket.update({
        where: { id },
        data: { status, reviewedBy: userId, reviewedAt: new Date(), reviewRemark: reviewRemark?.trim() || (ticket.abnormal ? '按实际磅单' : null) },
        include: this.include,
      });
      await this.applyDefaultSelections(reviewed.id, userId);
      await this.syncTaskForWaybill(ticket.waybillId, userId);
      return this.findOne(id, userId);
    }
    if (status === 'VOIDED') {
      if (ticket.status === 'REVIEWED') throw new BadRequestException('已复核磅单不能直接作废');
      const selected = await this.prisma.waybillWeightSelection.findFirst({
        where: { weighTicketId: id, isCurrent: true },
      });
      if (selected) {
        const label = selected.purpose === 'INVENTORY' ? '出入库' : selected.purpose === 'SETTLEMENT' ? '货款结算' : selected.purpose === 'SHIPPING' ? '采信发货' : '采信收货';
        throw new BadRequestException(`该磅单已被选为${label}依据，不能作废`);
      }
      const updated = await this.prisma.weighTicket.update({ where: { id }, data: { status }, include: this.include });
      await this.restoreUniqueStageSelection(ticket.waybillId, ticket.weighingStage, userId);
      await this.syncTaskForWaybill(ticket.waybillId, userId);
      return updated;
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
    const scope = await this.accessControl.getWeighTicketScope(userId, permission);
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

  async createTaskAttachment(data: {
    weighTaskId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
    category: string;
    sourceType: string;
    evidenceNode?: string;
    capturedAt?: string;
    fileHash: string;
    watermarkText?: string;
  }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const task = await this.prisma.weighTask.findFirst({
      where: { id: data.weighTaskId, deletedAt: null },
      include: { waybill: true },
    });
    if (!task) throw new NotFoundException('过磅任务不存在');
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.manage');
    const permitted = await this.prisma.waybill.findFirst({ where: { id: task.waybillId, AND: [scope] }, select: { id: true } });
    if (!permitted) throw new NotFoundException('过磅任务不存在');
    if (['COMPLETED', 'VOIDED'].includes(task.status)) throw new BadRequestException('已完成或已作废过磅任务不能追加现场影像');
    return this.prisma.attachment.create({
      data: {
        ...data,
        capturedAt: data.capturedAt ? new Date(data.capturedAt) : null,
        uploadedBy: userId,
      },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async findTaskForEvidence(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const scope = await this.accessControl.getWaybillScope(userId, 'quality.manage');
    const task = await this.prisma.weighTask.findFirst({
      where: { id, deletedAt: null, waybill: { deletedAt: null, AND: [scope] } },
      include: {
        waybill: {
          include: {
            lineItems: { orderBy: { createdAt: 'asc' } },
            dispatchNotice: { include: { order: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('过磅任务不存在');
    return task;
  }

  async findTaskAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWaybillScope(userId, permission);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        weighTaskId: { not: null },
        weighTask: { deletedAt: null, waybill: { deletedAt: null, AND: [scope] } },
      },
      include: { weighTask: { select: { status: true } } },
    });
  }

  async deleteTaskAttachment(id: string, userId: string) {
    const attachment = await this.findTaskAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return null;
    if (['COMPLETED', 'VOIDED'].includes(attachment.weighTask?.status || '')) {
      throw new BadRequestException('已完成或已作废过磅任务的现场影像不能删除');
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

  async selectForPurpose(
    waybillId: string,
    purpose: string,
    weighTicketId: string,
    reason: string | undefined,
    userId: string,
  ) {
    if (!SELECTION_PURPOSES.includes(purpose)) throw new BadRequestException('磅单选用用途无效');
    return this.selectEffectiveTicket(waybillId, weighTicketId, reason, userId, purpose);
  }

  async selectEffectiveTicket(
    waybillId: string,
    weighTicketId: string,
    reason: string | undefined,
    userId: string,
    purpose?: string,
  ) {
    if (purpose && !SELECTION_PURPOSES.includes(purpose)) throw new BadRequestException('磅单选用用途无效');
    const permission = purpose === 'SETTLEMENT' ? 'settlement.create' : 'quality.manage';
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWaybillScope(userId, permission);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null, AND: [scope] },
      select: { id: true, dispatchNotice: { select: { type: true } } },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    const ticket = await this.prisma.weighTicket.findFirst({
      where: { id: weighTicketId, waybillId, deletedAt: null, status: 'REVIEWED' },
      select: { id: true, ticketNo: true, netWeight: true, weighingStage: true },
    });
    if (!ticket) throw new BadRequestException('只能选用该运单下已复核的有效磅单');
    const quantity = Number(ticket.netWeight || 0);
    if (quantity <= 0) throw new BadRequestException('所选磅单缺少有效净重');
    if (purpose === 'SHIPPING' || purpose === 'RECEIVING') {
      if (ticket.weighingStage !== purpose) throw new BadRequestException('采信磅单必须属于对应的发货或收货节点');
      const result = await this.setStageSelection(waybillId, ticket, waybill.dispatchNotice.type, reason, userId);
      await this.syncTaskForWaybill(waybillId, userId);
      return result;
    }
    if (purpose === 'SETTLEMENT') {
      const activeStageTickets = await this.prisma.weighTicket.count({ where: { waybillId, weighingStage: ticket.weighingStage, deletedAt: null, status: { not: 'VOIDED' } } });
      const stageSelection = await this.prisma.waybillWeightSelection.findFirst({ where: { waybillId, purpose: ticket.weighingStage, isCurrent: true } });
      if (activeStageTickets > 1 && stageSelection?.weighTicketId !== ticket.id) {
        throw new BadRequestException(`该${ticket.weighingStage === 'SHIPPING' ? '发货' : '收货'}节点有多张磅单，请先确定采信磅单`);
      }
    }
    const selections = waybill.dispatchNotice?.type === 'SALES'
      ? await this.setSalesSelection(waybillId, ticket, purpose || (ticket.weighingStage === 'RECEIVING' ? 'SETTLEMENT' : 'INVENTORY'), reason, userId)
      : await this.setPurchaseSelection(waybillId, ticket, purpose || 'INVENTORY', reason, userId);
    await this.syncTaskForWaybill(waybillId, userId);
    return selections;
  }

  private async upsertStageSelection(
    tx: Prisma.TransactionClient,
    waybillId: string,
    ticket: { id: string; netWeight: unknown; weighingStage: string },
    reason: string,
    userId: string,
  ) {
    const purpose = ticket.weighingStage;
    const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose, isCurrent: true } });
    if (current?.weighTicketId === ticket.id) {
      if (current.reason === AUTO_STAGE_SELECTION_REASON && reason !== AUTO_STAGE_SELECTION_REASON) {
        return tx.waybillWeightSelection.update({ where: { id: current.id }, data: { reason, selectedBy: userId, selectedAt: new Date() } });
      }
      return current;
    }
    await tx.waybillWeightSelection.updateMany({ where: { waybillId, purpose, isCurrent: true }, data: { isCurrent: false } });
    return tx.waybillWeightSelection.create({ data: { waybillId, purpose, weighTicketId: ticket.id, quantity: Number(ticket.netWeight), reason, selectedBy: userId } });
  }

  private async restoreUniqueStageSelection(waybillId: string, stage: string, userId: string) {
    const tickets = await this.prisma.weighTicket.findMany({ where: { waybillId, weighingStage: stage, deletedAt: null, status: { not: 'VOIDED' } }, select: { id: true, netWeight: true, status: true, weighingStage: true } });
    if (tickets.length !== 1 || tickets[0].status !== 'REVIEWED' || Number(tickets[0].netWeight || 0) <= 0) return;
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'weigh-selection:' + waybillId}, 0))::text`;
      const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose: stage, isCurrent: true } });
      if (!current) await this.upsertStageSelection(tx, waybillId, tickets[0], AUTO_STAGE_SELECTION_REASON, userId);
    });
  }

  private async setStageSelection(
    waybillId: string,
    ticket: { id: string; netWeight: unknown; weighingStage: string },
    businessType: string,
    reason: string | undefined,
    userId: string,
  ) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'weigh-selection:' + waybillId}, 0))::text`;
      const stage = ticket.weighingStage;
      const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose: stage, isCurrent: true } });
      const normalizedReason = reason?.trim();
      if (current?.weighTicketId !== ticket.id && current && !normalizedReason) throw new BadRequestException('更换采信磅单须填写变更原因');
      const isOurSide = (businessType === 'PURCHASE' && stage === 'RECEIVING') || (businessType === 'SALES' && stage === 'SHIPPING');
      const completedSales = businessType === 'SALES' && stage === 'RECEIVING'
        ? await tx.waybill.findFirst({ where: { id: waybillId, salesCompletionConfirmedAt: { not: null } }, select: {
          salesCompletionCustomerTicketId: true, salesCompletionShippingWeight: true, salesCompletionRemarks: true,
        } }) : null;
      if (completedSales && completedSales.salesCompletionCustomerTicketId !== ticket.id && !normalizedReason) {
        throw new BadRequestException('更正已确认的客户收货磅单须填写原因');
      }
      if (current?.weighTicketId !== ticket.id) {
        const confirmedLine = await tx.financialSettlementLine.findFirst({ where: { waybillLineItem: { waybillId }, settlement: { status: { notIn: ['DRAFT', 'VOIDED'] }, deletedAt: null } }, select: { id: true } });
        if (confirmedLine) throw new BadRequestException('该运单已有正式结算，不能直接更换采信磅单；请先处理结算更正');
      }
      if (isOurSide) {
        const inventory = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose: 'INVENTORY', isCurrent: true } });
        if (inventory?.weighTicketId !== ticket.id) {
          if (inventory && !normalizedReason) throw new BadRequestException('更换我方出入库磅单须填写原因');
          if (businessType === 'SALES') {
            const posted = await tx.outboundReceipt.findFirst({ where: { waybillId, status: { in: ['POSTED', 'READY', 'VARIANCE_PENDING'] }, deletedAt: null }, select: { receiptNo: true } });
            if (posted) throw new BadRequestException('出库已拣配或过账，不能直接更换我方发货磅单；请走出库更正流程');
          } else {
            const posted = await tx.inboundReceipt.findFirst({ where: { waybillId, status: { in: ['RECEIVED', 'POSTED'] }, deletedAt: null }, select: { receiptNo: true } });
            if (posted) throw new BadRequestException('入库已确认收货或过账，不能直接更换我方收货磅单；请走入库更正流程');
          }
          await tx.waybillWeightSelection.updateMany({ where: { waybillId, purpose: 'INVENTORY', isCurrent: true }, data: { isCurrent: false } });
          await tx.waybillWeightSelection.create({ data: { waybillId, purpose: 'INVENTORY', weighTicketId: ticket.id, quantity: Number(ticket.netWeight), reason: normalizedReason || '采信我方磅单并作为出入库依据', selectedBy: userId } });
          if (businessType === 'SALES') await tx.outboundReceipt.updateMany({ where: { waybillId, status: 'PENDING', deletedAt: null }, data: { weighTicketId: ticket.id } });
          else await tx.inboundReceipt.updateMany({ where: { waybillId, status: 'PENDING', deletedAt: null }, data: { weighTicketId: ticket.id, receivedQuantity: Number(ticket.netWeight) } });
        }
      }
      const selection = await this.upsertStageSelection(tx, waybillId, ticket, normalizedReason || '经办人确认采信磅单', userId);
      if (completedSales && completedSales.salesCompletionCustomerTicketId !== ticket.id) {
        await tx.waybill.update({ where: { id: waybillId }, data: {
          salesCompletionCustomerTicketId: ticket.id,
          salesCompletionCustomerWeight: Number(ticket.netWeight),
          salesCompletionWeightVariance: completedSales.salesCompletionShippingWeight == null ? null
            : new Prisma.Decimal(ticket.netWeight as Prisma.Decimal.Value).minus(completedSales.salesCompletionShippingWeight),
          salesCompletionRemarks: [completedSales.salesCompletionRemarks, `客户收货采信磅单更正：${normalizedReason}`].filter(Boolean).join('\n'),
        } });
      }
      return [selection];
    });
  }

  private async setSalesSelection(waybillId: string, ticket: { id: string; netWeight: unknown; weighingStage: string }, purpose: string, reason: string | undefined, userId: string) {
    if (purpose === 'INVENTORY' && ticket.weighingStage !== 'SHIPPING') throw new BadRequestException('销售出库依据应选择我方发货磅单，客户收货磅单可用于销售货款结算');
    return this.prisma.$transaction(async tx => {
      const key = 'weigh-selection:' + waybillId;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose, isCurrent: true } });
      if (current?.weighTicketId === ticket.id) return [current];
      if (current && !reason?.trim()) throw new BadRequestException('更换磅单必须填写变更原因');
      if (purpose === 'INVENTORY') {
        const posted = await tx.outboundReceipt.findFirst({ where: { waybillId, status: { in: ['POSTED', 'READY', 'VARIANCE_PENDING'] }, deletedAt: null }, select: { receiptNo: true } });
        if (posted) throw new BadRequestException('出库已过账或完成拣配，不能直接更换我方出库磅单；请先处理出库更正');
      } else if (current && await tx.financialSettlementLine.count({ where: { weightSelectionId: current.id, settlement: { direction: 'RECEIVABLE', status: { notIn: ['DRAFT', 'VOIDED'] }, deletedAt: null } } })) {
        throw new BadRequestException('该销售货款依据已被确认结算引用，请先处理关联结算更正');
      }
      await tx.waybillWeightSelection.updateMany({ where: { waybillId, purpose, isCurrent: true }, data: { isCurrent: false } });
      const selection = await tx.waybillWeightSelection.create({ data: { waybillId, purpose, weighTicketId: ticket.id, quantity: Number(ticket.netWeight), reason: reason?.trim() || '系统按销售业务节点默认选用', selectedBy: userId }, include: {
        weighTicket: { select: { id: true, ticketNo: true, weighingStage: true, sequence: true, netWeight: true } }, selector: { select: { id: true, name: true } },
      } });
      if (purpose === 'INVENTORY') {
        await tx.outboundReceipt.updateMany({ where: { waybillId, status: 'PENDING', deletedAt: null }, data: { weighTicketId: ticket.id } });
        if (reason?.trim() !== AUTO_STAGE_SELECTION_REASON) await this.upsertStageSelection(tx, waybillId, ticket, reason?.trim() || '经办人确认采信我方发货磅单', userId);
      }
      return [selection];
    });
  }

  private async setPurchaseSelection(
    waybillId: string,
    ticket: { id: string; netWeight: unknown; weighingStage: string },
    purpose: string,
    reason: string | undefined,
    userId: string,
  ) {
    const normalizedReason = reason?.trim();
    if (ticket.weighingStage === 'SHIPPING' && purpose === 'INVENTORY') {
      throw new BadRequestException('采购入库只能采用我方收货采信磅单；供应商发货磅单可作为货款结算依据');
    }
    return this.prisma.$transaction(async tx => {
      const key = 'weigh-selection:' + waybillId;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId, purpose, isCurrent: true } });
      if (current?.weighTicketId === ticket.id) return [current];
      if (current && !normalizedReason) throw new BadRequestException('更换已选磅单必须填写变更原因');
      if (purpose === 'INVENTORY') {
        const posted = await tx.inboundReceipt.findFirst({ where: { waybillId, status: { in: ['RECEIVED', 'POSTED'] }, deletedAt: null }, select: { receiptNo: true } });
        if (posted) throw new BadRequestException(`入库单 ${posted.receiptNo} 已确认收货或过账，不能直接更换库存磅单，请走入库更正`);
      } else if (current && await tx.financialSettlementLine.count({ where: { weightSelectionId: current.id, settlement: { direction: 'PAYABLE', status: { notIn: ['DRAFT', 'VOIDED'] }, deletedAt: null } } })) {
        throw new BadRequestException('该采购货款磅单已被确认结算引用，请先处理关联结算更正');
      }
      await tx.waybillWeightSelection.updateMany({ where: { waybillId, purpose, isCurrent: true }, data: { isCurrent: false } });
      const selection = await tx.waybillWeightSelection.create({
        data: { waybillId, purpose, weighTicketId: ticket.id, quantity: Number(ticket.netWeight), reason: normalizedReason || (purpose === 'INVENTORY' ? '我方收货磅单作为库存依据' : '结算经办人确认货款计量依据'), selectedBy: userId },
        include: {
          weighTicket: { select: { id: true, ticketNo: true, weighingStage: true, sequence: true, netWeight: true } },
          selector: { select: { id: true, name: true } },
        },
      });
      if (purpose === 'INVENTORY') {
        await tx.inboundReceipt.updateMany({ where: { waybillId, status: 'PENDING', deletedAt: null }, data: { weighTicketId: ticket.id, receivedQuantity: Number(ticket.netWeight) } });
        if (ticket.weighingStage === 'RECEIVING' && normalizedReason !== AUTO_STAGE_SELECTION_REASON) await this.upsertStageSelection(tx, waybillId, ticket, normalizedReason || '经办人确认采信我方收货磅单', userId);
      }
      return [selection];
    });
  }

  private async applyDefaultSelections(weighTicketId: string, userId: string) {
    const ticket = await this.prisma.weighTicket.findUniqueOrThrow({
      where: { id: weighTicketId },
      select: {
        id: true, waybillId: true, weighingStage: true, netWeight: true,
        waybill: { select: { dispatchNotice: { select: { type: true } } } },
      },
    });
    const quantity = Number(ticket.netWeight || 0);
    if (quantity <= 0) return;
    const activeTicketCount = await this.prisma.weighTicket.count({ where: { waybillId: ticket.waybillId, weighingStage: ticket.weighingStage, deletedAt: null, status: { not: 'VOIDED' } } });
    if (activeTicketCount === 1) {
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'weigh-selection:' + ticket.waybillId}, 0))::text`;
        const current = await tx.waybillWeightSelection.findFirst({ where: { waybillId: ticket.waybillId, purpose: ticket.weighingStage, isCurrent: true } });
        if (!current) await this.upsertStageSelection(tx, ticket.waybillId, ticket, AUTO_STAGE_SELECTION_REASON, userId);
      });
    }
    if (ticket.waybill.dispatchNotice.type === 'SALES') {
      if (ticket.weighingStage !== 'SHIPPING') return;
      const purpose = 'INVENTORY';
      const current = await this.prisma.waybillWeightSelection.findFirst({ where: { waybillId: ticket.waybillId, purpose, isCurrent: true } });
      if (!current && activeTicketCount === 1) await this.setSalesSelection(ticket.waybillId, ticket, purpose, AUTO_STAGE_SELECTION_REASON, userId);
      return;
    }
    // 采购收货磅单可默认用于我方库存；供应商发货磅单不得静默代替我方现场凭证。
    // 货款结算磅单总由结算经办人在结算环节单独确定。
    if (ticket.weighingStage !== 'RECEIVING') return;
    const current = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: ticket.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (current) return;
    // 只有一张我方有效收货磅单时，默认用于库存；多张时明确选择。
    if (activeTicketCount === 1) {
      await this.setPurchaseSelection(ticket.waybillId, ticket, 'INVENTORY', AUTO_STAGE_SELECTION_REASON, userId);
    }
  }

  private assertStageAllowed(weighingStage: string, waybillStatus: string) {
    if (!WEIGHING_STAGES.includes(weighingStage)) throw new BadRequestException('称重节点无效');
    if (waybillStatus === 'CANCELLED') throw new BadRequestException('已取消物流运单不能创建或关联磅单');
    if (weighingStage === 'RECEIVING' && !['ARRIVED', 'SIGNED'].includes(waybillStatus)) {
      throw new BadRequestException('物流运单到达后才能创建或关联收货称重磅单');
    }
    if (weighingStage === 'SHIPPING' && !['PENDING', 'IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(waybillStatus)) {
      throw new BadRequestException('当前物流运单状态不能创建或关联发货称重磅单');
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
    const netWeight = grossWeight !== null && tareWeight !== null ? calculateNetWeight(grossWeight, tareWeight) : null;
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
    const varianceWeight = netWeight === null ? null : normalizeWeight(netWeight - planned);
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
