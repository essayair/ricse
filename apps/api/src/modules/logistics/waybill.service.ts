import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../inventory/outbound.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';
import { BatchCreateWaybillDto, BatchWaybillItemDto, CreateWaybillDto } from './dto/create-waybill.dto';

export const WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES = [
  'RECEIPT_DOCUMENT',
  'RECEIPT_PHOTO',
  'RECEIPT_OTHER',
] as const;

export const WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES_WITH_LEGACY = [
  'RECEIPT',
  ...WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES,
] as const;

export type WaybillReceiptAttachmentCategory = typeof WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES[number];

export function isWaybillReceiptAttachment(category: string) {
  return (WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES_WITH_LEGACY as readonly string[]).includes(category);
}

@Injectable()
export class WaybillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly inventoryService: InventoryService,
    private readonly outboundService: OutboundService,
    private readonly qualityService: QualityInspectionService,
    private readonly weighService: WeighTicketService,
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
    driver: { select: { id: true, name: true, phone: true, licenseNo: true, licenseClass: true } },
    carrierPartner: { select: { id: true, code: true, name: true, roles: true } },
    creator: { select: { id: true, name: true } },
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    weighTickets: {
      where: { deletedAt: null },
      select: {
        id: true, ticketNo: true, status: true, netWeight: true,
        settlementWeight: true, abnormal: true, weighingStage: true,
        sequence: true, isSupplementary: true, additionReason: true,
        ticketDate: true, reviewedAt: true,
      },
      orderBy: [{ weighingStage: 'asc' as const }, { sequence: 'asc' as const }],
    },
    weightSelections: {
      where: { isCurrent: true },
      select: {
        id: true, purpose: true, weighTicketId: true, quantity: true,
        reason: true, selectedAt: true,
        selector: { select: { id: true, name: true } },
      },
      orderBy: { selectedAt: 'desc' as const },
    },
    attachments: { orderBy: { createdAt: 'desc' as const } },
    qualityTask: {
      select: {
        id: true, taskNo: true, status: true, finalConclusion: true,
        plannedReportCount: true, finalizedReportCount: true,
        _count: { select: { reports: true } },
      },
    },
    weighTask: {
      include: {
        attachments: { orderBy: { createdAt: 'desc' as const } },
      },
    },
    outboundReceipts: {
      where: { deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, receiptNo: true, status: true },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private async reserveWaybillNumbers(tx: Prisma.TransactionClient, amount: number) {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // Advisory lock returns PostgreSQL `void`; execute it without asking Prisma
    // to deserialize a result set. This keeps concurrent batch numbering safe
    // without triggering "Failed to deserialize column of type 'void'".
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`RICSE_WAYBILL_${date}`}))`);
    const count = await tx.waybill.count({ where: { createdAt: { gte: start, lt: end } } });
    return Array.from({ length: amount }, (_, index) => `WB-${date}-${String(count + index + 1).padStart(4, '0')}`);
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

  private validateVehicleAssignment(vehicle: { ownerType: string; ownerId: string | null }, freightMode: string, carrier: { id: string } | null) {
    if (freightMode === 'SELF' && vehicle.ownerType !== 'SELF') {
      throw new BadRequestException('自有运力只能选择自有车辆');
    }
    if (freightMode === 'THIRD_PARTY') {
      if (vehicle.ownerType !== 'OUTSOURCED') throw new BadRequestException('第三方承运只能选择外协车辆');
      if (!carrier || vehicle.ownerId !== carrier.id) throw new BadRequestException('所选车辆不属于当前物流承运商');
    }
  }

  private validateDriverAssignment(driver: {
    serviceOrganization: { partnerId: string; partner: { isInternal: boolean } };
  }, freightMode: string, carrier: { id: string } | null) {
    if (freightMode === 'SELF' && !driver.serviceOrganization.partner.isInternal) {
      throw new BadRequestException('自有运力只能选择内部物流服务商维护的司机');
    }
    if (freightMode === 'THIRD_PARTY' && (!carrier || driver.serviceOrganization.partnerId !== carrier.id)) {
      throw new BadRequestException('所选司机不属于当前物流承运商');
    }
  }

  private async findAvailableDriver(driverId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: {
        id: driverId,
        status: 'ACTIVE',
        deletedAt: null,
        serviceOrganization: {
          organizationType: 'LOGISTICS_CARRIER',
          status: 'ACTIVE',
          deletedAt: null,
          partner: { status: 'ACTIVE', deletedAt: null },
        },
      },
      include: { serviceOrganization: { include: { partner: { select: { isInternal: true } } } } },
    });
    if (!driver) throw new BadRequestException('所选司机不存在或不可用');
    return driver;
  }

  private async prepareBatchItem(
    item: BatchWaybillItemDto,
    rowNumber: number,
    availability: Awaited<ReturnType<WaybillService['getNoticeAvailability']>>,
  ) {
    const freightMode = item.freightMode || 'SELF';
    const carrier = await this.resolveCarrier(freightMode, item.carrierPartnerId);
    if (!item.lineItems.length) throw new BadRequestException(`第 ${rowNumber} 行请至少填写一种物料数量`);
    if (item.plannedDepartureAt && item.plannedArrivalAt
      && new Date(item.plannedArrivalAt) <= new Date(item.plannedDepartureAt)) {
      throw new BadRequestException(`第 ${rowNumber} 行预计到达时间必须晚于计划发运时间`);
    }

    let vehicle: any = null;
    if (item.vehicleId) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: { id: item.vehicleId, status: 'ACTIVE', deletedAt: null },
      });
      if (!vehicle) throw new BadRequestException(`第 ${rowNumber} 行所选车辆不存在或不可用`);
      this.validateVehicleAssignment(vehicle, freightMode, carrier);
    }
    let driver: any = null;
    if (item.driverId) {
      driver = await this.findAvailableDriver(item.driverId);
      this.validateDriverAssignment(driver, freightMode, carrier);
    }

    const plateNo = (item.plateNo || vehicle?.plateNo || '').trim().toUpperCase();
    const driverName = (item.driverName || driver?.name || vehicle?.driverName || '').trim();
    const driverPhone = (item.driverPhone || driver?.phone || vehicle?.driverPhone || '').trim();
    if (!plateNo) throw new BadRequestException(`第 ${rowNumber} 行请选择车辆或填写临时车牌号`);
    if (!driverName) throw new BadRequestException(`第 ${rowNumber} 行请选择司机或填写临时司机姓名`);
    if (!driverPhone) throw new BadRequestException(`第 ${rowNumber} 行请填写司机联系电话`);

    const sources = new Map(availability.lineItems.map(source => [source.dispatchNoticeLineItemId, source]));
    const seen = new Set<string>();
    const lineItems = item.lineItems.map(line => {
      const source = sources.get(line.dispatchNoticeLineItemId);
      if (!source || seen.has(line.dispatchNoticeLineItemId)) {
        throw new BadRequestException(`第 ${rowNumber} 行运单明细无效或重复`);
      }
      seen.add(line.dispatchNoticeLineItemId);
      if (line.quantity <= 0) throw new BadRequestException(`第 ${rowNumber} 行物料数量必须大于 0`);
      return {
        dispatchNoticeLineItemId: line.dispatchNoticeLineItemId,
        materialId: source.materialId,
        materialName: source.materialName,
        quantity: line.quantity,
        unit: source.unit,
      };
    });
    return {
      clientRowId: item.clientRowId,
      freightMode,
      carrier,
      vehicle,
      driver,
      plateNo,
      driverName,
      driverPhone,
      lineItems,
      totalQuantity: lineItems.reduce((sum, line) => sum + Number(line.quantity), 0),
      plannedDepartureAt: item.plannedDepartureAt ? new Date(item.plannedDepartureAt) : null,
      plannedArrivalAt: item.plannedArrivalAt ? new Date(item.plannedArrivalAt) : null,
      originLocation: item.originLocation || availability.notice.originLocation || availability.notice.warehouse?.address,
      destinationLocation: item.destinationLocation || availability.notice.destinationLocation,
      remarks: item.remarks?.trim() || null,
    };
  }

  private async syncCreatedWaybill(waybill: any, userId: string) {
    if (waybill.vehicleId || waybill.plateNo) {
      await this.weighService.ensureTaskForWaybill(waybill.id, userId);
    }
    if (waybill.dispatchNotice?.type === 'SALES' && waybill.dispatchNotice?.mode === 'STANDARD') {
      await this.outboundService.ensureReceiptForWaybill(waybill.id, userId);
    }
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
    const freightMode = dto.freightMode || 'SELF';
    const carrier = await this.resolveCarrier(freightMode, dto.carrierPartnerId);
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
      this.validateVehicleAssignment(vehicle, freightMode, carrier);
    }
    let driver: any = null;
    if (dto.driverId) {
      driver = await this.findAvailableDriver(dto.driverId);
      this.validateDriverAssignment(driver, freightMode, carrier);
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
    const created = await this.prisma.$transaction(async tx => {
      const [waybillNo] = await this.reserveWaybillNumbers(tx, 1);
      return tx.waybill.create({
        data: {
          waybillNo,
          dispatchNoticeId: notice.id,
          freightMode,
          vehicleId: dto.vehicleId || null,
          driverId: dto.driverId || null,
          carrierPartnerId: carrier?.id || null,
          carrierName: carrier?.name || null,
          plateNo: dto.plateNo || vehicle?.plateNo,
          driverName: dto.driverName || driver?.name || vehicle?.driverName,
          driverPhone: dto.driverPhone || driver?.phone || vehicle?.driverPhone,
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
    });
    await this.syncCreatedWaybill(created, userId);
    if (notice.type === 'SALES' && notice.mode === 'STANDARD') {
      return this.findOne(created.id, userId, 'logistics.manage');
    }
    return created;
  }

  async createBatch(dto: BatchCreateWaybillDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.manage');
    const existing = await this.prisma.waybill.findMany({
      where: { creationBatchId: dto.batchRequestId },
      include: this.include,
      orderBy: { createdAt: 'asc' },
    });
    if (existing.length) {
      if (existing.some(item => item.createdBy !== userId || item.dispatchNoticeId !== dto.dispatchNoticeId)
        || existing.length !== dto.items.length) {
        throw new BadRequestException('批量建单请求标识已被使用，请刷新页面后重试');
      }
      for (const waybill of existing) await this.syncCreatedWaybill(waybill, userId);
      return { batchRequestId: dto.batchRequestId, createdCount: existing.length, warnings: [], items: existing };
    }

    const rowIds = new Set(dto.items.map(item => item.clientRowId));
    if (rowIds.size !== dto.items.length) throw new BadRequestException('批量建单行标识不能重复');
    const availability = await this.getNoticeAvailability(dto.dispatchNoticeId, userId, 'logistics.manage');
    const prepared = await Promise.all(dto.items.map((item, index) => this.prepareBatchItem(item, index + 1, availability)));

    const sourceMap = new Map(availability.lineItems.map(item => [item.dispatchNoticeLineItemId, item]));
    const totals = new Map<string, number>();
    for (const item of prepared) {
      for (const line of item.lineItems) {
        totals.set(line.dispatchNoticeLineItemId, (totals.get(line.dispatchNoticeLineItemId) || 0) + Number(line.quantity));
      }
    }
    for (const [lineId, quantity] of totals) {
      const source = sourceMap.get(lineId)!;
      if (quantity > source.availableQuantity) {
        throw new BadRequestException(`物料 ${source.materialName || source.materialId} 本次分配 ${quantity}，超过剩余可运输数量 ${source.availableQuantity}`);
      }
    }

    const warnings: string[] = [];
    prepared.forEach((item, index) => {
      if (item.vehicle?.loadCapacity && item.totalQuantity > Number(item.vehicle.loadCapacity)) {
        warnings.push(`第 ${index + 1} 行计划数量 ${item.totalQuantity} 吨超过车辆登记载重 ${Number(item.vehicle.loadCapacity)} 吨`);
      }
      const duplicateIndex = prepared.findIndex((candidate, candidateIndex) => candidateIndex < index
        && candidate.plateNo === item.plateNo
        && (!candidate.plannedDepartureAt || !item.plannedDepartureAt
          || candidate.plannedDepartureAt.getTime() === item.plannedDepartureAt.getTime()));
      if (duplicateIndex >= 0) warnings.push(`第 ${duplicateIndex + 1}、${index + 1} 行使用同一车辆 ${item.plateNo}，请核对是否为不同运输趟次`);
    });

    const created = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "dispatch_notices" WHERE id = ${dto.dispatchNoticeId} FOR UPDATE`);
      const notice = await tx.dispatchNotice.findFirst({
        where: { id: dto.dispatchNoticeId, deletedAt: null, status: { in: ['ISSUED', 'IN_PROGRESS'] } },
      });
      if (!notice) throw new BadRequestException('执行通知状态已变化，请刷新后重试');
      const used = await tx.waybillLineItem.groupBy({
        by: ['dispatchNoticeLineItemId'],
        where: { waybill: { dispatchNoticeId: dto.dispatchNoticeId, deletedAt: null, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true },
      });
      const usedMap = new Map(used.map(item => [item.dispatchNoticeLineItemId, Number(item._sum.quantity || 0)]));
      for (const [lineId, quantity] of totals) {
        const source = sourceMap.get(lineId)!;
        const remaining = Math.max(0, source.noticeQuantity - (usedMap.get(lineId) || 0));
        if (quantity > remaining) {
          throw new BadRequestException(`物料 ${source.materialName || source.materialId} 剩余可运输数量已变为 ${remaining}，请刷新后重新分配`);
        }
      }
      const waybillNumbers = await this.reserveWaybillNumbers(tx, prepared.length);
      const items: any[] = [];
      for (const [index, item] of prepared.entries()) {
        const waybill = await tx.waybill.create({
          data: {
            waybillNo: waybillNumbers[index],
            dispatchNoticeId: dto.dispatchNoticeId,
            freightMode: item.freightMode,
            vehicleId: item.vehicle?.id || null,
            driverId: item.driver?.id || null,
            carrierPartnerId: item.carrier?.id || null,
            carrierName: item.carrier?.name || null,
            plateNo: item.plateNo,
            driverName: item.driverName,
            driverPhone: item.driverPhone,
            originLocation: item.originLocation,
            destinationLocation: item.destinationLocation,
            totalQuantity: item.totalQuantity,
            plannedDepartureAt: item.plannedDepartureAt,
            plannedArrivalAt: item.plannedArrivalAt,
            remarks: item.remarks,
            creationBatchId: dto.batchRequestId,
            creationRowId: item.clientRowId,
            createdBy: userId,
            lineItems: { create: item.lineItems },
          },
          include: this.include,
        });
        await tx.businessOperationLog.create({
          data: {
            businessType: 'WAYBILL', businessId: waybill.id,
            action: 'CREATE', actionLabel: '批量创建物流运单', operatorId: userId,
            details: { batchRequestId: dto.batchRequestId, rowNumber: index + 1 },
          },
        });
        items.push(waybill);
      }
      return items;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30000 });

    for (const waybill of created) await this.syncCreatedWaybill(waybill, userId);
    return { batchRequestId: dto.batchRequestId, createdCount: created.length, warnings, items: created };
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
    freightMode?: string; vehicleId?: string | null; driverId?: string | null; carrierPartnerId?: string | null; carrierName?: string | null;
    plateNo?: string | null; driverName?: string | null; driverPhone?: string | null;
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
    const carrierPartnerId = data.carrierPartnerId === undefined
      ? waybill.carrierPartnerId ?? undefined
      : data.carrierPartnerId || undefined;
    const carrier = await this.resolveCarrier(
      freightMode,
      carrierPartnerId,
    );
    const vehicleId = data.vehicleId === undefined ? waybill.vehicleId : data.vehicleId;
    let vehicle: any = null;
    if (vehicleId) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, status: 'ACTIVE', deletedAt: null },
      });
      if (!vehicle) throw new BadRequestException('所选车辆不存在或不可用');
      this.validateVehicleAssignment(vehicle, freightMode, carrier);
    }
    const driverId = data.driverId === undefined ? waybill.driverId : data.driverId;
    let driver: any = null;
    if (driverId) {
      driver = await this.findAvailableDriver(driverId);
      this.validateDriverAssignment(driver, freightMode, carrier);
    }
    const updated = await this.prisma.waybill.update({
      where: { id },
      data: {
        freightMode,
        vehicleId: vehicleId || null,
        driverId: driverId || null,
        carrierPartnerId: carrier?.id || null,
        carrierName: carrier?.name || null,
        plateNo: data.plateNo === undefined ? vehicle?.plateNo ?? waybill.plateNo : data.plateNo?.trim() || null,
        driverName: data.driverName === undefined ? driver?.name ?? vehicle?.driverName ?? waybill.driverName : data.driverName?.trim() || null,
        driverPhone: data.driverPhone === undefined ? driver?.phone ?? vehicle?.driverPhone ?? waybill.driverPhone : data.driverPhone?.trim() || null,
        plannedDepartureAt: data.plannedDepartureAt ? new Date(data.plannedDepartureAt) : undefined,
        plannedArrivalAt: data.plannedArrivalAt ? new Date(data.plannedArrivalAt) : undefined,
      },
      include: this.include,
    });
    if (updated.vehicleId || updated.plateNo) {
      await this.weighService.ensureTaskForWaybill(updated.id, userId);
    }
    return this.findOne(updated.id, userId, 'logistics.manage');
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
    if (status === 'CANCELLED' && waybill.outboundReceipts.some(item => item.status === 'POSTED')) {
      throw new BadRequestException('该运单已经完成销售出库，不能取消');
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
    if (status === 'SIGNED' && !(waybill.attachments || []).some(item => isWaybillReceiptAttachment(item.category))) {
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
      if (status === 'CANCELLED') {
        const receiptIds = waybill.outboundReceipts
          .filter(item => item.status !== 'POSTED')
          .map(item => item.id);
        if (receiptIds.length) {
          await tx.outboundReceiptAllocation.deleteMany({ where: { outboundReceiptId: { in: receiptIds } } });
          await tx.outboundReceipt.updateMany({ where: { id: { in: receiptIds } }, data: { status: 'CANCELLED' } });
        }
      }
      return updated;
    });
    if (
      waybill.dispatchNotice.type === 'PURCHASE'
      && ['IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(status)
    ) {
      await this.inventoryService.ensurePendingReceiptForWaybill(id, userId);
    }
    if (['ARRIVED', 'SIGNED'].includes(status)) {
      await this.qualityService.ensureTaskForWaybill(id, userId);
    }
    if (status === 'CANCELLED') await this.weighService.voidTaskForWaybill(id, userId);
    else await this.weighService.syncTaskForWaybill(id, userId);
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
    mimeType: string; size: number; category: WaybillReceiptAttachmentCategory;
  }, userId: string) {
    if (!(WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES as readonly string[]).includes(data.category)) {
      throw new BadRequestException('物流收货附件分类无效');
    }
    const waybill = await this.findOne(data.waybillId, userId, 'logistics.manage');
    if (!['ARRIVED', 'SIGNED'].includes(waybill.status)) {
      throw new BadRequestException('物流收货附件只能在运单到达后上传');
    }
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId: string, permission = 'logistics.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getWaybillScope(userId);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        waybillId: { not: null },
        category: { in: [...WAYBILL_RECEIPT_ATTACHMENT_CATEGORIES_WITH_LEGACY] },
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
