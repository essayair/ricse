import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateInboundReceiptDto } from './dto/create-inbound-receipt.dto';
import { UpdatePendingInboundReceiptDto } from './dto/update-pending-inbound-receipt.dto';
import { inboundReceiptDefaults } from './inbound-receipt-defaults';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    warehouse: { select: { id: true, code: true, name: true, manager: true } },
    creator: { select: { id: true, name: true } },
    weighTicket: {
      select: {
        id: true, ticketNo: true, status: true, deletedAt: true, settlementWeight: true, netWeight: true,
        abnormal: true, reviewedAt: true, weighingStage: true, sequence: true,
      },
    },
    qualityInspection: {
      select: {
        id: true, inspectionNo: true, institutionType: true, institutionName: true,
        reportNo: true, status: true, conclusion: true, resolution: true, settlementWeight: true,
        moistureDeductionWeight: true, impurityDeductionWeight: true, deductionAmount: true,
        indicators: { select: { code: true, name: true, unit: true, operator: true, standardValue: true, upperValue: true, fuseValue: true, measuredValue: true, result: true }, orderBy: { sort: 'asc' as const } },
        qualityTask: { select: { qualityDisposition: true, qualityDeductionPerTon: true, contractQualityEvaluation: true } },
      },
    },
    waybill: {
      include: {
        qualityTask: {
          select: {
            id: true, taskNo: true, status: true, finalConclusion: true, qualityDisposition: true,
            basisInspectionId: true, finalizedReportCount: true,
          },
        },
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
                status: true, conclusion: true, testedAt: true, confirmedAt: true, qualityTaskId: true,
              },
              orderBy: { testedAt: 'desc' as const },
            },
          },
          orderBy: { createdAt: 'desc' as const },
        },
        dispatchNotice: {
          include: {
            destinationWarehouse: { select: { id: true, name: true, address: true, manager: true, status: true, deletedAt: true } },
            warehouse: { select: { id: true, manager: true, status: true, deletedAt: true } },
            order: {
              include: {
                contract: {
                  select: {
                    id: true, contractNo: true, title: true,
                    seller: { select: { id: true, name: true } },
                    signingPartner: { select: { id: true, code: true, name: true } },
                    businessUnit: { select: { id: true, code: true, name: true } },
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

  private qualityEvaluationSnapshot(value: unknown) {
    return value == null ? Prisma.DbNull : value as Prisma.InputJsonValue;
  }

  private decorateReceipt<T>(receipt: T): T & { workflow: ReturnType<InventoryService['buildWorkflow']>; receiptDefaults: ReturnType<typeof inboundReceiptDefaults>; reportMeasuredMoisturePct: number | null; qualityException: boolean } {
    const report = (receipt as any).qualityInspection;
    const moisture = this.readMeasuredMoisture(report?.indicators || []);
    return { ...receipt, workflow: this.buildWorkflow(receipt as any), receiptDefaults: inboundReceiptDefaults(receipt as any), reportMeasuredMoisturePct: moisture?.toNumber() ?? null,
      qualityException: Boolean(report && this.isQualityException((receipt as any).acceptanceConclusion, report)) };
  }

  private isQualityException(disposition: string | null | undefined, report?: { conclusion?: string; indicators?: Array<{ result?: string }>; qualityTask?: { contractQualityEvaluation?: unknown } } | null) {
    const evaluation = report?.qualityTask?.contractQualityEvaluation as { items?: Array<{ result?: string }> } | null | undefined;
    return !['PASS', 'LEGACY'].includes(disposition || '')
      || report?.conclusion === 'FUSE'
      || (report?.indicators || []).some(indicator => ['FAIL', 'FUSE'].includes(indicator.result || ''))
      || (evaluation?.items || []).some(item => item.result !== 'PASS');
  }

  private buildWorkflow(receipt: any) {
    const waybill = receipt.waybill || {};
    const tickets = waybill.weighTickets || [];
    const activeTickets = tickets.filter((ticket: any) => ticket.status !== 'VOIDED');
    const reviewedTickets = activeTickets.filter((ticket: any) => ticket.status === 'REVIEWED');
    const inspections = reviewedTickets.flatMap((ticket: any) => ticket.qualityInspections || []);
    const qualityTask = waybill.qualityTask;
    const confirmedReport = inspections.find((inspection: any) => inspection.status === 'CONFIRMED');
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
    } else if (receipt.qualityInspection?.status === 'CONFIRMED' && qualityTask?.status === 'COMPLETED' && qualityTask.basisInspectionId === receipt.qualityInspectionId) {
      const abnormal = this.isQualityException(qualityTask.qualityDisposition, receipt.qualityInspection);
      stage = 'READY_TO_RECEIVE'; stageLabel = abnormal ? '质检异常待人工确认' : '合格待收货';
      blocker = abnormal ? '质检存在异常，请核对实测指标并填写人工接收原因；系统不自动阻止入库' : '最终验收依据已确认，可以补齐收货信息并确认收货';
      tone = abnormal ? 'warning' : 'success';
    } else if (!inspections.length) {
      stage = 'WAITING_QUALITY'; stageLabel = '已过磅待质检'; blocker = qualityTask ? '到货质检任务已生成，等待录入检测报告' : '等待系统生成到货质检任务'; tone = 'warning';
    } else if (qualityTask?.status === 'COMPLETED' && qualityTask.basisInspectionId) {
      stage = 'WAITING_ACCEPTANCE_SELECTION'; stageLabel = '待同步质检依据'; blocker = '质检任务已确定最终报告，请采用任务执行口径同步入库单'; tone = 'warning';
    } else if (inProgressQuality) {
      stage = 'QUALITY_IN_PROGRESS'; stageLabel = '质检处理中'; blocker = '质检单尚未确认，等待检测或报告确认'; tone = 'warning';
    } else if (confirmedException) {
      stage = 'QUALITY_EXCEPTION'; stageLabel = '质检异常';
      blocker = '已有异常检测报告，请先在质检任务中选定最终执行口径报告';
      tone = 'danger';
    } else if (confirmedReport) {
      stage = 'WAITING_ACCEPTANCE_SELECTION'; stageLabel = '待确定质检依据'; blocker = '已有确认的检测报告，等待质检任务最终判定'; tone = 'warning';
    } else {
      stage = 'WAITING_QUALITY'; stageLabel = '等待质检结论'; blocker = '尚无已确认的最终质检结果'; tone = 'warning';
    }

    const transportLabel = waybill.status === 'SIGNED' ? '已收货' : waybill.status === 'ARRIVED' ? '已到达待收货' : waybill.status === 'IN_TRANSIT' ? '运输在途' : '待发运';
    const weighLabel = !activeTickets.length
      ? '未过磅'
      : reviewedTickets.length
        ? `${reviewedTickets.length} 张已复核`
        : activeTickets.some((ticket: any) => ticket.status === 'COMPLETED') ? '待复核' : '称重中';
    const qualityLabel = qualityTask?.status === 'COMPLETED'
      ? `最终${qualityTask.finalConclusion === 'PASS' ? '合格' : qualityTask.finalConclusion === 'DEDUCTION' ? '超标扣款' : qualityTask.finalConclusion === 'FUSE' ? '不合格（拒收）' : '待判定'}`
      : qualityTask
        ? `${qualityTask.taskNo} · ${inspections.length} 份报告`
        : '未生成质检任务';

    return {
      stage, stageLabel, blocker, tone,
      milestones: {
        transport: { label: transportLabel, complete: ['ARRIVED', 'SIGNED'].includes(waybill.status) },
        signed: { label: waybill.status === 'SIGNED' ? '已收货' : '待收货', complete: waybill.status === 'SIGNED' },
        weigh: { label: weighLabel, complete: reviewedTickets.length > 0 },
        quality: { label: qualityLabel, complete: Boolean(receipt.qualityInspection?.status === 'CONFIRMED' && qualityTask?.status === 'COMPLETED') },
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
          warehouseId: waybill.dispatchNotice.destinationWarehouseId,
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
    const scope = await this.accessControl.getWaybillScope(userId, 'inventory.view');
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
            qualityInspections: { some: { deletedAt: null, status: 'CONFIRMED', basisForTasks: { some: { status: 'COMPLETED' } } } },
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
              where: { deletedAt: null, status: 'CONFIRMED', basisForTasks: { some: { status: 'COMPLETED' } } },
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
    const scope = await this.accessControl.getWaybillScope(userId, 'inventory.manage');
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
      where: {
        id: dto.qualityInspectionId, deletedAt: null, weighTicket: { waybillId: waybill.id },
        qualityTask: { status: 'COMPLETED', basisInspectionId: dto.qualityInspectionId },
      },
      include: { qualityTask: { select: { qualityDisposition: true, qualityDeductionPerTon: true, contractQualityEvaluation: true } } },
    });
    if (!quality || quality.status !== 'CONFIRMED') throw new BadRequestException('请选择该运单下已确认的质检单');
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null } });
    if (!warehouse) throw new BadRequestException('入库仓库不存在或已停用');
    const operator = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!operator) throw new BadRequestException('当前操作人不存在');
    const quantity = this.inventoryQuantity(weighTicket);
    if (quantity <= 0) throw new BadRequestException('有效磅单净重必须大于 0');
    await this.ensureInventorySelection(waybill.id, weighTicket, userId, '采购入库作业首次选用');

    const receipt = await this.prisma.inboundReceipt.create({
      data: {
        receiptNo: await this.nextNo('LIR', 'inboundReceipt'), waybillId: waybill.id,
        weighTicketId: weighTicket.id, qualityInspectionId: quality.id, warehouseId: warehouse.id,
        status: 'PENDING',
        acceptanceConclusion: (quality as any).qualityTask.qualityDisposition, materialName: quality.materialName,
        materialSpec: quality.materialSpec, supplierName: quality.supplierName,
        plateNo: quality.plateNo || waybill.plateNo,
        plannedQuantity: waybill.totalQuantity,
        receivedQuantity: quantity,
        moistureDeductionWeight: quality.moistureDeductionWeight,
        impurityDeductionWeight: quality.impurityDeductionWeight,
        deductionAmount: quality.deductionAmount, receivedAt: new Date(dto.receivedAt),
        contractQualityDeductionPerTon: (quality as any).qualityTask.qualityDeductionPerTon,
        contractQualityEvaluation: this.qualityEvaluationSnapshot((quality as any).qualityTask.contractQualityEvaluation),
        receiverName: operator.name, remarks: dto.remarks?.trim() || null, createdBy: userId,
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
        qualityTask: { status: 'COMPLETED', basisInspectionId: qualityInspectionId },
      },
      include: { qualityTask: { select: { qualityDisposition: true, qualityDeductionPerTon: true, contractQualityEvaluation: true } },
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
    if (!quality) throw new BadRequestException('请选择质检任务最终采用的已确认检测报告');

    const ticket = quality.weighTicket;
    const waybill = ticket.waybill;
    if (waybill.dispatchNotice.type !== 'PURCHASE') return null;

    const currentSelection = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: waybill.id, purpose: 'INVENTORY', isCurrent: true },
      include: { weighTicket: true },
    });
    const candidateTicket = currentSelection?.weighTicket || await this.prisma.weighTicket.findFirst({
      where: {
        waybillId: waybill.id, deletedAt: null, status: 'REVIEWED', weighingStage: 'SHIPPING',
      },
      orderBy: [{ sequence: 'asc' }, { reviewedAt: 'asc' }],
    }) || ticket;
    // 质检结论与入库重量分开同步：即使异常报告先判定、磅单尚未复核，也要先记录最终报告。
    const inventoryTicket = candidateTicket.status === 'REVIEWED' && !candidateTicket.deletedAt
      && this.inventoryQuantity(candidateTicket) > 0 ? candidateTicket : null;
    const quantity = inventoryTicket ? this.inventoryQuantity(inventoryTicket) : null;
    if (!currentSelection && inventoryTicket) {
      await this.ensureInventorySelection(waybill.id, inventoryTicket, userId, '采购默认选用发货称重磅单');
    }

    const existing = waybill.inboundReceipts[0];
    if (existing) {
      // 仅任务级最终结论可以指定执行口径；复判时允许在待入库阶段同步新口径。
      if (existing.status !== 'PENDING') {
        return this.decorateReceipt(existing);
      }
      const updated = await this.prisma.inboundReceipt.update({
        where: { id: existing.id },
        data: {
          ...(inventoryTicket ? { weighTicketId: inventoryTicket.id, receivedQuantity: quantity } : {}),
          qualityInspectionId: quality.id,
          acceptanceConclusion: (quality as any).qualityTask.qualityDisposition,
          contractQualityDeductionPerTon: (quality as any).qualityTask.qualityDeductionPerTon,
          contractQualityEvaluation: this.qualityEvaluationSnapshot((quality as any).qualityTask.contractQualityEvaluation),
          materialName: quality.materialName,
          materialSpec: quality.materialSpec,
          supplierName: quality.supplierName,
          plateNo: quality.plateNo || waybill.plateNo,
          pricingQuantity: null,
          pricingQuantityBasis: null,
          measuredMoisturePct: null,
          moistureDeductionWeight: quality.moistureDeductionWeight,
          impurityDeductionWeight: quality.impurityDeductionWeight,
          deductionAmount: quality.deductionAmount,
          qualityExceptionReason: null,
          qualityExceptionAcceptedBy: null,
          qualityExceptionAcceptedAt: null,
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
          weighTicketId: inventoryTicket?.id || null,
          qualityInspectionId: quality.id,
          warehouseId: waybill.dispatchNotice.destinationWarehouseId,
          status: 'PENDING',
          acceptanceConclusion: (quality as any).qualityTask.qualityDisposition,
          materialName: quality.materialName,
          materialSpec: quality.materialSpec,
          supplierName: quality.supplierName,
          plateNo: quality.plateNo || waybill.plateNo,
          plannedQuantity: waybill.totalQuantity,
          receivedQuantity: quantity,
          moistureDeductionWeight: quality.moistureDeductionWeight,
          impurityDeductionWeight: quality.impurityDeductionWeight,
          deductionAmount: quality.deductionAmount,
          contractQualityDeductionPerTon: (quality as any).qualityTask.qualityDeductionPerTon,
          contractQualityEvaluation: this.qualityEvaluationSnapshot((quality as any).qualityTask.contractQualityEvaluation),
          receivedAt: null,
          receiverName: null,
          remarks: '由到货质检任务最终结论自动补齐验收依据',
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
        qualityTask: { status: 'COMPLETED', basisInspectionId: qualityInspectionId },
        weighTicket: { waybillId: receipt.waybillId, deletedAt: null },
      },
      include: { weighTicket: true, qualityTask: { select: { qualityDisposition: true, qualityDeductionPerTon: true, contractQualityEvaluation: true } } },
    });
    if (!quality) throw new BadRequestException('只能使用本运单到货质检任务最终采用的已确认报告');
    const currentSelection = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: receipt.waybillId, purpose: 'INVENTORY', isCurrent: true },
      include: { weighTicket: true },
    });
    const candidateTicket = currentSelection?.weighTicket || receipt.weighTicket || await this.prisma.weighTicket.findFirst({
      where: { waybillId: receipt.waybillId, deletedAt: null, status: 'REVIEWED', weighingStage: 'SHIPPING' },
      orderBy: [{ sequence: 'asc' }, { reviewedAt: 'asc' }],
    }) || quality.weighTicket;
    const inventoryTicket = candidateTicket.status === 'REVIEWED' && !candidateTicket.deletedAt
      && this.inventoryQuantity(candidateTicket) > 0 ? candidateTicket : null;
    const quantity = inventoryTicket ? this.inventoryQuantity(inventoryTicket) : null;
    if (!currentSelection && inventoryTicket) {
      await this.ensureInventorySelection(receipt.waybillId, inventoryTicket, userId, '采用最终质检报告时补齐入库磅单');
    }
    const updated = await this.prisma.inboundReceipt.update({
      where: { id },
      data: {
        ...(inventoryTicket ? { weighTicketId: inventoryTicket.id, receivedQuantity: quantity } : {}),
        qualityInspectionId: quality.id,
        acceptanceConclusion: (quality as any).qualityTask.qualityDisposition,
        contractQualityDeductionPerTon: (quality as any).qualityTask.qualityDeductionPerTon,
        contractQualityEvaluation: this.qualityEvaluationSnapshot((quality as any).qualityTask.contractQualityEvaluation),
        materialName: quality.materialName,
        materialSpec: quality.materialSpec,
        supplierName: quality.supplierName,
        plateNo: quality.plateNo || receipt.plateNo,
        pricingQuantity: null,
        pricingQuantityBasis: null,
        measuredMoisturePct: null,
        moistureDeductionWeight: quality.moistureDeductionWeight,
        impurityDeductionWeight: quality.impurityDeductionWeight,
        deductionAmount: quality.deductionAmount,
        qualityExceptionReason: null,
        qualityExceptionAcceptedBy: null,
        qualityExceptionAcceptedAt: null,
      },
      include: this.include,
    });
    return this.decorateReceipt(updated);
  }

  private inventoryQuantity(ticket: { netWeight: unknown }) {
    return new Prisma.Decimal(String(ticket.netWeight || 0)).toDecimalPlaces(3).toNumber();
  }

  private readMeasuredMoisture(indicators: Array<{ code: string; name: string; unit: string; measuredValue: Prisma.Decimal | null }>) {
    const values = indicators.filter(item => /^(MOISTURE|WATER|H2O|水分)$/i.test(item.code.trim()) || item.name.includes('水分'));
    if (values.length !== 1 || values[0].measuredValue == null || !['%', '％'].includes(values[0].unit.trim())) return null;
    const moisture = new Prisma.Decimal(values[0].measuredValue);
    return moisture.gte(0) && moisture.lt(100) ? moisture : null;
  }

  private async pricingSnapshot(materialId: string, qualityInspectionId: string, physicalQuantity: number) {
    const material = await this.prisma.material.findUnique({ where: { id: materialId }, select: { pricingQuantityBasis: true, name: true } });
    if (!material) throw new BadRequestException('入库物料不存在');
    const basis = material.pricingQuantityBasis;
    if (!['PHYSICAL', 'DRY_MATTER'].includes(basis)) throw new BadRequestException('物料计价数量口径无效');
    const report = await this.prisma.qualityInspection.findUnique({
      where: { id: qualityInspectionId },
      select: { status: true, indicators: { select: { code: true, name: true, unit: true, measuredValue: true } } },
    });
    if (!report || report.status !== 'CONFIRMED') throw new BadRequestException('须先确认最终质检报告');
    const moisture = this.readMeasuredMoisture(report.indicators);
    if (basis === 'PHYSICAL') return { pricingQuantity: physicalQuantity, pricingQuantityBasis: basis, measuredMoisturePct: moisture?.toNumber() ?? null };
    if (!moisture) {
      throw new BadRequestException(`物料“${material.name}”按折干计价，请在最终采用的质检报告中确认唯一的水分实测值（%）`);
    }
    const pricingQuantity = new Prisma.Decimal(physicalQuantity).mul(new Prisma.Decimal(1).minus(moisture.div(100))).toDecimalPlaces(3).toNumber();
    if (pricingQuantity <= 0) throw new BadRequestException('折干后的计价数量必须大于 0');
    return { pricingQuantity, pricingQuantityBasis: basis, measuredMoisturePct: moisture.toNumber() };
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
      throw new BadRequestException('所选磅单不是当前结算入库磅单，请先在磅单信息详情中变更选用依据');
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
    const scope = await this.accessControl.getInboundReceiptScope(userId, 'inventory.view');
    const where: Prisma.InboundReceiptWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.search) where.OR = [
      { receiptNo: { contains: params.search, mode: 'insensitive' } },
      { materialName: { contains: params.search, mode: 'insensitive' } },
      { supplierName: { contains: params.search, mode: 'insensitive' } },
      { plateNo: { contains: params.search, mode: 'insensitive' } },
      { waybill: { waybillNo: { contains: params.search, mode: 'insensitive' } } },
      { waybill: { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } } },
      { waybill: { dispatchNotice: { order: { contract: { businessUnit: { name: { contains: params.search, mode: 'insensitive' } } } } } } },
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
    const scope = await this.accessControl.getInboundReceiptScope(userId, permission);
    const item = await this.prisma.inboundReceipt.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!item) throw new NotFoundException('物流入库单不存在');
    const operator = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    let pricingPreview: Awaited<ReturnType<InventoryService['pricingSnapshot']>> | null = null;
    let pricingPreviewError: string | null = null;
    const materialId = item.waybill.lineItems?.[0]?.materialId;
    const physicalQuantity = item.weighTicket ? this.inventoryQuantity(item.weighTicket) : 0;
    if (item.status === 'PENDING' && item.weighTicket?.status === 'REVIEWED'
      && item.qualityInspection?.status === 'CONFIRMED'
      && item.waybill.qualityTask?.status === 'COMPLETED'
      && item.waybill.qualityTask.basisInspectionId === item.qualityInspectionId
      && materialId && item.qualityInspectionId && physicalQuantity > 0) {
      try {
        pricingPreview = await this.pricingSnapshot(materialId, item.qualityInspectionId, physicalQuantity);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        pricingPreviewError = error.message;
      }
    }
    return { ...this.decorateReceipt(item), currentOperatorName: operator?.name || null, pricingPreview, pricingPreviewError };
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
        ...(dto.remarks !== undefined ? { remarks: dto.remarks.trim() || null } : {}),
      },
      include: this.include,
    });
    return this.decorateReceipt(updated);
  }

  async confirmReceipt(id: string, userId: string, qualityExceptionReason?: string) {
    const item = await this.findReceipt(id, userId, 'inventory.manage');
    if (item.status !== 'PENDING') throw new BadRequestException('只有待入库单可以确认收货');
    if (item.qualityInspection && this.isQualityException(item.acceptanceConclusion, item.qualityInspection) && !qualityExceptionReason?.trim()) {
      throw new BadRequestException('质检指标存在异常，请核对后填写人工确认接收入库的原因');
    }
    this.assertQualifiedForInventory(item, qualityExceptionReason);
    if (!item.warehouseId) throw new BadRequestException('请先选择入库仓库');
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: item.warehouseId, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!warehouse) throw new BadRequestException('入库仓库已停用或不存在，请重新选择');
    if (!item.receivedAt) throw new BadRequestException('请先填写实际收货时间');
    if (!item.currentOperatorName) throw new BadRequestException('当前操作人不存在');
    const currentWeight = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: item.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (!currentWeight || currentWeight.weighTicketId !== item.weighTicketId) {
      throw new BadRequestException('入库单关联磅单与当前结算入库磅单不一致，请先在磅单信息详情中完成选用');
    }
    const materialId = item.waybill.lineItems[0]?.materialId;
    if (!materialId || !item.qualityInspectionId || !item.weighTicket) throw new BadRequestException('入库单缺少物料、磅单或最终质检依据');
    const physicalQuantity = this.inventoryQuantity(item.weighTicket);
    if (physicalQuantity <= 0) throw new BadRequestException('有效磅单净重必须大于 0');
    const pricing = await this.pricingSnapshot(materialId, item.qualityInspectionId, physicalQuantity);
    const abnormal = this.isQualityException(item.acceptanceConclusion, item.qualityInspection);
    const updated = await this.prisma.inboundReceipt.update({ where: { id }, data: {
      status: 'RECEIVED', receivedQuantity: physicalQuantity, ...pricing,
      receiverName: item.currentOperatorName,
      qualityExceptionReason: abnormal ? qualityExceptionReason?.trim() : null,
      qualityExceptionAcceptedBy: abnormal ? userId : null,
      qualityExceptionAcceptedAt: abnormal ? new Date() : null,
      quantitySource: 'NEW', quantityReconciledAt: null,
    }, include: this.include });
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
    const scope = await this.accessControl.getInboundReceiptScope(userId, permission);
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
    if (receipt.quantitySource === 'LEGACY_UNVERIFIED') {
      throw new BadRequestException('历史收货数量尚未依据选定磅单和最终质检报告核对，不能直接入账；请管理员先执行历史数量核对');
    }
    this.assertQualifiedForInventory(receipt);
    if (receipt.businessInbound) throw new BadRequestException('该物流入库单已生成业务入库单');
    if (!receipt.warehouseId) throw new BadRequestException('入库单缺少入库仓库');
    const currentWeight = await this.prisma.waybillWeightSelection.findFirst({
      where: { waybillId: receipt.waybillId, purpose: 'INVENTORY', isCurrent: true },
    });
    if (!currentWeight || currentWeight.weighTicketId !== receipt.weighTicketId) {
      throw new BadRequestException('入库单关联磅单与当前结算入库磅单不一致，不能入账');
    }
    const warehouseId = receipt.warehouseId;
    const inventoryOwner = receipt.waybill.dispatchNotice.order.contract.signingPartner;
    if (!inventoryOwner) throw new BadRequestException('采购合同缺少我方签约主体，无法确认库存所有权');
    const ownerPartnerId = inventoryOwner.id;
    const businessUnitId = receipt.waybill.dispatchNotice.order.contract.businessUnit?.id;
    if (!businessUnitId) throw new BadRequestException('采购合同缺少业务单元（事业部），无法确认库存经营归属');
    const line = receipt.waybill.lineItems[0];
    if (!line) throw new BadRequestException('运单缺少物料明细');
    const quantity = Number(receipt.receivedQuantity || 0);
    if (quantity <= 0) throw new BadRequestException('最终入库数量必须大于 0');
    if (!receipt.qualityInspectionId) throw new BadRequestException('入库单缺少最终质检依据');
    const pricing = await this.pricingSnapshot(line.materialId, receipt.qualityInspectionId, quantity);
    if (receipt.pricingQuantity != null && (
      Number(receipt.pricingQuantity) !== pricing.pricingQuantity
      || receipt.pricingQuantityBasis !== pricing.pricingQuantityBasis
      || (receipt.measuredMoisturePct == null
        ? pricing.pricingQuantityBasis === 'DRY_MATTER' && pricing.measuredMoisturePct != null
        : Number(receipt.measuredMoisturePct) !== pricing.measuredMoisturePct)
    )) throw new BadRequestException('确认收货后物料计价口径或最终质检水分发生变化，请先复核入库单，不能直接过账');
    const inboundNo = await this.nextNo('BIN', 'businessInbound');
    const lotNo = `LOT-${inboundNo.replace('BIN-', '')}`;
    await this.prisma.$transaction(async tx => {
      const inbound = await tx.businessInbound.create({
        data: {
          inboundNo, receiptId: receipt.id, warehouseId, ownerPartnerId, businessUnitId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, quantity, ...pricing, lotNo, createdBy: userId,
        },
      });
      const lot = await tx.inventoryLot.create({
        data: {
          lotNo, businessInboundId: inbound.id, warehouseId, ownerPartnerId, businessUnitId,
          materialId: line.materialId, materialName: receipt.materialName,
          supplierName: receipt.supplierName, initialQuantity: quantity,
          availableQuantity: quantity, pricingInitialQuantity: pricing.pricingQuantity,
          pricingAvailableQuantity: pricing.pricingQuantity, pricingQuantityBasis: pricing.pricingQuantityBasis,
          qualityConclusion: receipt.acceptanceConclusion!,
        },
      });
      await tx.inventoryLedger.create({
        data: {
          lotId: lot.id, warehouseId, materialId: line.materialId, businessUnitId,
          businessType: 'INBOUND', businessNo: inboundNo, quantityChange: quantity,
          balanceAfter: quantity, pricingQuantityChange: pricing.pricingQuantity,
          pricingBalanceAfter: pricing.pricingQuantity, remarks: `由物流入库单 ${receipt.receiptNo} 生成`, createdBy: userId,
        },
      });
      await tx.inboundReceipt.update({ where: { id: receipt.id }, data: { status: 'POSTED', ...pricing } });
    });
    return this.findReceipt(id, userId, 'inventory.manage');
  }

  private assertQualifiedForInventory(receipt: any, qualityExceptionReason?: string) {
    if (receipt.qualityInspection?.status !== 'CONFIRMED' || !receipt.qualityInspectionId) {
      throw new BadRequestException('请先选定并确认最终质检报告');
    }
    const task = receipt.waybill?.qualityTask;
    if (task && (task.status !== 'COMPLETED' || task.basisInspectionId !== receipt.qualityInspectionId)) {
      throw new BadRequestException('当前质检报告不是任务最终采用的报告，请刷新后重试');
    }
    if (this.isQualityException(receipt.acceptanceConclusion, receipt.qualityInspection)
      && !(qualityExceptionReason?.trim() || receipt.qualityExceptionReason?.trim())) {
      throw new BadRequestException('质检指标存在异常，请核对后填写人工确认接收入库的原因');
    }
  }

  async inventoryOverview(params: { search?: string; warehouseId?: string; ownerPartnerId?: string; businessUnitId?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInventoryLotScope(userId, 'inventory.view');
    const where: Prisma.InventoryLotWhereInput = { AND: [scope] };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.ownerPartnerId) where.ownerPartnerId = params.ownerPartnerId;
    if (params.businessUnitId) where.businessUnitId = params.businessUnitId;
    if (params.search) where.OR = [
      { lotNo: { contains: params.search, mode: 'insensitive' } },
      { materialName: { contains: params.search, mode: 'insensitive' } },
      { supplierName: { contains: params.search, mode: 'insensitive' } },
      { inventoryOwner: { name: { contains: params.search, mode: 'insensitive' } } },
      { businessUnit: { name: { contains: params.search, mode: 'insensitive' } } },
    ];
    const lots = await this.prisma.inventoryLot.findMany({
      where,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        inventoryOwner: { select: { id: true, code: true, name: true } },
        businessUnit: { select: { id: true, code: true, name: true } },
        material: { select: { code: true, unit: true, commodityForm: true, spec: true, pricingQuantityBasis: true } },
        businessInbound: { select: { inboundNo: true, postedAt: true } },
        productionCompletion: {
          select: {
            completionNo: true,
            postedAt: true,
            task: { select: { id: true, taskNo: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const productionReservations = await this.prisma.productionMaterialAllocation.groupBy({
      by: ['inventoryLotId'],
      where: {
        inventoryLotId: { in: lots.map(item => item.id) },
        issuedQuantity: 0,
        taskInput: {
          task: { deletedAt: null, status: { in: ['RELEASED', 'MATERIAL_PREPARED'] } },
        },
      },
      _sum: { reservedQuantity: true },
    }) || [];
    const productionReservedByLot = new Map(
      productionReservations.map(item => [item.inventoryLotId, Number(item._sum.reservedQuantity || 0)]),
    );
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
        outboundOrder: { select: { warehouseId: true, ownerPartnerId: true, businessUnitId: true } },
      },
    });
    const reservedByGroup = new Map<string, number>();
    for (const item of reservations) {
      const key = `${item.outboundOrder.businessUnitId || 'UNASSIGNED'}:${item.outboundOrder.ownerPartnerId || 'UNASSIGNED'}:${item.outboundOrder.warehouseId}:${item.materialId}`;
      reservedByGroup.set(key, (reservedByGroup.get(key) || 0)
        + Math.max(0, Number(item.reservedQuantity) - Number(item.actualQuantity)));
    }
    const remainingByGroup = new Map(reservedByGroup);
    const reservedByLot = new Map<string, number>();
    for (const lot of [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const key = `${lot.businessUnitId || 'UNASSIGNED'}:${lot.ownerPartnerId || 'UNASSIGNED'}:${lot.warehouseId}:${lot.materialId}`;
      const remainingAfterProduction = Math.max(
        0,
        Number(lot.availableQuantity) - (productionReservedByLot.get(lot.id) || 0),
      );
      const reserved = Math.min(remainingAfterProduction, remainingByGroup.get(key) || 0);
      reservedByLot.set(lot.id, reserved);
      remainingByGroup.set(key, Math.max(0, (remainingByGroup.get(key) || 0) - reserved));
    }
    const enrichedLots = lots.map(lot => {
      const reservedOutboundQuantity = reservedByLot.get(lot.id) || 0;
      const reservedProductionQuantity = productionReservedByLot.get(lot.id) || 0;
      const totalReservedQuantity = reservedOutboundQuantity + reservedProductionQuantity;
      return {
        ...lot,
        reservedOutboundQuantity,
        reservedProductionQuantity,
        totalReservedQuantity,
        availableToPromiseQuantity: Math.max(0, Number(lot.availableQuantity) - totalReservedQuantity),
      };
    });
    const totalPhysicalQuantity = lots.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0);
    const totalReservedQuantity = enrichedLots.reduce((sum, lot) => sum + lot.totalReservedQuantity, 0);
    const totalAvailableQuantity = totalPhysicalQuantity - totalReservedQuantity;
    const quantityTotalsByUnit = [...new Set(lots.map(lot => lot.material.unit))].map(unit => {
      const rows = enrichedLots.filter(lot => lot.material.unit === unit);
      return { unit,
        physicalQuantity: rows.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0),
        reservedQuantity: rows.reduce((sum, lot) => sum + lot.totalReservedQuantity, 0),
        availableQuantity: rows.reduce((sum, lot) => sum + lot.availableToPromiseQuantity, 0),
      };
    });
    const ownerGroups = new Map<string, any>();
    const businessUnitGroups = new Map<string, any>();
    const warehouseGroups = new Map<string, any>();
    const ownerWarehouseGroups = new Map<string, any>();
    for (const lot of enrichedLots) {
      const businessUnitKey = lot.businessUnitId || 'UNASSIGNED';
      const businessUnit = businessUnitGroups.get(businessUnitKey) || {
        businessUnitId: lot.businessUnitId,
        businessUnitCode: lot.businessUnit?.code || null,
        businessUnitName: lot.businessUnit?.name || '未归属业务单元（事业部）',
        lotCount: 0,
        materialIds: new Set<string>(),
        warehouseIds: new Set<string>(),
        ownerIds: new Set<string>(),
        totalPhysicalQuantity: 0,
        totalReservedQuantity: 0,
        totalAvailableQuantity: 0,
      };
      businessUnit.lotCount += 1;
      businessUnit.materialIds.add(lot.materialId);
      businessUnit.warehouseIds.add(lot.warehouseId);
      businessUnit.ownerIds.add(lot.ownerPartnerId || 'UNASSIGNED');
      businessUnit.totalPhysicalQuantity += Number(lot.availableQuantity);
      businessUnit.totalReservedQuantity += lot.totalReservedQuantity;
      businessUnit.totalAvailableQuantity += lot.availableToPromiseQuantity;
      businessUnitGroups.set(businessUnitKey, businessUnit);

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
      owner.totalReservedQuantity += lot.totalReservedQuantity;
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
      warehouse.totalReservedQuantity += lot.totalReservedQuantity;
      warehouse.totalAvailableQuantity += lot.availableToPromiseQuantity;
      warehouseGroups.set(lot.warehouseId, warehouse);

      const ownerWarehouseKey = `${businessUnitKey}:${ownerKey}:${lot.warehouseId}`;
      const ownerWarehouse = ownerWarehouseGroups.get(ownerWarehouseKey) || {
        businessUnitId: lot.businessUnitId,
        businessUnitCode: lot.businessUnit?.code || null,
        businessUnitName: lot.businessUnit?.name || '未归属业务单元（事业部）',
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
      ownerWarehouse.totalReservedQuantity += lot.totalReservedQuantity;
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
    const businessUnitSummaries = [...businessUnitGroups.values()].map(item => ({
      ...item,
      materialCount: item.materialIds.size,
      warehouseCount: item.warehouseIds.size,
      ownerCount: item.ownerIds.size,
      materialIds: undefined,
      warehouseIds: undefined,
      ownerIds: undefined,
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
      businessUnitSummaries,
      ownerSummaries,
      warehouseSummaries,
      ownerWarehouseSummaries,
      summary: {
        lotCount: lots.length,
        materialCount: new Set(lots.map(item => item.materialId)).size,
        warehouseCount: new Set(lots.map(item => item.warehouseId)).size,
        ownerCount: new Set(lots.map(item => item.ownerPartnerId || 'UNASSIGNED')).size,
        businessUnitCount: new Set(lots.map(item => item.businessUnitId || 'UNASSIGNED')).size,
        totalQuantity: totalAvailableQuantity,
        totalPhysicalQuantity,
        totalReservedQuantity,
        totalAvailableQuantity,
        quantityTotalsByUnit,
      },
    };
  }

  async inventoryLedger(userId: string) {
    await this.accessControl.assertPermission(userId, 'inventory.view');
    const scope = await this.accessControl.getInventoryLedgerScope(userId, 'inventory.view');
    return this.prisma.inventoryLedger.findMany({
      where: scope,
      include: { lot: { select: { lotNo: true } }, businessUnit: { select: { code: true, name: true } }, warehouse: { select: { name: true } }, material: { select: { name: true, unit: true } }, creator: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }
}
