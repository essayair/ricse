import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateWaybillDto } from './dto/create-waybill.dto';

@Injectable()
export class WaybillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly inventoryService: InventoryService,
  ) {}

  private readonly include = {
    dispatchNotice: {
      include: {
        order: {
          include: {
            contract: { select: { id: true, contractNo: true, title: true } },
          },
        },
        warehouse: { select: { id: true, code: true, name: true, address: true } },
      },
    },
    vehicle: { select: { id: true, plateNo: true, driverName: true, driverPhone: true, loadCapacity: true } },
    carrierPartner: { select: { id: true, code: true, name: true, roles: true } },
    creator: { select: { id: true, name: true } },
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    weighTickets: {
      where: { deletedAt: null },
      select: {
        id: true, ticketNo: true, status: true, netWeight: true,
        settlementWeight: true, abnormal: true,
      },
      orderBy: { createdAt: 'desc' as const },
    },
    attachments: { orderBy: { createdAt: 'desc' as const } },
    outboundReceipts: {
      where: { deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, receiptNo: true, status: true },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private async generateNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.waybill.count({ where: { createdAt: { gte: start, lt: end } } });
    return `WB-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private async resolveCarrier(freightMode?: string, carrierPartnerId?: string) {
    if ((freightMode || 'SELF') !== 'THIRD_PARTY') return null;
    if (!carrierPartnerId) throw new BadRequestException('第三方承运必须选择已维护的物流承运商');
    const profile = await this.prisma.serviceOrganization.findFirst({
      where: {
        partnerId: carrierPartnerId,
        organizationType: 'LOGISTICS_CARRIER',
        status: 'ACTIVE',
        deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    if (!profile) throw new BadRequestException('所选物流承运商不存在、已停用或合作伙伴不具备供应商角色');
    return profile.partner;
  }

  async getNoticeAvailability(dispatchNoticeId: string, userId: string, permission = 'logistics.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getDispatchNoticeScope(userId);
    const notice = await this.prisma.dispatchNotice.findFirst({
      where: { id: dispatchNoticeId, deletedAt: null, AND: [scope] },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        order: { include: { contract: true } },
        warehouse: true,
      },
    });
    if (!notice) throw new NotFoundException('执行通知不存在');
    if (!['ISSUED', 'IN_PROGRESS'].includes(notice.status)) {
      throw new BadRequestException('仅已下达或执行中的通知可以建立物流运单');
    }
    const used = await this.prisma.waybillLineItem.groupBy({
      by: ['dispatchNoticeLineItemId'],
      where: { waybill: { dispatchNoticeId, deletedAt: null, status: { not: 'CANCELLED' } } },
      _sum: { quantity: true },
    });
    const map = new Map(used.map(item => [item.dispatchNoticeLineItemId, Number(item._sum.quantity || 0)]));
    return {
      notice,
      lineItems: notice.lineItems.map(item => ({
        dispatchNoticeLineItemId: item.id,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        noticeQuantity: Number(item.quantity),
        waybillQuantity: map.get(item.id) || 0,
        availableQuantity: Math.max(0, Number(item.quantity) - (map.get(item.id) || 0)),
      })),
    };
  }

  async create(dto: CreateWaybillDto, userId: string) {
    const availability = await this.getNoticeAvailability(dto.dispatchNoticeId, userId, 'logistics.manage');
    const carrier = await this.resolveCarrier(dto.freightMode, dto.carrierPartnerId);
    if (!dto.lineItems.length) throw new BadRequestException('请至少填写一条运单明细');
    if (dto.plannedDepartureAt && dto.plannedArrivalAt
      && new Date(dto.plannedArrivalAt) <= new Date(dto.plannedDepartureAt)) {
      throw new BadRequestException('预计到达时间必须晚于计划发运时间');
    }
    let vehicle: any = null;
    if (dto.vehicleId) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, status: 'ACTIVE', deletedAt: null },
      });
      if (!vehicle) throw new BadRequestException('所选车辆不存在或不可用');
    }
    const sources = new Map(availability.lineItems.map(item => [item.dispatchNoticeLineItemId, item]));
    const seen = new Set<string>();
    const lines = dto.lineItems.map(item => {
      const source = sources.get(item.dispatchNoticeLineItemId);
      if (!source || seen.has(item.dispatchNoticeLineItemId)) throw new BadRequestException('运单明细无效或重复');
      seen.add(item.dispatchNoticeLineItemId);
      if (item.quantity <= 0 || item.quantity > source.availableQuantity) {
        throw new BadRequestException(`物料 ${source.materialName || source.materialId} 的运单数量超过剩余可运输数量 ${source.availableQuantity}`);
      }
      return {
        dispatchNoticeLineItemId: item.dispatchNoticeLineItemId,
        materialId: source.materialId,
        materialName: source.materialName,
        quantity: item.quantity,
        unit: source.unit,
      };
    });
    const notice = availability.notice;
    return this.prisma.waybill.create({
      data: {
        waybillNo: await this.generateNo(),
        dispatchNoticeId: notice.id,
        freightMode: dto.freightMode || 'SELF',
        vehicleId: dto.vehicleId || null,
        carrierPartnerId: carrier?.id || null,
        carrierName: carrier?.name || null,
        plateNo: dto.plateNo || vehicle?.plateNo,
        driverName: dto.driverName || vehicle?.driverName,
        driverPhone: dto.driverPhone || vehicle?.driverPhone,
        originLocation: dto.originLocation || notice.originLocation || notice.warehouse?.address,
        destinationLocation: dto.destinationLocation || notice.destinationLocation,
        totalQuantity: lines.reduce((sum, item) => sum + Number(item.quantity), 0),
        plannedDepartureAt: dto.plannedDepartureAt ? new Date(dto.plannedDepartureAt) : null,
        plannedArrivalAt: dto.plannedArrivalAt ? new Date(dto.plannedArrivalAt) : null,
        remarks: dto.remarks,
        createdBy: userId,
        lineItems: { create: lines },
      },
      include: this.include,
    });
  }

  async findAll(params: { status?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.view');
    const scope = await this.accessControl.getWaybillScope(userId);
    const where: Prisma.WaybillWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { waybillNo: { contains: params.search, mode: 'insensitive' } },
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { dispatchNotice: { noticeNo: { contains: params.search, mode: 'insensitive' } } },
        { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    const items = await this.prisma.waybill.findMany({
      where, include: this.include, take: 100, orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async findOne(id: string, userId: string, permission = 'logistics.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWaybillScope(userId);
    const waybill = await this.prisma.waybill.findFirst({
      where: { id, deletedAt: null, AND: [scope] }, include: this.include,
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    return waybill;
  }

  async assign(id: string, data: {
    freightMode?: string; vehicleId?: string; carrierPartnerId?: string; carrierName?: string;
    plateNo?: string; driverName?: string; driverPhone?: string;
    plannedDepartureAt?: string; plannedArrivalAt?: string;
  }, userId: string) {
    const waybill = await this.findOne(id, userId, 'logistics.manage');
    if (waybill.status !== 'PENDING') throw new BadRequestException('仅待发运的物流运单可以调整车辆');
    const departureAt = data.plannedDepartureAt ? new Date(data.plannedDepartureAt) : waybill.plannedDepartureAt;
    const arrivalAt = data.plannedArrivalAt ? new Date(data.plannedArrivalAt) : waybill.plannedArrivalAt;
    if (departureAt && arrivalAt && arrivalAt <= departureAt) {
      throw new BadRequestException('预计到达时间必须晚于计划发运时间');
    }
    const freightMode = data.freightMode || waybill.freightMode;
    const carrier = await this.resolveCarrier(
      freightMode,
      data.carrierPartnerId ?? waybill.carrierPartnerId ?? undefined,
    );
    let vehicle: any = null;
    if (data.vehicleId) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: { id: data.vehicleId, status: 'ACTIVE', deletedAt: null },
      });
      if (!vehicle) throw new BadRequestException('所选车辆不存在或不可用');
    }
    return this.prisma.waybill.update({
      where: { id },
      data: {
        freightMode,
        vehicleId: data.vehicleId,
        carrierPartnerId: carrier?.id || null,
        carrierName: carrier?.name || null,
        plateNo: data.plateNo || vehicle?.plateNo,
        driverName: data.driverName || vehicle?.driverName,
        driverPhone: data.driverPhone || vehicle?.driverPhone,
        plannedDepartureAt: data.plannedDepartureAt ? new Date(data.plannedDepartureAt) : undefined,
        plannedArrivalAt: data.plannedArrivalAt ? new Date(data.plannedArrivalAt) : undefined,
      },
      include: this.include,
    });
  }

  async updateStatus(id: string, status: string, userId: string) {
    const waybill = await this.findOne(id, userId, 'logistics.manage');
    const allowed: Record<string, string[]> = {
      PENDING: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['ARRIVED'],
      ARRIVED: ['SIGNED'],
    };
    if (!(allowed[waybill.status] || []).includes(status)) {
      throw new BadRequestException(`不能从 ${waybill.status} 变更为 ${status}`);
    }
    if (status === 'CANCELLED' && waybill.outboundReceipts.length) {
      throw new BadRequestException('已有有效物流出库单，不能取消物流运单');
    }
    if (status === 'IN_TRANSIT' && (!waybill.plateNo || !waybill.driverName)) {
      throw new BadRequestException('发运前必须完成车辆、车牌和司机调度信息');
    }
    if (status === 'IN_TRANSIT' && waybill.freightMode === 'THIRD_PARTY' && !waybill.carrierPartnerId) {
      throw new BadRequestException('第三方承运运单发运前必须填写承运单位');
    }
    if (
      status === 'IN_TRANSIT'
      && waybill.dispatchNotice.type === 'SALES'
      && waybill.dispatchNotice.mode === 'STANDARD'
      && !waybill.outboundReceipts.some(item => item.status === 'POSTED')
    ) {
      throw new BadRequestException('销售常规出库必须先完成物流出库和库存扣减');
    }
    if (status === 'SIGNED' && !(waybill.attachments || []).some(item => item.category === 'RECEIPT')) {
      throw new BadRequestException('确认签收前必须上传至少一份物流收货附件');
    }
    const updated = await this.prisma.$transaction(async tx => {
      const updated = await tx.waybill.update({
        where: { id },
        data: {
          status,
          departedAt: status === 'IN_TRANSIT' ? new Date() : undefined,
          arrivedAt: status === 'ARRIVED' ? new Date() : undefined,
          signedAt: status === 'SIGNED' ? new Date() : undefined,
        },
        include: this.include,
      });
      if (status === 'IN_TRANSIT' && waybill.dispatchNotice.status === 'ISSUED') {
        await tx.dispatchNotice.update({ where: { id: waybill.dispatchNoticeId }, data: { status: 'IN_PROGRESS' } });
      }
      return updated;
    });
    if (
      waybill.dispatchNotice.type === 'PURCHASE'
      && ['IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(status)
    ) {
      await this.inventoryService.ensurePendingReceiptForWaybill(id, userId);
    }
    return updated;
  }

  async remove(id: string, userId: string) {
    const waybill = await this.findOne(id, userId, 'logistics.manage');
    if (!['PENDING', 'CANCELLED'].includes(waybill.status)) {
      throw new BadRequestException('仅待发运或已取消物流运单可以删除');
    }
    return this.prisma.waybill.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async createAttachment(data: {
    waybillId: string; fileName: string; originalName: string;
    mimeType: string; size: number;
  }, userId: string) {
    const waybill = await this.findOne(data.waybillId, userId, 'logistics.manage');
    if (!['ARRIVED', 'SIGNED'].includes(waybill.status)) {
      throw new BadRequestException('物流收货附件只能在运单到达后上传');
    }
    return this.prisma.attachment.create({ data: { ...data, category: 'RECEIPT' } });
  }

  async findAttachmentById(id: string, userId: string, permission = 'logistics.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWaybillScope(userId);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        waybillId: { not: null },
        category: 'RECEIPT',
        waybill: { deletedAt: null, AND: [scope] },
      },
      include: { waybill: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.findAttachmentById(id, userId, 'logistics.manage');
    if (!attachment) return null;
    if (attachment.waybill?.status === 'SIGNED') {
      throw new BadRequestException('已签收运单的收货附件不能删除');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }
}
