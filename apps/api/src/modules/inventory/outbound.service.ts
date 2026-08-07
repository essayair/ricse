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
        id: true, ticketNo: true, direction: true, status: true, settlementBasis: true,
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

  private async nextNo(prefix: string, model: 'outboundOrder' | 'outboundReceipt' | 'salesOutbound', db: any = this.prisma) {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = model === 'outboundOrder'
      ? await db.outboundOrder.count({ where: { createdAt: { gte: start, lt: end } } })
      : model === 'outboundReceipt'
        ? await db.outboundReceipt.count({ where: { createdAt: { gte: start, lt: end } } })
        : await db.salesOutbound.count({ where: { createdAt: { gte: start, lt: end } } });
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private orderInclude() {
    return {
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      creator: { select: { id: true, name: true } },
      dispatchNotice: {
        include: {
          lineItems: { orderBy: { createdAt: 'asc' as const } },
          order: { include: { contract: true } },
          waybills: {
            where: { deletedAt: null },
            include: {
              lineItems: { orderBy: { createdAt: 'asc' as const } },
              weighTickets: {
                where: { deletedAt: null, direction: 'OUTBOUND' },
                include: { qualityInspections: { where: { status: { not: 'VOIDED' } }, orderBy: { createdAt: 'desc' as const } } },
                orderBy: { createdAt: 'desc' as const },
              },
              outboundReceipts: {
                where: { deletedAt: null },
                include: {
                  weighTicket: true,
                  allocations: { include: { inventoryLot: true } },
                  salesOutbound: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' as const },
          },
        },
      },
      lineItems: { orderBy: { createdAt: 'asc' as const } },
      receipts: {
        where: { deletedAt: null },
        include: {
          waybill: true,
          weighTicket: true,
          allocations: { include: { inventoryLot: true } },
          salesOutbound: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  /**
   * 销售发货通知下达时幂等生成通知级管理单。
   * 常规出库冻结当前可用库存；直拨仅生成过程跟踪占位单，不影响我方库存。
   */
  async ensureOrderForNotice(noticeId: string, userId: string, db: any = this.prisma) {
    const notice = await db.dispatchNotice.findUnique({
      where: { id: noticeId },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        outboundOrder: true,
        order: { include: { contract: { select: { signingPartnerId: true } } } },
      },
    });
    if (!notice) throw new NotFoundException('销售发货通知不存在');
    if (notice.type !== 'SALES') return null;
    const isDirect = notice.mode === 'DIRECT';
    if (!isDirect && !notice.warehouseId) {
      throw new BadRequestException('销售发货通知缺少发货仓库，无法生成出库管理单');
    }
    const ownerPartnerId = notice.order.contract.signingPartnerId;
    if (!ownerPartnerId) throw new BadRequestException('销售合同缺少我方签约主体，无法确认出库库存主体');
    if (notice.outboundOrder) return notice.outboundOrder;

    const lines: Array<any> = [];
    for (const line of notice.lineItems) {
      let available = 0;
      if (!isDirect) {
        const physical = await db.inventoryLot.aggregate({
          where: {
            warehouseId: notice.warehouseId,
            ownerPartnerId,
            materialId: line.materialId,
            status: 'AVAILABLE',
            availableQuantity: { gt: 0 },
          },
          _sum: { availableQuantity: true },
        });
        const otherLines = await db.outboundOrderLine.findMany({
          where: {
            materialId: line.materialId,
            outboundOrder: {
              warehouseId: notice.warehouseId, ownerPartnerId,
              status: { in: ['PENDING', 'PARTIAL'] },
            },
          },
          select: { reservedQuantity: true, actualQuantity: true },
        });
        const reservedByOthers = otherLines.reduce(
          (sum: number, item: any) => sum + Math.max(0, Number(item.reservedQuantity) - Number(item.actualQuantity)),
          0,
        );
        available = Math.max(0, Number(physical._sum.availableQuantity || 0) - reservedByOthers);
      }
      const planned = Number(line.quantity);
      lines.push({
        dispatchNoticeLineItemId: line.id,
        materialId: line.materialId,
        materialName: line.materialName,
        unit: line.unit,
        plannedQuantity: planned,
        reservedQuantity: isDirect ? 0 : Math.min(planned, available),
      });
    }
    const plannedQuantity = lines.reduce((sum, line) => sum + line.plannedQuantity, 0);
    const reservedQuantity = lines.reduce((sum, line) => sum + line.reservedQuantity, 0);
    return db.outboundOrder.create({
      data: {
        orderNo: await this.nextNo(isDirect ? 'DFM' : 'OOM', 'outboundOrder', db),
        dispatchNoticeId: notice.id,
        warehouseId: notice.warehouseId,
        ownerPartnerId,
        plannedQuantity,
        reservedQuantity,
        shortageQuantity: isDirect ? 0 : Math.max(0, plannedQuantity - reservedQuantity),
        createdBy: userId,
        lineItems: { create: lines },
      },
    });
  }

  /** 物流运单创建时幂等生成一车一张的出库作业。 */
  async ensureReceiptForWaybill(waybillId: string, userId: string) {
    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
      include: {
        lineItems: { orderBy: { createdAt: 'asc' } },
        outboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } } },
        dispatchNotice: { include: { outboundOrder: true, order: { include: { contract: true } } } },
      },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    if (waybill.dispatchNotice.type !== 'SALES' || waybill.dispatchNotice.mode !== 'STANDARD') return null;
    if (waybill.outboundReceipts.length) return waybill.outboundReceipts[0];
    let order = waybill.dispatchNotice.outboundOrder;
    if (!order) order = await this.ensureOrderForNotice(waybill.dispatchNoticeId, userId);
    if (!order) throw new BadRequestException('出库管理单生成失败');
    if (!order.warehouseId) throw new BadRequestException('销售常规出库管理单缺少发货仓库');
    const materialIds = [...new Set(waybill.lineItems.map(item => item.materialId))];
    if (materialIds.length !== 1) throw new BadRequestException('当前销售出库仅支持单一物料运单');
    const line = waybill.lineItems[0];
    return this.prisma.outboundReceipt.create({
      data: {
        receiptNo: await this.nextNo('OWO', 'outboundReceipt'),
        outboundOrderId: order.id,
        waybillId: waybill.id,
        warehouseId: order.warehouseId,
        materialId: line.materialId,
        materialName: line.materialName || line.materialId,
        customerName: null,
        plateNo: waybill.plateNo,
        plannedQuantity: waybill.totalQuantity,
        createdBy: userId,
      },
      include: this.include,
    });
  }

  async findOrders(params: { search?: string; status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getDispatchNoticeScope(userId);
    const where: Prisma.OutboundOrderWhereInput = { dispatchNotice: { deletedAt: null, AND: [scope] } };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { orderNo: { contains: params.search, mode: 'insensitive' } },
        { dispatchNotice: { noticeNo: { contains: params.search, mode: 'insensitive' } } },
        { dispatchNotice: { order: { orderNo: { contains: params.search, mode: 'insensitive' } } } },
        { dispatchNotice: { order: { contract: { contractNo: { contains: params.search, mode: 'insensitive' } } } } },
        { lineItems: { some: { materialName: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    const items = await this.prisma.outboundOrder.findMany({
      where, include: this.orderInclude(), orderBy: { createdAt: 'desc' }, take: 100,
    });
    return { items: items.map(item => this.withOrderStage(item)), total: items.length };
  }

  async findOrder(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getDispatchNoticeScope(userId);
    const item = await this.prisma.outboundOrder.findFirst({
      where: { id, dispatchNotice: { deletedAt: null, AND: [scope] } },
      include: this.orderInclude(),
    });
    if (!item) throw new NotFoundException('出库管理单不存在');
    return this.withOrderStage(item);
  }

  private withOrderStage(item: any) {
    if (item.dispatchNotice.mode === 'DIRECT') {
      const waybills = (item.dispatchNotice.waybills || []).filter((waybill: any) => waybill.status !== 'CANCELLED');
      let stage = 'DIRECT_WAITING_LOGISTICS';
      let stageLabel = '直拨待物流';
      let blocker = '直拨不经过我方库存，请根据销售发货通知创建物流运单';
      if (item.status === 'CANCELLED') {
        stage = 'CANCELLED'; stageLabel = '已取消'; blocker = '销售发货通知已取消';
      } else if (item.status === 'COMPLETED') {
        stage = 'COMPLETED'; stageLabel = '直拨已完成'; blocker = '直拨发运任务已完成';
      } else if (waybills.length && waybills.every((waybill: any) => waybill.status === 'SIGNED')) {
        stage = 'DIRECT_WAITING_COMPLETE'; stageLabel = '直拨待完成'; blocker = '全部物流运单已签收，可完成销售发货通知';
      } else if (waybills.some((waybill: any) => ['IN_TRANSIT', 'ARRIVED'].includes(waybill.status))) {
        stage = 'DIRECT_IN_PROGRESS'; stageLabel = '直拨运输中'; blocker = '直拨物流正在执行，等待到达和签收';
      } else if (waybills.length) {
        stage = 'DIRECT_WAITING_SHIPMENT'; stageLabel = '直拨待发运'; blocker = '物流运单已创建，等待发运';
      }
      return { ...item, stage, stageLabel, blocker };
    }
    const activeReceipts = (item.receipts || []).filter((receipt: any) => receipt.status !== 'CANCELLED');
    const posted = activeReceipts.filter((receipt: any) => receipt.status === 'POSTED');
    let stage = 'WAITING_LOGISTICS';
    let stageLabel = '待物流安排';
    let blocker = '请根据销售发货通知创建物流运单';
    if (item.status === 'CANCELLED') {
      stage = 'CANCELLED'; stageLabel = '已取消'; blocker = '销售发货通知已取消';
    } else if (item.status === 'COMPLETED') {
      stage = 'COMPLETED'; stageLabel = '已完成'; blocker = '全部出库任务已完成';
    } else if (Number(item.shortageQuantity) > 0) {
      stage = 'STOCK_SHORTAGE'; stageLabel = '库存不足'; blocker = `待补充冻结库存 ${Number(item.shortageQuantity)} 吨`;
    } else if (activeReceipts.some((receipt: any) => receipt.status === 'VARIANCE_PENDING')) {
      stage = 'VARIANCE_PENDING'; stageLabel = '待差异处理'; blocker = '存在超装或短装车次需要确认';
    } else if (activeReceipts.some((receipt: any) => receipt.status === 'READY')) {
      stage = 'WAITING_RELEASE'; stageLabel = '待放行'; blocker = '磅单和库存批次已确认，等待车辆放行';
    } else if (activeReceipts.some((receipt: any) => receipt.weighTicketId)) {
      stage = 'WAITING_ALLOCATION'; stageLabel = '待批次拣配'; blocker = '请按已复核磅单调整库存批次';
    } else if (activeReceipts.length) {
      stage = 'WAITING_WEIGHING'; stageLabel = '待出库称重'; blocker = '物流运单已创建，等待皮重、装货、毛重和磅单复核';
    }
    if (posted.length && !['COMPLETED', 'CANCELLED'].includes(stage)) {
      stage = 'PARTIAL'; stageLabel = '部分出库'; blocker = '已有车次出库，等待剩余任务';
    }
    return { ...item, stage, stageLabel, blocker };
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
          some: { deletedAt: null, status: { in: ['PENDING', 'VARIANCE_PENDING'] } },
        },
        weighTickets: {
          some: {
            deletedAt: null,
            status: 'REVIEWED',
            direction: 'OUTBOUND',
            weighingStage: 'SHIPPING',
            netWeight: { gt: 0 },
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
            weighingStage: 'SHIPPING',
            netWeight: { gt: 0 },
          },
          orderBy: { reviewedAt: 'desc' },
        },
        outboundReceipts: {
          where: { deletedAt: null, status: { in: ['PENDING', 'VARIANCE_PENDING'] } },
          select: { id: true, receiptNo: true, status: true, outboundOrderId: true },
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
      include: {
        lineItems: true,
        dispatchNotice: { include: { order: { include: { contract: { select: { signingPartnerId: true } } } } } },
      },
    });
    if (!waybill) throw new NotFoundException('物流运单不存在');
    if (waybill.dispatchNotice.type !== 'SALES' || waybill.dispatchNotice.mode !== 'STANDARD') {
      throw new BadRequestException('只有销售常规出库运单可以选择库存批次');
    }
    if (!waybill.dispatchNotice.warehouseId) throw new BadRequestException('销售发货通知单缺少发货仓库');
    const ownerPartnerId = waybill.dispatchNotice.order.contract.signingPartnerId;
    if (!ownerPartnerId) throw new BadRequestException('销售合同缺少我方签约主体，无法选择所属库存');
    const materialIds = [...new Set(waybill.lineItems.map(item => item.materialId))];
    if (materialIds.length !== 1) throw new BadRequestException('首版销售出库只支持单一物料运单');
    const lotScope = await this.accessControl.getInventoryLotScope(userId);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        AND: [lotScope],
        warehouseId: waybill.dispatchNotice.warehouseId,
        ownerPartnerId,
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
    const receipt = await this.prisma.outboundReceipt.findFirst({
      where: { waybillId, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    const allocated = await this.prisma.outboundReceiptAllocation.groupBy({
      by: ['inventoryLotId'],
      where: {
        inventoryLotId: { in: lots.map(lot => lot.id) },
        outboundReceipt: {
          deletedAt: null,
          status: { in: ['PENDING', 'READY', 'VARIANCE_PENDING'] },
          ...(receipt ? { id: { not: receipt.id } } : {}),
        },
      },
      _sum: { quantity: true },
    });
    const allocatedMap = new Map(allocated.map(item => [item.inventoryLotId, Number(item._sum.quantity || 0)]));
    return lots.map(lot => ({
      ...lot,
      physicalQuantity: lot.availableQuantity,
      availableQuantity: Math.max(0, Number(lot.availableQuantity) - (allocatedMap.get(lot.id) || 0)),
    }));
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
          include: { outboundOrder: { include: { lineItems: true } } },
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
    let receipt = waybill.outboundReceipts[0];
    if (!receipt) receipt = await this.ensureReceiptForWaybill(waybill.id, userId) as any;
    if (!receipt || receipt.status === 'POSTED') throw new BadRequestException('该运单已经完成出库');
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
        weighingStage: 'SHIPPING',
      },
    });
    if (!ticket) throw new BadRequestException('请选择该运单已复核的出库磅单');
    const quantity = Number(ticket.netWeight);
    if (quantity <= 0) throw new BadRequestException('出库磅单有效净重必须大于 0');
    const currentWeightSelection = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: waybill.id, purpose: 'INVENTORY', isCurrent: true },
    });
    if (currentWeightSelection && currentWeightSelection.weighTicketId !== ticket.id) {
      throw new BadRequestException('所选磅单不是当前结算入库磅单，请先在磅单信息详情中变更选用依据');
    }
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
    const otherAllocated = await this.prisma.outboundReceiptAllocation.groupBy({
      by: ['inventoryLotId'],
      where: {
        inventoryLotId: { in: lots.map(lot => lot.id) },
        outboundReceipt: {
          id: { not: receipt.id }, deletedAt: null,
          status: { in: ['PENDING', 'READY', 'VARIANCE_PENDING'] },
        },
      },
      _sum: { quantity: true },
    });
    const otherAllocatedMap = new Map(otherAllocated.map(item => [item.inventoryLotId, Number(item._sum.quantity || 0)]));
    for (const lot of lots) {
      const allocation = allocationMap.get(lot.id)!;
      if (lot.warehouseId !== waybill.dispatchNotice.warehouseId || lot.materialId !== materialId) {
        throw new BadRequestException(`库存批次 ${lot.lotNo} 与发货仓库或物料不一致`);
      }
      const allocatable = Number(lot.availableQuantity) - (otherAllocatedMap.get(lot.id) || 0);
      if (lot.status !== 'AVAILABLE' || allocatable < allocation) {
        throw new BadRequestException(`库存批次 ${lot.lotNo} 可用数量不足`);
      }
    }
    const planned = Number(waybill.totalQuantity);
    const varianceQuantity = quantity - planned;
    const varianceRate = planned > 0 ? Math.abs(varianceQuantity) / planned * 100 : 0;
    const orderLine = receipt.outboundOrder.lineItems.find((item: any) => item.materialId === materialId);
    const postedForOrder = await this.prisma.outboundReceipt.aggregate({
      where: {
        outboundOrderId: receipt.outboundOrderId,
        status: 'POSTED',
        materialId,
        deletedAt: null,
      },
      _sum: { outboundQuantity: true },
    });
    const noticeRemaining = Math.max(0, Number(orderLine?.plannedQuantity || 0) - Number(postedForOrder._sum.outboundQuantity || 0));
    const requiresDecision = varianceRate > Number(ticket.toleranceRate) || quantity > noticeRemaining + 0.0005;
    return this.prisma.$transaction(async tx => {
      if (!currentWeightSelection) {
        await tx.waybillWeightSelection.create({
          data: {
            waybillId: waybill.id, purpose: 'INVENTORY', weighTicketId: ticket.id,
            quantity, reason: '销售出库作业首次选用', selectedBy: userId,
          },
        });
      }
      await tx.outboundReceiptAllocation.deleteMany({ where: { outboundReceiptId: receipt.id } });
      return tx.outboundReceipt.update({
        where: { id: receipt.id },
        data: {
          weighTicketId: ticket.id,
          materialName: line.materialName || ticket.materialName || materialId,
          customerName: ticket.receiverName,
          plateNo: ticket.plateNo || waybill.plateNo,
          plannedQuantity: planned,
          outboundQuantity: quantity,
          varianceQuantity,
          varianceRate,
          varianceDecision: null,
          varianceReason: null,
          varianceResolvedBy: null,
          varianceResolvedAt: null,
          departedAt: new Date(dto.departedAt),
          operatorName: dto.operatorName.trim(),
          remarks: dto.remarks?.trim() || null,
          status: requiresDecision ? 'VARIANCE_PENDING' : 'READY',
          allocations: {
            create: [...allocationMap].map(([inventoryLotId, allocationQuantity]) => ({
              inventoryLotId,
              quantity: allocationQuantity,
            })),
          },
        },
        include: this.include,
      });
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
    if (!receipt) throw new NotFoundException('车次出库作业不存在');
    return receipt;
  }

  async refreshReservation(id: string, userId: string) {
    const order = await this.findOrder(id, userId, 'inventory.manage') as any;
    if (order.dispatchNotice.mode === 'DIRECT') throw new BadRequestException('直拨业务不经过我方库存，无需刷新库存预留');
    if (!['PENDING', 'PARTIAL'].includes(order.status)) throw new BadRequestException('当前出库管理单不能刷新库存预留');
    const updates: Array<{ id: string; planned: number; reserved: number }> = [];
    for (const line of order.lineItems) {
      const physical = await this.prisma.inventoryLot.aggregate({
        where: {
          warehouseId: order.warehouseId, ownerPartnerId: order.ownerPartnerId, materialId: line.materialId,
          status: 'AVAILABLE', availableQuantity: { gt: 0 },
        },
        _sum: { availableQuantity: true },
      });
      const others = await this.prisma.outboundOrderLine.findMany({
        where: {
          outboundOrderId: { not: order.id }, materialId: line.materialId,
          outboundOrder: {
            warehouseId: order.warehouseId, ownerPartnerId: order.ownerPartnerId,
            status: { in: ['PENDING', 'PARTIAL'] },
          },
        },
        select: { reservedQuantity: true, actualQuantity: true },
      });
      const reservedByOthers = others.reduce(
        (sum, item) => sum + Math.max(0, Number(item.reservedQuantity) - Number(item.actualQuantity)), 0,
      );
      const remainingPhysical = Math.max(0, Number(physical._sum.availableQuantity || 0) - reservedByOthers);
      const actual = Number(line.actualQuantity);
      const planned = Number(line.plannedQuantity);
      updates.push({ id: line.id, planned, reserved: actual + Math.min(Math.max(0, planned - actual), remainingPhysical) });
    }
    await this.prisma.$transaction(async tx => {
      for (const item of updates) {
        await tx.outboundOrderLine.update({ where: { id: item.id }, data: { reservedQuantity: item.reserved } });
      }
      const reservedQuantity = updates.reduce((sum, item) => sum + item.reserved, 0);
      await tx.outboundOrder.update({
        where: { id: order.id },
        data: {
          reservedQuantity,
          shortageQuantity: Math.max(0, Number(order.plannedQuantity) - reservedQuantity),
        },
      });
    });
    return this.findOrder(id, userId, 'inventory.manage');
  }

  async resolveVariance(id: string, data: { decision: string; reason: string }, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage') as any;
    if (receipt.status !== 'VARIANCE_PENDING') throw new BadRequestException('当前车次没有待处理的出库差异');
    const variance = Number(receipt.varianceQuantity || 0);
    const allowed = variance > 0
      ? ['OVERAGE_APPROVED']
      : ['SHORT_CONTINUE', 'SHORT_CLOSE'];
    if (!allowed.includes(data.decision)) throw new BadRequestException('差异处理方式与超装/短装方向不匹配');
    if (!data.reason?.trim()) throw new BadRequestException('请填写差异原因和处理意见');
    return this.prisma.outboundReceipt.update({
      where: { id },
      data: {
        status: 'READY',
        varianceDecision: data.decision,
        varianceReason: data.reason.trim(),
        varianceResolvedBy: userId,
        varianceResolvedAt: new Date(),
      },
      include: this.include,
    });
  }

  async confirm(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (receipt.status !== 'READY') throw new BadRequestException('磅单、差异处理和库存批次全部确认后才能放行');
    return receipt;
  }

  async cancel(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (!['PENDING', 'READY', 'VARIANCE_PENDING'].includes(receipt.status)) throw new BadRequestException('已出库车次不能作废');
    return this.prisma.$transaction(async tx => {
      await tx.outboundReceiptAllocation.deleteMany({ where: { outboundReceiptId: id } });
      return tx.outboundReceipt.update({
        where: { id }, data: { status: 'CANCELLED' }, include: this.include,
      });
    });
  }

  async post(id: string, userId: string) {
    const receipt = await this.findOne(id, userId, 'inventory.manage');
    if (receipt.status !== 'READY') throw new BadRequestException('只有待放行车次可以确认出库');
    if (!receipt.weighTicket || receipt.weighTicket.status !== 'REVIEWED') throw new BadRequestException('必须关联已复核出库磅单');
    if (!receipt.outboundQuantity || Number(receipt.outboundQuantity) <= 0) throw new BadRequestException('实际出库数量无效');
    const actualQuantity = receipt.outboundQuantity;
    if (receipt.salesOutbound) throw new BadRequestException('该车次已生成销售出库单');
    if (receipt.waybill.status !== 'PENDING') throw new BadRequestException('物流运单已发运或已取消，不能扣减库存');
    const currentWeight = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: receipt.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (!currentWeight || currentWeight.weighTicketId !== receipt.weighTicketId) {
      throw new BadRequestException('出库作业关联磅单与当前结算入库磅单不一致，不能扣减库存');
    }
    const allocated = receipt.allocations.reduce((sum, item) => sum + Number(item.quantity), 0);
    if (Math.abs(allocated - Number(receipt.outboundQuantity)) > 0.0005) {
      throw new BadRequestException('库存批次分配数量必须等于实际出库数量');
    }
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
          quantity: actualQuantity,
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
      const waybillLine = receipt.waybill.lineItems[0];
      if (waybillLine) {
        await tx.outboundOrderLine.update({
          where: { dispatchNoticeLineItemId: waybillLine.dispatchNoticeLineItemId },
          data: { actualQuantity: { increment: actualQuantity } },
        });
      }
      await tx.outboundOrder.update({
        where: { id: receipt.outboundOrderId },
        data: { status: 'PARTIAL', actualQuantity: { increment: actualQuantity } },
      });
      await tx.waybill.update({
        where: { id: receipt.waybillId },
        data: { status: 'IN_TRANSIT', departedAt: receipt.departedAt || new Date() },
      });
      if (receipt.waybill.dispatchNotice.status === 'ISSUED') {
        await tx.dispatchNotice.update({ where: { id: receipt.waybill.dispatchNoticeId }, data: { status: 'IN_PROGRESS' } });
      }
    });
    return this.findOne(id, userId, 'inventory.manage');
  }

  async createAttachment(data: {
    outboundReceiptId: string; fileName: string; originalName: string;
    mimeType: string; size: number; category: string;
  }, userId: string) {
    const receipt = await this.findOne(data.outboundReceiptId, userId, 'inventory.manage');
    if (['POSTED', 'CANCELLED'].includes(receipt.status)) throw new BadRequestException('已出库或已作废车次不能上传附件');
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
    if (attachment.outboundReceipt && ['POSTED', 'CANCELLED'].includes(attachment.outboundReceipt.status)) {
      throw new BadRequestException('已出库或已作废车次不能删除附件');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }
}
