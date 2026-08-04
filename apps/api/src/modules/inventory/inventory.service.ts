import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateInboundReceiptDto } from './dto/create-inbound-receipt.dto';
import { UpdatePendingInboundReceiptDto } from './dto/update-pending-inbound-receipt.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    warehouse: { select: { id: true, code: true, name: true } },
    creator: { select: { id: true, name: true } },
    weighTicket: {
      select: {
        id: true, ticketNo: true, status: true, settlementWeight: true, netWeight: true,
        abnormal: true, reviewedAt: true, weighingStage: true, sequence: true,
      },
    },
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
        weighTickets: {
          where: { deletedAt: null },
          select: {
            id: true, ticketNo: true, status: true, abnormal: true, reviewedAt: true,
            settlementWeight: true, netWeight: true, weighingStage: true, sequence: true,
            qualityInspections: {
              where: { deletedAt: null },
              select: {
                id: true, inspectionNo: true, institutionName: true, reportNo: true,
                status: true, conclusion: true, testedAt: true, confirmedAt: true,
              },
              orderBy: { testedAt: 'desc' as const },
            },
          },
          orderBy: { createdAt: 'desc' as const },
        },
        dispatchNotice: {
          include: {
            order: {
              include: {
                contract: {
                  select: {
                    id: true, contractNo: true, title: true,
                    seller: { select: { id: true, name: true } },
                    signingPartner: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
        },
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

  private decorateReceipt<T>(receipt: T): T & { workflow: ReturnType<InventoryService['buildWorkflow']> } {
    return { ...receipt, workflow: this.buildWorkflow(receipt as any) };
  }

  private buildWorkflow(receipt: any) {
    const waybill = receipt.waybill || {};
    const tickets = waybill.weighTickets || [];
    const activeTickets = tickets.filter((ticket: any) => ticket.status !== 'VOIDED');
    const reviewedTickets = activeTickets.filter((ticket: any) => ticket.status === 'REVIEWED');
    const inspections = reviewedTickets.flatMap((ticket: any) => ticket.qualityInspections || []);
    const confirmedPass = inspections.find((inspection: any) => inspection.status === 'CONFIRMED' && inspection.conclusion === 'PASS');
    const inProgressQuality = inspections.some((inspection: any) => ['DRAFT', 'TESTING', 'REPORTED'].includes(inspection.status));
    const confirmedException = inspections.find((inspection: any) => (
      inspection.status === 'CONFIRMED' && ['DEDUCTION', 'FUSE'].includes(inspection.conclusion)
    ));

    let stage = 'WAITING_ARRIVAL';
    let stageLabel = '待到货';
    let blocker = '采购运单在途，等待车辆到达';
    let tone = 'info';

    if (receipt.status === 'CANCELLED') {
      stage = 'CANCELLED'; stageLabel = '已作废'; blocker = '入库作业单已作废'; tone = 'muted';
    } else if (receipt.status === 'POSTED') {
      stage = 'POSTED'; stageLabel = '已入账'; blocker = '业务入库、库存批次和库存台账均已生成'; tone = 'success';
    } else if (receipt.status === 'RECEIVED') {
      stage = 'RECEIVED_WAIT_POSTING'; stageLabel = '已收货待入账'; blocker = '现场收货已确认，等待生成业务入库并入账'; tone = 'warning';
    } else if (!['ARRIVED', 'SIGNED'].includes(waybill.status)) {
      stage = 'WAITING_ARRIVAL'; stageLabel = waybill.status === 'PENDING' ? '待发运' : '待到货';
      blocker = waybill.status === 'PENDING' ? '物流运单尚未确认发运' : '采购运单在途，等待车辆到达';
    } else if (!activeTickets.length) {
      stage = 'WAITING_WEIGH'; stageLabel = '已到达待过磅'; blocker = '车辆已到达，尚未创建磅单'; tone = 'warning';
    } else if (!reviewedTickets.length) {
      const weighing = activeTickets.some((ticket: any) => ['PENDING', 'WEIGHING'].includes(ticket.status));
      stage = weighing ? 'WEIGHING' : 'WAITING_WEIGH_REVIEW';
      stageLabel = weighing ? '过磅处理中' : '待磅单复核';
      blocker = weighing ? '磅单已创建，等待完成有效称重并复核' : '称重已完成，等待复核磅单';
      tone = 'warning';
    } else if (receipt.qualityInspection?.status === 'CONFIRMED' && receipt.qualityInspection?.conclusion === 'PASS') {
      stage = 'READY_TO_RECEIVE'; stageLabel = '合格待收货'; blocker = '最终验收质检已合格，可以补齐收货信息并确认收货'; tone = 'success';
    } else if (!inspections.length) {
      stage = 'WAITING_QUALITY'; stageLabel = '已过磅待质检'; blocker = '磅单已复核，尚未创建质检单'; tone = 'warning';
    } else if (inProgressQuality) {
      stage = 'QUALITY_IN_PROGRESS'; stageLabel = '质检处理中'; blocker = '质检单尚未确认，等待检测或报告确认'; tone = 'warning';
    } else if (confirmedPass) {
      stage = 'WAITING_ACCEPTANCE_SELECTION'; stageLabel = '待确认验收依据'; blocker = '已有合格质检单，请指定最终验收质检单'; tone = 'warning';
    } else if (confirmedException) {
      stage = 'QUALITY_EXCEPTION'; stageLabel = '质检异常';
      blocker = confirmedException.conclusion === 'FUSE' ? '质检结果触发熔断，禁止入库' : '质检结果为超标扣款，当前规则禁止入库';
      tone = 'danger';
    } else {
      stage = 'WAITING_QUALITY'; stageLabel = '等待质检结论'; blocker = '尚无已确认的最终质检结果'; tone = 'warning';
    }

    const transportLabel = waybill.status === 'SIGNED' ? '已签收' : waybill.status === 'ARRIVED' ? '已到达待签收' : waybill.status === 'IN_TRANSIT' ? '运输在途' : '待发运';
    const weighLabel = !activeTickets.length
      ? '未过磅'
      : reviewedTickets.length
        ? `${reviewedTickets.length} 张已复核`
        : activeTickets.some((ticket: any) => ticket.status === 'COMPLETED') ? '待复核' : '称重中';
    const qualityLabel = receipt.qualityInspection?.status === 'CONFIRMED' && receipt.qualityInspection?.conclusion === 'PASS'
      ? '最终验收合格'
      : inspections.length
        ? `${inspections.length} 张质检单`
        : '未质检';

    return {
      stage, stageLabel, blocker, tone,
      milestones: {
        transport: { label: transportLabel, complete: ['ARRIVED', 'SIGNED'].includes(waybill.status) },
        signed: { label: waybill.status === 'SIGNED' ? '已签收' : '待签收', complete: waybill.status === 'SIGNED' },
        weigh: { label: weighLabel, complete: reviewedTickets.length > 0 },
        quality: { label: qualityLabel, complete: Boolean(receipt.qualityInspection?.status === 'CONFIRMED' && receipt.qualityInspection?.conclusion === 'PASS') },
        inbound: { label: receipt.status === 'POSTED' ? '已入账' : receipt.status === 'RECEIVED' ? '已收货' : '待入库', complete: receipt.status === 'POSTED' },
      },
    };
  }

  /**
   * 采购运单确认发运时创建入库作业单；确认到达时再次调用作为幂等兜底。
   * 此阶段不要求磅单、质检单和实际入库数量，后续作业逐步补齐。
   */
  async ensurePendingReceiptForWaybill(waybillId: string, userId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null },
      include: {
        inboundReceipts: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          include: this.include,
        },
        lineItems: { orderBy: { createdAt: 'asc' } },
        dispatchNotice: {
          include: {
            order: {
              include: {
                contract: { include: { seller: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!waybill || waybill.dispatchNotice.type !== 'PURCHASE') return null;
    if (!['IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(waybill.status)) return null;
    if (waybill.inboundReceipts.length) return this.decorateReceipt(waybill.inboundReceipts[0]);

    const firstLine = waybill.lineItems[0];
    if (!firstLine) throw new BadRequestException('采购运单缺少物料明细，无法生成入库作业单');

    try {
      const receipt = await this.prisma.inboundReceipt.create({
        data: {
          receiptNo: await this.nextNo('LIR', 'inboundReceipt'),
          waybillId: waybill.id,
          weighTicketId: null,
          qualityInspectionId: null,
          warehouseId: waybill.dispatchNotice.warehouseId,
          status: 'PENDING',
          acceptanceConclusion: null,
          materialName: firstLine.materialName || '未命名物料',
          materialSpec: null,
          supplierName: waybill.dispatchNotice.order.contract.seller?.name || null,
          plateNo: waybill.plateNo,
          plannedQuantity: waybill.totalQuantity,
          receivedQuantity: null,
          receivedAt: null,
          receiverName: null,
          remarks: `由采购运单 ${waybill.waybillNo} 确认发运后自动创建`,
          createdBy: userId,
        },
        include: this.include,
      });
      return this.decorateReceipt(receipt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.inboundReceipt.findFirst({
          where: { waybillId: waybill.id, deletedAt: null, status: { not: 'CANCELLED' } },
          include: this.include,
        });
        if (existing) return this.decorateReceipt(existing);
      }
      throw error;
    }
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
    const quality = await this.prisma.qualityInspection.findFirst({
      where: { id: dto.qualityInspectionId, deletedAt: null, weighTicket: { waybillId: waybill.id } },
    });
    if (!quality || quality.status !== 'CONFIRMED') throw new BadRequestException('请选择该运单下已确认的质检单');
    if (quality.conclusion !== 'PASS') {
      throw new BadRequestException('只有质检结论为“合格”的货物才能入库；超标扣款、熔断或待判定货物不能入库');
    }
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null } });
    if (!warehouse) throw new BadRequestException('入库仓库不存在或已停用');
    if (!dto.receiverName.trim()) throw new BadRequestException('请填写收货人');
    const quantity = this.inventoryQuantity(weighTicket, quality);
    if (quantity <= 0) throw new BadRequestException('有效磅单净重扣除质检扣减后必须大于 0');
    await this.ensureInventorySelection(waybill.id, weighTicket, userId, '采购入库作业首次选用');

    const receipt = await this.prisma.inboundReceipt.create({
      data: {
        receiptNo: await this.nextNo('LIR', 'inboundReceipt'), waybillId: waybill.id,
        weighTicketId: weighTicket.id, qualityInspectionId: quality.id, warehouseId: warehouse.id,
        status: 'PENDING',
        acceptanceConclusion: quality.conclusion, materialName: quality.materialName,
        materialSpec: quality.materialSpec, supplierName: quality.supplierName,
        plateNo: quality.plateNo || waybill.plateNo,
        plannedQuantity: waybill.totalQuantity,
        receivedQuantity: quantity,
        moistureDeductionWeight: quality.moistureDeductionWeight,
        impurityDeductionWeight: quality.impurityDeductionWeight,
        deductionAmount: quality.deductionAmount, receivedAt: new Date(dto.receivedAt),
        receiverName: dto.receiverName.trim(), remarks: dto.remarks?.trim() || null, createdBy: userId,
      },
      include: this.include,
    });
    return this.decorateReceipt(receipt);
  }

  async createPendingReceiptForConfirmedQuality(qualityInspectionId: string, userId: string) {
    const quality = await this.prisma.qualityInspection.findFirst({
      where: {
        id: qualityInspectionId,
        deletedAt: null,
        status: 'CONFIRMED',
        conclusion: 'PASS',
      },
      include: {
        weighTicket: {
          include: {
            waybill: {
              include: {
                inboundReceipts: {
                  where: { deletedAt: null, status: { not: 'CANCELLED' } },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  include: this.include,
                },
                dispatchNotice: {
                  include: {
                    order: {
                      include: {
                        contract: { include: { seller: { select: { id: true, name: true } } } },
                      },
                    },
                  },
                },
                lineItems: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!quality) throw new BadRequestException('只有已确认且质检合格的质检单才能补齐入库作业单验收依据');

    const ticket = quality.weighTicket;
    const waybill = ticket.waybill;
    if (waybill.dispatchNotice.type !== 'PURCHASE') return null;
    if (ticket.status !== 'REVIEWED') throw new BadRequestException('磅单复核后才能确认合格并补齐入库作业单验收依据');
    if (!['ARRIVED', 'SIGNED'].includes(waybill.status)) {
      throw new BadRequestException('采购物流运单到达后才能确认合格并补齐入库作业单验收依据');
    }

    const currentSelection = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: waybill.id, purpose: 'INVENTORY', isCurrent: true },
      include: { weighTicket: true },
    });
    const inventoryTicket = currentSelection?.weighTicket || await this.prisma.weighTicket.findFirst({
      where: {
        waybillId: waybill.id, deletedAt: null, status: 'REVIEWED', weighingStage: 'SHIPPING',
      },
      orderBy: [{ sequence: 'asc' }, { reviewedAt: 'asc' }],
    }) || ticket;
    if (inventoryTicket.status !== 'REVIEWED' || inventoryTicket.deletedAt) {
      throw new BadRequestException('请先复核并选用该运单的有效入库磅单');
    }
    const quantity = this.inventoryQuantity(inventoryTicket, quality);
    if (quantity <= 0) throw new BadRequestException('有效磅单净重扣除质检扣减后必须大于 0');
    if (!currentSelection) {
      await this.ensureInventorySelection(waybill.id, inventoryTicket, userId, '采购默认选用发货称重磅单');
    }

    const existing = waybill.inboundReceipts[0];
    if (existing) {
      // 第一张已确认合格的质检单自动成为最终验收依据；后续可在入库详情中人工切换。
      if (existing.qualityInspectionId || existing.status !== 'PENDING') {
        return this.decorateReceipt(existing);
      }
      const updated = await this.prisma.inboundReceipt.update({
        where: { id: existing.id },
        data: {
          weighTicketId: inventoryTicket.id,
          qualityInspectionId: quality.id,
          acceptanceConclusion: 'PASS',
          materialName: quality.materialName,
          materialSpec: quality.materialSpec,
          supplierName: quality.supplierName,
          plateNo: quality.plateNo || waybill.plateNo,
          receivedQuantity: quantity,
          moistureDeductionWeight: quality.moistureDeductionWeight,
          impurityDeductionWeight: quality.impurityDeductionWeight,
          deductionAmount: quality.deductionAmount,
        },
        include: this.include,
      });
      return this.decorateReceipt(updated);
    }

    try {
      const receipt = await this.prisma.inboundReceipt.create({
        data: {
          receiptNo: await this.nextNo('LIR', 'inboundReceipt'),
          waybillId: waybill.id,
          weighTicketId: inventoryTicket.id,
          qualityInspectionId: quality.id,
          warehouseId: waybill.dispatchNotice.warehouseId,
          status: 'PENDING',
          acceptanceConclusion: quality.conclusion,
          materialName: quality.materialName,
          materialSpec: quality.materialSpec,
          supplierName: quality.supplierName,
          plateNo: quality.plateNo || waybill.plateNo,
          plannedQuantity: waybill.totalQuantity,
          receivedQuantity: quantity,
          moistureDeductionWeight: quality.moistureDeductionWeight,
          impurityDeductionWeight: quality.impurityDeductionWeight,
          deductionAmount: quality.deductionAmount,
          receivedAt: null,
          receiverName: null,
          remarks: `历史或异常漏单：由质检单 ${quality.inspectionNo} 确认合格后兜底创建`,
          createdBy: userId,
        },
        include: this.include,
      });
      return this.decorateReceipt(receipt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.inboundReceipt.findFirst({
          where: { waybillId: waybill.id, deletedAt: null, status: { not: 'CANCELLED' } },
          include: this.include,
        });
        if (existing) return this.decorateReceipt(existing);
      }
      throw error;
    }
  }

  async selectAcceptanceQuality(id: string, qualityInspectionId: string, userId: string) {
    const receipt = await this.findReceipt(id, userId, 'inventory.manage');
    if (receipt.status !== 'PENDING') throw new BadRequestException('只有待入库作业单可以调整最终验收质检单');
    const quality = await this.prisma.qualityInspection.findFirst({
      where: {
        id: qualityInspectionId,
        deletedAt: null,
        status: 'CONFIRMED',
        conclusion: 'PASS',
        weighTicket: { waybillId: receipt.waybillId, deletedAt: null, status: 'REVIEWED' },
      },
      include: { weighTicket: true },
    });
    if (!quality) throw new BadRequestException('只能选择本运单下已确认且合格的质检单');
    const inventoryTicket = receipt.weighTicket;
    if (!inventoryTicket || inventoryTicket.status !== 'REVIEWED') {
      throw new BadRequestException('请先在物流运单详情中选用已复核的入库磅单');
    }
    const quantity = this.inventoryQuantity(inventoryTicket, quality);
    if (quantity <= 0) throw new BadRequestException('有效磅单净重扣除质检扣减后必须大于 0');
    const updated = await this.prisma.inboundReceipt.update({
      where: { id },
      data: {
        weighTicketId: inventoryTicket.id,
        qualityInspectionId: quality.id,
        acceptanceConclusion: 'PASS',
        materialName: quality.materialName,
        materialSpec: quality.materialSpec,
        supplierName: quality.supplierName,
        plateNo: quality.plateNo || receipt.plateNo,
        receivedQuantity: quantity,
        moistureDeductionWeight: quality.moistureDeductionWeight,
        impurityDeductionWeight: quality.impurityDeductionWeight,
        deductionAmount: quality.deductionAmount,
      },
      include: this.include,
    });
    return this.decorateReceipt(updated);
  }

  private inventoryQuantity(ticket: { netWeight: unknown }, quality: {
    moistureDeductionWeight: unknown; impurityDeductionWeight: unknown;
  }) {
    return Math.max(0,
      Number(ticket.netWeight || 0)
      - Number(quality.moistureDeductionWeight || 0)
      - Number(quality.impurityDeductionWeight || 0));
  }

  private async ensureInventorySelection(
    waybillId: string,
    ticket: { id: string; netWeight: unknown },
    userId: string,
    reason: string,
  ) {
    const current = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (current && current.weighTicketId !== ticket.id) {
      throw new BadRequestException('所选磅单不是当前入出库有效磅单，请先在物流运单详情中变更选用依据');
    }
    if (!current) {
      await this.prisma.waybillWeightSelection.create({
        data: {
          waybillId, purpose: 'INVENTORY', weighTicketId: ticket.id,
          quantity: Number(ticket.netWeight || 0), reason, selectedBy: userId,
        },
      });
    }
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
      { waybill: { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } } },
      { waybill: { dispatchNotice: { order: { contract: { contractNo: { contains: params.search, mode: 'insensitive' } } } } } },
      { waybill: { weighTickets: { some: { ticketNo: { contains: params.search, mode: 'insensitive' } } } } },
      { waybill: { weighTickets: { some: { qualityInspections: { some: { inspectionNo: { contains: params.search, mode: 'insensitive' } } } } } } },
      { weighTicket: { is: { ticketNo: { contains: params.search, mode: 'insensitive' } } } },
      { qualityInspection: { is: { inspectionNo: { contains: params.search, mode: 'insensitive' } } } },
    ];
    const items = await this.prisma.inboundReceipt.findMany({ where, include: this.include, orderBy: { createdAt: 'desc' } });
    return { items: items.map(item => this.decorateReceipt(item)), total: items.length };
  }

  async findReceipt(id: string, userId: string, permission = 'inventory.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getInboundReceiptScope(userId);
    const item = await this.prisma.inboundReceipt.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!item) throw new NotFoundException('物流入库单不存在');
    return this.decorateReceipt(item);
  }

  async updatePendingReceipt(id: string, dto: UpdatePendingInboundReceiptDto, userId: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'PENDING') throw new BadRequestException('只有待入库单可以补充收货信息');

    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null },
      });
      if (!warehouse) throw new BadRequestException('入库仓库不存在或已停用');
    }

    const updated = await this.prisma.inboundReceipt.update({
      where: { id },
      data: {
        ...(dto.warehouseId ? { warehouseId: dto.warehouseId } : {}),
        ...(dto.receivedAt ? { receivedAt: new Date(dto.receivedAt) } : {}),
        ...(dto.receiverName !== undefined ? { receiverName: dto.receiverName.trim() || null } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
      },
      include: this.include,
    });
    return this.decorateReceipt(updated);
  }

  async confirmReceipt(id: string, userId: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'PENDING') throw new BadRequestException('只有待入库单可以确认收货');
    this.assertQualifiedForInventory(item);
    if (!item.warehouseId) throw new BadRequestException('请先选择入库仓库');
    if (!item.receivedAt) throw new BadRequestException('请先填写实际收货时间');
    if (!item.receiverName?.trim()) throw new BadRequestException('请先填写收货人');
    const currentWeight = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: item.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (!currentWeight || currentWeight.weighTicketId !== item.weighTicketId) {
      throw new BadRequestException('入库单关联磅单与当前入出库有效磅单不一致，请先在物流运单详情中完成选用');
    }
    const updated = await this.prisma.inboundReceipt.update({ where: { id }, data: { status: 'RECEIVED' }, include: this.include });
    return this.decorateReceipt(updated);
  }

  async cancelReceipt(id: string, userId: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'PENDING') throw new BadRequestException('只有待入库单可以作废');
    const updated = await this.prisma.inboundReceipt.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.include,
    });
    return this.decorateReceipt(updated);
  }

  async createAttachment(data: {
    inboundReceiptId: string; fileName: string; originalName: string;
    mimeType: string; size: number; category: string;
  }, userId: string) {
    const receipt = await this.findReceipt(data.inboundReceiptId, userId, 'inventory.manage');
    if (receipt.status !== 'PENDING') throw new BadRequestException('只有待入库单可以上传附件');
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
    if (attachment.inboundReceipt?.status !== 'PENDING') {
      throw new BadRequestException('只有待入库单可以删除附件');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  async postInventory(id: string, userId: string) {
    const receipt = await this.findReceipt(id, userId, 'inventory.manage');
    if (receipt.status !== 'RECEIVED') throw new BadRequestException('确认收货后才能生成业务入库单');
    this.assertQualifiedForInventory(receipt);
    if (receipt.businessInbound) throw new BadRequestException('该物流入库单已生成业务入库单');
    if (!receipt.warehouseId) throw new BadRequestException('入库单缺少入库仓库');
    const currentWeight = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: receipt.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (!currentWeight || currentWeight.weighTicketId !== receipt.weighTicketId) {
      throw new BadRequestException('入库单关联磅单与当前入出库有效磅单不一致，不能入账');
    }
    const warehouseId = receipt.warehouseId;
    const inventoryOwner = receipt.waybill.dispatchNotice.order.contract.signingPartner;
    if (!inventoryOwner) throw new BadRequestException('采购合同缺少我方签约主体，无法确认库存所有权');
    const ownerPartnerId = inventoryOwner.id;
    const line = receipt.waybill.lineItems[0];
    if (!line) throw new BadRequestException('运单缺少物料明细');
    const quantity = Number(receipt.receivedQuantity || 0);
    if (quantity <= 0) throw new BadRequestException('最终入库数量必须大于 0');
    const inboundNo = await this.nextNo('BIN', 'businessInbound');
    const lotNo = `LOT-${inboundNo.replace('BIN-', '')}`;
    await this.prisma.$transaction(async tx => {
      const inbound = await tx.businessInbound.create({
        data: {
          inboundNo, receiptId: receipt.id, warehouseId, ownerPartnerId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, quantity, lotNo, createdBy: userId,
        },
      });
      const lot = await tx.inventoryLot.create({
        data: {
          lotNo, businessInboundId: inbound.id, warehouseId, ownerPartnerId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, initialQuantity: quantity,
          availableQuantity: quantity, qualityConclusion: receipt.acceptanceConclusion!,
        },
      });
      await tx.inventoryLedger.create({
        data: {
          lotId: lot.id, warehouseId, materialId: line.materialId,
          businessType: 'INBOUND', businessNo: inboundNo, quantityChange: quantity,
          balanceAfter: quantity, remarks: `由物流入库单 ${receipt.receiptNo} 生成`, createdBy: userId,
        },
      });
      await tx.inboundReceipt.update({ where: { id: receipt.id }, data: { status: 'POSTED' } });
    });
    return this.findReceipt(id, userId, 'inventory.manage');
  }

  private assertQualifiedForInventory(receipt: {
    acceptanceConclusion: string | null;
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

  async inventoryOverview(params: { search?: string; warehouseId?: string; ownerPartnerId?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInventoryLotScope(userId);
    const where: Prisma.InventoryLotWhereInput = { AND: [scope] };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.ownerPartnerId) where.ownerPartnerId = params.ownerPartnerId;
    if (params.search) where.OR = [
      { lotNo: { contains: params.search, mode: 'insensitive' } },
      { materialName: { contains: params.search, mode: 'insensitive' } },
      { supplierName: { contains: params.search, mode: 'insensitive' } },
      { inventoryOwner: { name: { contains: params.search, mode: 'insensitive' } } },
    ];
    const lots = await this.prisma.inventoryLot.findMany({
      where,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        inventoryOwner: { select: { id: true, code: true, name: true } },
        material: { select: { code: true, unit: true } },
        businessInbound: { select: { inboundNo: true, postedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const reservations = await this.prisma.outboundOrderLine.findMany({
      where: {
        outboundOrder: {
          status: { in: ['PENDING', 'PARTIAL'] },
          warehouseId: { in: [...new Set(lots.map(item => item.warehouseId))] },
        },
        materialId: { in: [...new Set(lots.map(item => item.materialId))] },
      },
      select: {
        materialId: true, reservedQuantity: true, actualQuantity: true,
        outboundOrder: { select: { warehouseId: true, ownerPartnerId: true } },
      },
    });
    const reservedByGroup = new Map<string, number>();
    for (const item of reservations) {
      const key = `${item.outboundOrder.ownerPartnerId || 'UNASSIGNED'}:${item.outboundOrder.warehouseId}:${item.materialId}`;
      reservedByGroup.set(key, (reservedByGroup.get(key) || 0)
        + Math.max(0, Number(item.reservedQuantity) - Number(item.actualQuantity)));
    }
    const remainingByGroup = new Map(reservedByGroup);
    const reservedByLot = new Map<string, number>();
    for (const lot of [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const key = `${lot.ownerPartnerId || 'UNASSIGNED'}:${lot.warehouseId}:${lot.materialId}`;
      const reserved = Math.min(Number(lot.availableQuantity), remainingByGroup.get(key) || 0);
      reservedByLot.set(lot.id, reserved);
      remainingByGroup.set(key, Math.max(0, (remainingByGroup.get(key) || 0) - reserved));
    }
    const enrichedLots = lots.map(lot => ({
      ...lot,
      reservedOutboundQuantity: reservedByLot.get(lot.id) || 0,
      availableToPromiseQuantity: Math.max(0, Number(lot.availableQuantity) - (reservedByLot.get(lot.id) || 0)),
    }));
    const totalPhysicalQuantity = lots.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0);
    const totalReservedQuantity = enrichedLots.reduce((sum, lot) => sum + lot.reservedOutboundQuantity, 0);
    const totalAvailableQuantity = totalPhysicalQuantity - totalReservedQuantity;
    const ownerGroups = new Map<string, any>();
    const warehouseGroups = new Map<string, any>();
    const ownerWarehouseGroups = new Map<string, any>();
    for (const lot of enrichedLots) {
      const ownerKey = lot.ownerPartnerId || 'UNASSIGNED';
      const owner = ownerGroups.get(ownerKey) || {
        ownerPartnerId: lot.ownerPartnerId,
        ownerCode: lot.inventoryOwner?.code || null,
        ownerName: lot.inventoryOwner?.name || '未归属库存主体',
        lotCount: 0,
        materialIds: new Set<string>(),
        warehouseIds: new Set<string>(),
        totalPhysicalQuantity: 0,
        totalReservedQuantity: 0,
        totalAvailableQuantity: 0,
      };
      owner.lotCount += 1;
      owner.materialIds.add(lot.materialId);
      owner.warehouseIds.add(lot.warehouseId);
      owner.totalPhysicalQuantity += Number(lot.availableQuantity);
      owner.totalReservedQuantity += lot.reservedOutboundQuantity;
      owner.totalAvailableQuantity += lot.availableToPromiseQuantity;
      ownerGroups.set(ownerKey, owner);

      const warehouse = warehouseGroups.get(lot.warehouseId) || {
        warehouseId: lot.warehouseId,
        warehouseCode: lot.warehouse.code,
        warehouseName: lot.warehouse.name,
        lotCount: 0,
        materialIds: new Set<string>(),
        ownerIds: new Set<string>(),
        totalPhysicalQuantity: 0,
        totalReservedQuantity: 0,
        totalAvailableQuantity: 0,
      };
      warehouse.lotCount += 1;
      warehouse.materialIds.add(lot.materialId);
      warehouse.ownerIds.add(ownerKey);
      warehouse.totalPhysicalQuantity += Number(lot.availableQuantity);
      warehouse.totalReservedQuantity += lot.reservedOutboundQuantity;
      warehouse.totalAvailableQuantity += lot.availableToPromiseQuantity;
      warehouseGroups.set(lot.warehouseId, warehouse);

      const ownerWarehouseKey = `${ownerKey}:${lot.warehouseId}`;
      const ownerWarehouse = ownerWarehouseGroups.get(ownerWarehouseKey) || {
        ownerPartnerId: lot.ownerPartnerId,
        ownerCode: lot.inventoryOwner?.code || null,
        ownerName: lot.inventoryOwner?.name || '未归属库存主体',
        warehouseId: lot.warehouseId,
        warehouseCode: lot.warehouse.code,
        warehouseName: lot.warehouse.name,
        lotCount: 0,
        materialIds: new Set<string>(),
        totalPhysicalQuantity: 0,
        totalReservedQuantity: 0,
        totalAvailableQuantity: 0,
      };
      ownerWarehouse.lotCount += 1;
      ownerWarehouse.materialIds.add(lot.materialId);
      ownerWarehouse.totalPhysicalQuantity += Number(lot.availableQuantity);
      ownerWarehouse.totalReservedQuantity += lot.reservedOutboundQuantity;
      ownerWarehouse.totalAvailableQuantity += lot.availableToPromiseQuantity;
      ownerWarehouseGroups.set(ownerWarehouseKey, ownerWarehouse);
    }
    const ownerSummaries = [...ownerGroups.values()].map(item => ({
      ...item,
      materialCount: item.materialIds.size,
      warehouseCount: item.warehouseIds.size,
      materialIds: undefined,
      warehouseIds: undefined,
    })).sort((a, b) => b.totalPhysicalQuantity - a.totalPhysicalQuantity);
    const warehouseSummaries = [...warehouseGroups.values()].map(item => ({
      ...item,
      materialCount: item.materialIds.size,
      ownerCount: item.ownerIds.size,
      materialIds: undefined,
      ownerIds: undefined,
    })).sort((a, b) => b.totalPhysicalQuantity - a.totalPhysicalQuantity);
    const ownerWarehouseSummaries = [...ownerWarehouseGroups.values()].map(item => ({
      ...item,
      materialCount: item.materialIds.size,
      materialIds: undefined,
    })).sort((a, b) => b.totalPhysicalQuantity - a.totalPhysicalQuantity);
    return {
      lots: enrichedLots,
      ownerSummaries,
      warehouseSummaries,
      ownerWarehouseSummaries,
      summary: {
        lotCount: lots.length,
        materialCount: new Set(lots.map(item => item.materialId)).size,
        warehouseCount: new Set(lots.map(item => item.warehouseId)).size,
        ownerCount: new Set(lots.map(item => item.ownerPartnerId || 'UNASSIGNED')).size,
        totalQuantity: totalAvailableQuantity,
        totalPhysicalQuantity,
        totalReservedQuantity,
        totalAvailableQuantity,
      },
    };
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
