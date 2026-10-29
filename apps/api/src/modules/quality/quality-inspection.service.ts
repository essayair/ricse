import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateQualityInspectionDto, CreateStandaloneQualityReportDto, QualityIndicatorDto } from './dto/create-quality-inspection.dto';
import { CreateQualitySampleDto, UpdateQualitySampleDto } from './dto/quality-sample.dto';
import { evaluateContractQualityRules } from './contract-quality-rules';

@Injectable()
export class QualityInspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly inventoryService: InventoryService,
  ) {}

  private readonly include = {
    creator: { select: { id: true, name: true } },
    confirmer: { select: { id: true, name: true } },
    indicators: { orderBy: { sort: 'asc' as const } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
    qualitySample: { select: { id: true, sampleNo: true, sampleLabel: true } },
    qualityTask: { select: { id: true, taskNo: true, status: true, finalConclusion: true } },
    contract: { select: { id: true, contractNo: true, title: true } },
    taskLinks: { where: { unlinkedAt: null }, include: { qualityTask: { select: { id: true, taskNo: true, status: true, waybillId: true } } }, orderBy: { linkedAt: 'asc' as const } },
    inboundReceipts: {
      where: { deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true, receiptNo: true, status: true },
      orderBy: { createdAt: 'desc' as const },
    },
    weighTicket: {
      include: {
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
      },
    },
  };

  private readonly taskInclude = {
    creator: { select: { id: true, name: true } },
    handler: { select: { id: true, name: true } },
    decider: { select: { id: true, name: true } },
    qualityTemplate: { select: { id: true, code: true, name: true, version: true } },
    attachments: {
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' as const },
    },
    samples: {
      where: { deletedAt: null },
      include: {
        creator: { select: { id: true, name: true } },
        attachments: {
          include: { uploader: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' as const },
        },
        reports: {
          where: { deletedAt: null },
          select: { id: true, inspectionNo: true, reportNo: true, institutionName: true, status: true },
          orderBy: { createdAt: 'asc' as const },
        },
      },
      orderBy: [{ sampledAt: 'asc' as const }, { createdAt: 'asc' as const }],
    },
    basisInspection: {
      select: {
        id: true, inspectionNo: true, institutionName: true, reportNo: true,
        conclusion: true, settlementWeight: true, moistureDeductionWeight: true,
        impurityDeductionWeight: true, deductionAmount: true,
      },
    },
    reports: {
      where: { deletedAt: null },
      include: {
        creator: { select: { id: true, name: true } },
        confirmer: { select: { id: true, name: true } },
        indicators: { orderBy: { sort: 'asc' as const } },
        attachments: { orderBy: { createdAt: 'desc' as const } },
        qualitySample: { select: { id: true, sampleNo: true, sampleLabel: true } },
        weighTicket: { select: { id: true, ticketNo: true, status: true } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
    reportLinks: {
      where: { unlinkedAt: null, inspection: { deletedAt: null } },
      include: { inspection: { include: {
        creator: { select: { id: true, name: true } },
        confirmer: { select: { id: true, name: true } },
        indicators: { orderBy: { sort: 'asc' as const } },
        attachments: { orderBy: { createdAt: 'desc' as const } },
        qualitySample: { select: { id: true, sampleNo: true, sampleLabel: true } },
        weighTicket: { select: { id: true, ticketNo: true, status: true } },
      } } },
      orderBy: { linkedAt: 'asc' as const },
    },
    waybill: {
      include: {
        lineItems: { orderBy: { createdAt: 'asc' as const } },
        weighTickets: {
          where: { deletedAt: null },
          select: {
            id: true, ticketNo: true, status: true, weighingStage: true, sequence: true,
            materialName: true, materialSpec: true, netWeight: true, settlementWeight: true,
          },
          orderBy: [{ weighingStage: 'asc' as const }, { sequence: 'asc' as const }],
        },
        weightSelections: {
          where: { isCurrent: true },
          select: { purpose: true, weighTicketId: true, quantity: true },
        },
        inboundReceipts: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          select: { id: true, receiptNo: true, status: true, qualityInspectionId: true },
          orderBy: { createdAt: 'desc' as const },
        },
        dispatchNotice: {
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
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
  };

  private withLinkedReports<T extends { reports: Array<{ id: string }>; reportLinks?: Array<{ inspection: { id: string } }> }>(task: T) {
    const reports = new Map<string, T['reports'][number]>();
    for (const report of task.reports) reports.set(report.id, report);
    for (const link of task.reportLinks || []) reports.set(link.inspection.id, link.inspection as T['reports'][number]);
    return { ...task, reports: [...reports.values()] };
  }

  private async generateNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.qualityInspection.count({ where: { createdAt: { gte: start, lt: end } } });
    return `QC-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateTaskNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.qualityTask.count({ where: { createdAt: { gte: start, lt: end } } });
    return `QT-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async ensureTaskForWaybill(waybillId: string, userId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, deletedAt: null },
      select: {
        id: true,
        status: true,
        dispatchNotice: { select: { type: true, qualityRequired: true, order: { select: { contractId: true } } } },
        lineItems: { select: { materialId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    if (!waybill || !['ARRIVED', 'SIGNED'].includes(waybill.status)) return null;
    if (!waybill.dispatchNotice.qualityRequired) return null;
    const existing = await this.prisma.qualityTask.findUnique({
      where: { waybillId }, include: this.taskInclude,
    });
    if (existing && !existing.deletedAt) return existing;
    const materialId = waybill.lineItems?.[0]?.materialId;
    const contractLine = materialId && waybill.dispatchNotice.order?.contractId
      ? await this.prisma.contractLineItem.findFirst({
        where: { contractId: waybill.dispatchNotice.order.contractId, materialId },
        orderBy: { createdAt: 'asc' },
        select: { qualityRulesSnapshot: true },
      })
      : null;
    const material = materialId ? await this.prisma.material.findFirst({
      where: { id: materialId, deletedAt: null },
      include: {
        qualityTemplate: {
          include: {
            items: {
              include: { indicator: true, defaultMethod: true },
              orderBy: { sort: 'asc' },
            },
          },
        },
      },
    }) : null;
    const template = material?.qualityTemplate?.status === 'ACTIVE'
      ? material.qualityTemplate
      : material ? await this.prisma.qualityTemplate.findFirst({
        where: {
          status: 'ACTIVE',
          materialCategoryId: material.categoryId,
          businessScene: { in: [waybill.dispatchNotice.type, 'GENERAL'] },
        },
        include: {
          items: {
            include: { indicator: true, defaultMethod: true },
            orderBy: { sort: 'asc' },
          },
        },
        orderBy: [{ businessScene: 'desc' }, { updatedAt: 'desc' }],
      }) : null;
    try {
      return await this.prisma.qualityTask.create({
        data: {
          taskNo: await this.generateTaskNo(), waybillId,
          status: 'PENDING_SAMPLING', plannedReportCount: 1, createdBy: userId,
          qualityTemplateId: template?.id || null,
          templateSnapshot: template ? qualityTemplateSnapshot(template) : undefined,
          contractQualitySnapshot: contractLine?.qualityRulesSnapshot as Prisma.InputJsonValue | undefined,
        },
        include: this.taskInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.qualityTask.findUnique({ where: { waybillId }, include: this.taskInclude });
      }
      throw error;
    }
  }

  async findTasks(params: { page?: number; pageSize?: number; search?: string; status?: string; conclusion?: string; dateFrom?: string; dateTo?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getQualityTaskScope(userId, 'quality.view');
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const where: Prisma.QualityTaskWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.conclusion) where.finalConclusion = params.conclusion;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.createdAt.lte = new Date(`${params.dateTo}T23:59:59.999`);
    }
    if (params.search?.trim()) {
      const search = params.search.trim();
      where.OR = [
        { taskNo: { contains: search, mode: 'insensitive' } },
        { waybill: { waybillNo: { contains: search, mode: 'insensitive' } } },
        { waybill: { plateNo: { contains: search, mode: 'insensitive' } } },
        { waybill: { lineItems: { some: { materialName: { contains: search, mode: 'insensitive' } } } } },
        { waybill: { dispatchNotice: { order: { name: { contains: search, mode: 'insensitive' } } } } },
        { waybill: { dispatchNotice: { order: { orderNo: { contains: search, mode: 'insensitive' } } } } },
        { waybill: { dispatchNotice: { order: { contract: { businessUnit: { name: { contains: search, mode: 'insensitive' } } } } } } },
        { waybill: { dispatchNotice: { order: { contract: { businessUnit: { code: { contains: search, mode: 'insensitive' } } } } } } },
        { reports: { some: { institutionName: { contains: search, mode: 'insensitive' } } } },
        { reports: { some: { reportNo: { contains: search, mode: 'insensitive' } } } },
        { reportLinks: { some: { unlinkedAt: null, inspection: { institutionName: { contains: search, mode: 'insensitive' } } } } },
        { reportLinks: { some: { unlinkedAt: null, inspection: { reportNo: { contains: search, mode: 'insensitive' } } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.qualityTask.findMany({ where, include: this.taskInclude, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.qualityTask.count({ where }),
    ]);
    return { items: items.map(item => this.withLinkedReports(item)), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async findTask(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityTaskScope(userId, permission);
    const task = await this.prisma.qualityTask.findFirst({
      where: { id, deletedAt: null, AND: [scope] }, include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('质检任务不存在');
    return this.withLinkedReports(task);
  }

  /** 首次关联确定报告范围；同一份报告可被范围内的多项车辆任务引用。 */
  async linkReport(inspectionId: string, taskId: string, userId: string) {
    const report = await this.findOne(inspectionId, userId, 'quality.manage');
    const task = await this.findTask(taskId, userId, 'quality.manage');
    if (report.status === 'VOIDED' || task.status === 'VOIDED') throw new BadRequestException('已作废的报告或任务不能关联');
    const contract = task.waybill.dispatchNotice.order.contract;
    const supplierId = task.waybill.dispatchNotice.type === 'SALES'
      ? contract.signingPartner?.id : contract.seller?.id;
    const businessUnitId = contract.businessUnit?.id;
    if (!supplierId || !businessUnitId) throw new BadRequestException('合同缺少供方或业务单元，不能关联检测报告');
    const materialIds = task.waybill.lineItems.map(line => line.materialId);
    if (report.materialId && !materialIds.includes(report.materialId)) throw new BadRequestException('检测报告物料与所选车辆不一致');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "quality_inspections" WHERE "id" = ${inspectionId} FOR UPDATE`;
      const current = await tx.qualityInspection.findUnique({ where: { id: inspectionId }, include: { taskLinks: { where: { unlinkedAt: null } } } });
      if (!current || current.deletedAt) throw new NotFoundException('检测报告不存在');
      if (current.materialId && !materialIds.includes(current.materialId)) throw new BadRequestException('检测报告物料与所选车辆不一致');
      if (current.taskLinks.length && (
        current.contractId !== contract.id || current.supplierId !== supplierId || current.businessUnitId !== businessUnitId
      )) throw new BadRequestException('检测报告只能关联同一合同、供方和业务单元的质检任务');
      if (!current.taskLinks.length && current.contractId && current.contractId !== contract.id) {
        throw new BadRequestException('报告预选合同与质检任务不一致；请先清除错误归属');
      }
      await tx.qualityInspection.update({ where: { id: inspectionId }, data: {
        contractId: contract.id, supplierId, businessUnitId,
        materialId: current.materialId || materialIds[0] || null,
      } });
      await tx.qualityInspectionTaskLink.upsert({
        where: { inspectionId_qualityTaskId: { inspectionId, qualityTaskId: taskId } },
        create: { inspectionId, qualityTaskId: taskId, linkedBy: userId },
        update: { linkedBy: userId, linkedAt: new Date(), unlinkedBy: null, unlinkedAt: null },
      });
      if (current.status === 'CONFIRMED') await tx.qualityTask.update({ where: { id: taskId }, data: {
        status: task.status === 'COMPLETED' ? 'RECHECK_REQUIRED' : 'PENDING_DECISION',
      } });
    });
    return this.findTask(taskId, userId, 'quality.manage');
  }

  async unlinkReport(inspectionId: string, taskId: string, userId: string) {
    await this.findOne(inspectionId, userId, 'quality.manage');
    const task = await this.findTask(taskId, userId, 'quality.manage');
    if (task.basisInspectionId === inspectionId) throw new BadRequestException('该报告已作为任务最终判定依据，请先办理判定更正');
    const receiptCount = await this.prisma.inboundReceipt.count({ where: {
      qualityInspectionId: inspectionId, waybillId: task.waybillId, deletedAt: null, status: { not: 'CANCELLED' },
    } });
    if (receiptCount) throw new BadRequestException('该报告已被入库单引用，不能直接解除关联');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "quality_inspections" WHERE "id" = ${inspectionId} FOR UPDATE`;
      const link = await tx.qualityInspectionTaskLink.findUnique({ where: { inspectionId_qualityTaskId: { inspectionId, qualityTaskId: taskId } } });
      if (!link || link.unlinkedAt) throw new BadRequestException('该任务未关联此检测报告');
      const currentTask = await tx.qualityTask.findUnique({ where: { id: taskId }, select: { basisInspectionId: true, waybillId: true } });
      if (!currentTask) throw new NotFoundException('质检任务不存在');
      if (currentTask?.basisInspectionId === inspectionId) throw new BadRequestException('该报告已作为任务最终判定依据，请先办理判定更正');
      const activeReceipt = await tx.inboundReceipt.count({ where: {
        qualityInspectionId: inspectionId, waybillId: currentTask?.waybillId, deletedAt: null, status: { not: 'CANCELLED' },
      } });
      if (activeReceipt) throw new BadRequestException('该报告已被入库单引用，不能直接解除关联');
      await tx.qualityInspectionTaskLink.update({ where: { id: link.id }, data: { unlinkedBy: userId, unlinkedAt: new Date() } });
      const activeCount = await tx.qualityInspectionTaskLink.count({ where: { inspectionId, unlinkedAt: null } });
      const report = await tx.qualityInspection.findUniqueOrThrow({ where: { id: inspectionId } });
      await tx.qualityInspection.update({ where: { id: inspectionId }, data: {
        ...(report.qualityTaskId === taskId ? { qualityTaskId: null, qualitySampleId: null, weighTicketId: null } : {}),
        ...(activeCount === 0 ? { contractId: null, supplierId: null, businessUnitId: null, qualityTaskId: null, qualitySampleId: null, weighTicketId: null } : {}),
      } });
    });
    return this.findTask(taskId, userId, 'quality.manage');
  }

  async finalizeTask(id: string, data: { conclusion: string; basisInspectionId: string; reason?: string }, userId: string) {
    const task = await this.findTask(id, userId, 'quality.manage');
    if (task.status === 'VOIDED') throw new BadRequestException('已作废质检任务不能形成最终结论');
    const confirmed = task.reports.filter(report => report.status === 'CONFIRMED');
    if (!confirmed.length) throw new BadRequestException('至少需要一份已确认的有效检测报告');
    const basis = confirmed.find(report => report.id === data.basisInspectionId);
    if (!basis) throw new BadRequestException('执行口径报告必须是本任务下已确认的有效检测报告');
    if (basis.conclusion !== data.conclusion) {
      throw new BadRequestException('最终结论必须与所选执行口径报告的结论一致');
    }
    const partial = confirmed.length < task.plannedReportCount;
    if ((partial || confirmed.length === 1) && !data.reason?.trim()) {
      throw new BadRequestException('仅一份有效报告或有效报告少于计划数量时，必须填写判定原因');
    }
    const basisWithIndicators = await this.prisma.qualityInspection.findFirst({
      where: { id: basis.id, deletedAt: null },
      include: { indicators: { orderBy: { sort: 'asc' } } },
    });
    const commercialEvaluation = task.contractQualitySnapshot
      ? evaluateContractQualityRules(task.contractQualitySnapshot, basisWithIndicators?.indicators || [])
      : null;
    const qualityDisposition = commercialEvaluation
      ? commercialEvaluation.disposition === 'DEDUCTION' ? 'DEDUCTION_PENDING' : commercialEvaluation.disposition
      : task.contractQualitySnapshot ? 'REVIEW_REQUIRED' : data.conclusion === 'PASS' ? 'LEGACY' : 'REVIEW_REQUIRED';
    await this.prisma.qualityTask.update({
      where: { id },
      data: {
        status: 'COMPLETED', finalConclusion: data.conclusion,
        contractQualityEvaluation: commercialEvaluation as unknown as Prisma.InputJsonValue | undefined,
        qualityDisposition,
        qualityAcceptanceSnapshot: Prisma.DbNull,
        qualityDeductionPerTon: commercialEvaluation?.deductionPerTon,
        qualityDispositionReason: commercialEvaluation
          ? commercialEvaluation.items.filter(item => item.result !== 'PASS').map(item => `${item.name}：${item.reason}`).join('；') || '所有合同质量指标均符合约定'
          : null,
        basisInspectionId: basis.id, finalizedReportIds: confirmed.map(report => report.id),
        finalizedReportCount: confirmed.length, decisionReason: data.reason?.trim() || '依据全部有效检测报告形成结论',
        decisionVersion: { increment: 1 }, decidedBy: userId, decidedAt: new Date(),
        handlerId: task.handlerId || userId, handledAt: task.handledAt || new Date(),
      },
    });
    await this.inventoryService.createPendingReceiptForConfirmedQuality(basis.id, userId, task.id);
    return this.findTask(id, userId, 'quality.manage');
  }

  async acceptContractDeduction(id: string, reason: string, userId: string, expectedVersion?: number) {
    const permission = 'settlement.quality.accept';
    const context = await this.accessControl.getContext(userId);
    if (context.user.company?.type === 'EXTERNAL') throw new BadRequestException('外部账号不能确认内部采购商务接收');
    const task = await this.findTask(id, userId, permission);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== task.decisionVersion) throw new BadRequestException('质检依据版本已变更，请刷新并核对后确认扣款接收');
    if (task.status !== 'COMPLETED' || task.qualityDisposition !== 'DEDUCTION_PENDING') {
      throw new BadRequestException('当前质检任务没有待确认的合同扣款接收结果');
    }
    if (!reason?.trim()) throw new BadRequestException('请填写接受扣款的业务确认原因');
    const updated = await this.prisma.qualityTask.updateMany({
      where: { id, status: 'COMPLETED', qualityDisposition: 'DEDUCTION_PENDING', decisionVersion: task.decisionVersion },
      data: { qualityDisposition: 'ACCEPT_WITH_DEDUCTION', qualityDispositionReason: reason.trim(),
        qualityAcceptanceSnapshot: { userId, name: context.user.name, acceptedAt: new Date().toISOString(), reason: reason.trim(), decisionVersion: task.decisionVersion, basisInspectionId: task.basisInspectionId } },
    });
    if (!updated.count) throw new BadRequestException('质检依据已变更或已处理，请刷新后重试');
    await this.inventoryService.createPendingReceiptForConfirmedQuality(task.basisInspectionId!, userId, task.id);
    return this.findTask(id, userId, permission);
  }

  async updateTaskSampling(
    id: string,
    data: { sampledAt: string; samplerName: string; samplingMethod?: string; plannedReportCount?: number },
    userId: string,
  ) {
    const task = await this.findTask(id, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(task.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能修改取样信息');
    }
    return this.prisma.qualityTask.update({
      where: { id },
      data: {
        sampledAt: new Date(data.sampledAt),
        samplerName: data.samplerName.trim(),
        samplingMethod: clean(data.samplingMethod),
        plannedReportCount: data.plannedReportCount ?? task.plannedReportCount,
        status: task.reports.length ? 'INSPECTING' : 'PENDING_SENDING',
        handlerId: task.handlerId || userId,
        handledAt: task.handledAt || new Date(),
      },
      include: this.taskInclude,
    });
  }

  async createSample(taskId: string, data: CreateQualitySampleDto, userId: string) {
    const task = await this.findTask(taskId, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(task.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能增加样品');
    }
    const sampleNo = data.sampleNo?.trim() || await this.nextSampleNo(task.id, task.taskNo);
    const existing = await this.prisma.qualitySample.findUnique({
      where: { qualityTaskId_sampleNo: { qualityTaskId: task.id, sampleNo } },
    });
    if (existing) throw new BadRequestException(`样品编号“${sampleNo}”已存在`);
    const sampledAt = new Date(data.sampledAt);
    const operator = data.samplerName?.trim()
      ? null
      : await this.accessControl.getContext(userId);
    const samplerName = data.samplerName?.trim() || operator?.user.name?.trim();
    if (!samplerName) throw new BadRequestException('当前账号未维护姓名，请填写取样人');
    const sample = await this.prisma.$transaction(async tx => {
      const created = await tx.qualitySample.create({
        data: {
          qualityTaskId: task.id,
          sampleNo,
          sampleLabel: clean(data.sampleLabel),
          sampledAt,
          samplerName,
          samplingMethod: clean(data.samplingMethod),
          sealNo: clean(data.sealNo),
          destinationInstitutionName: clean(data.destinationInstitutionName),
          sentAt: data.sentAt ? new Date(data.sentAt) : null,
          remarks: clean(data.remarks),
          status: data.status || (data.sentAt ? 'SENT' : 'SAMPLED'),
          createdBy: userId,
        },
      });
      await tx.qualityTask.update({
        where: { id: task.id },
        data: {
          sampledAt: task.sampledAt || sampledAt,
          samplerName: task.samplerName || samplerName,
          samplingMethod: task.samplingMethod || clean(data.samplingMethod),
          plannedReportCount: data.plannedReportCount ?? task.plannedReportCount,
          status: task.reports.length ? 'INSPECTING' : 'PENDING_SENDING',
          handlerId: task.handlerId || userId,
          handledAt: task.handledAt || new Date(),
        },
      });
      return created;
    });
    return this.findSample(sample.id, userId);
  }

  async updateSample(id: string, data: UpdateQualitySampleDto, userId: string) {
    const sample = await this.findSample(id, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(sample.qualityTask.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能修改样品');
    }
    const sampleNo = data.sampleNo?.trim();
    if (sampleNo && sampleNo !== sample.sampleNo) {
      const existing = await this.prisma.qualitySample.findUnique({
        where: { qualityTaskId_sampleNo: { qualityTaskId: sample.qualityTaskId, sampleNo } },
      });
      if (existing) throw new BadRequestException(`样品编号“${sampleNo}”已存在`);
    }
    await this.prisma.$transaction(async tx => {
      await tx.qualitySample.update({
        where: { id },
        data: {
          sampleNo: sampleNo || undefined,
          sampleLabel: data.sampleLabel === undefined ? undefined : clean(data.sampleLabel),
          sampledAt: data.sampledAt ? new Date(data.sampledAt) : undefined,
          samplerName: data.samplerName?.trim() || undefined,
          samplingMethod: data.samplingMethod === undefined ? undefined : clean(data.samplingMethod),
          sealNo: data.sealNo === undefined ? undefined : clean(data.sealNo),
          destinationInstitutionName: data.destinationInstitutionName === undefined ? undefined : clean(data.destinationInstitutionName),
          sentAt: data.sentAt === undefined ? undefined : new Date(data.sentAt),
          remarks: data.remarks === undefined ? undefined : clean(data.remarks),
          status: data.status,
        },
      });
      if (data.plannedReportCount !== undefined) {
        await tx.qualityTask.update({ where: { id: sample.qualityTaskId }, data: { plannedReportCount: data.plannedReportCount } });
      }
    });
    return this.findSample(id, userId);
  }

  async deleteSample(id: string, userId: string) {
    const sample = await this.findSample(id, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(sample.qualityTask.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能删除样品');
    }
    if (sample.reports.some(report => report.status !== 'VOIDED')) {
      throw new BadRequestException('样品已关联检测报告，不能删除；请先作废填错的检测报告');
    }
    await this.prisma.qualitySample.update({ where: { id }, data: { status: 'VOIDED', deletedAt: new Date() } });
    return { deleted: true, qualityTaskId: sample.qualityTaskId };
  }

  async findSample(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityTaskScope(userId, permission);
    const sample = await this.prisma.qualitySample.findFirst({
      where: { id, deletedAt: null, qualityTask: { deletedAt: null, AND: [scope] } },
      include: {
        qualityTask: { select: { id: true, taskNo: true, status: true } },
        creator: { select: { id: true, name: true } },
        attachments: { include: { uploader: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        reports: { where: { deletedAt: null }, select: { id: true, status: true, inspectionNo: true } },
      },
    });
    if (!sample) throw new NotFoundException('样品记录不存在');
    return sample;
  }

  private async nextSampleNo(taskId: string, taskNo: string) {
    const count = await this.prisma.qualitySample.count({ where: { qualityTaskId: taskId } });
    return `${taskNo}-S${String(count + 1).padStart(2, '0')}`;
  }

  async eligibleWeighTickets(userId: string, qualityTaskId?: string) {
    const task = qualityTaskId
      ? await this.findTask(qualityTaskId, userId, 'quality.view')
      : null;
    if (!task) await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWeighTicketScope(userId, 'quality.view');
    const tickets = await this.prisma.weighTicket.findMany({
      where: {
        ...(task ? { waybillId: task.waybillId } : {}),
        deletedAt: null,
        status: { in: ['COMPLETED', 'REVIEWED'] },
        AND: [scope],
      },
      include: {
        waybill: {
          include: {
            lineItems: { orderBy: { createdAt: 'asc' } },
            dispatchNotice: {
              include: {
                order: {
                  include: {
                    contract: {
                      select: {
                        contractNo: true, title: true, type: true,
                        seller: { select: { name: true } },
                        buyer: { select: { name: true } },
                        signingPartner: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      ...(task ? {} : { take: 100 }),
    });
    const materialIds = [...new Set(tickets.flatMap(ticket => ticket.waybill.lineItems.map(line => line.materialId)))];
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, spec: true, grade: true, specs: true, qcTemplate: true },
    });
    const materialMap = new Map(materials.map(material => [material.id, material]));
    const currentInventoryTicketId = task?.waybill.weightSelections
      .find(selection => selection.purpose === 'INVENTORY')?.weighTicketId;
    const currentSettlementTicketId = task?.waybill.weightSelections
      .find(selection => selection.purpose === 'SETTLEMENT')?.weighTicketId;
    const currentTicketId = currentInventoryTicketId || currentSettlementTicketId;
    const priority = (ticket: typeof tickets[number]) => {
      if (ticket.id === currentTicketId) return 0;
      if (ticket.status === 'REVIEWED' && ticket.weighingStage === 'SHIPPING') return 1;
      if (ticket.status === 'REVIEWED') return 2;
      if (ticket.weighingStage === 'SHIPPING') return 3;
      return 4;
    };
    const sortedTickets = [...tickets].sort((left, right) => priority(left) - priority(right));
    const recommendedTicketId = task ? sortedTickets[0]?.id : undefined;
    return sortedTickets.map(ticket => ({
      ...ticket,
      recommended: ticket.id === recommendedTicketId,
      recommendationReason: ticket.id !== recommendedTicketId
        ? null
        : ticket.id === currentTicketId
          ? '当前执行磅单'
          : ticket.status === 'REVIEWED' && ticket.weighingStage === 'SHIPPING'
            ? '默认发货磅单'
            : '系统建议',
      materials: ticket.waybill.lineItems.map(line => ({
        materialId: line.materialId,
        materialName: line.materialName,
        ...materialMap.get(line.materialId),
      })),
    }));
  }

  async create(dto: CreateQualityInspectionDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const task = await this.findTask(dto.qualityTaskId, userId, 'quality.manage');
    if (task.status === 'VOIDED') throw new BadRequestException('已作废质检任务不能追加检测报告');
    const sample = await this.prisma.qualitySample.findFirst({
      where: { id: dto.qualitySampleId, qualityTaskId: task.id, deletedAt: null, status: { not: 'VOIDED' } },
    });
    if (!sample) throw new BadRequestException('所选样品不存在或不属于当前质检任务');
    const scope = await this.accessControl.getWeighTicketScope(userId, 'quality.manage');
    const ticket = await this.prisma.weighTicket.findFirst({
      where: { id: dto.weighTicketId, waybillId: task.waybillId, deletedAt: null, AND: [scope] },
      include: {
        waybill: {
          include: {
            lineItems: { orderBy: { createdAt: 'asc' } },
            dispatchNotice: { include: { order: { include: { contract: { include: { seller: true, buyer: true, signingPartner: true } } } } } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('关联磅单不存在');
    if (!['COMPLETED', 'REVIEWED'].includes(ticket.status)) throw new BadRequestException('磅单完成称重后才能创建质检单');
    if (!dto.indicators.length) throw new BadRequestException('请至少填写一个质检指标');
    if (dto.indicators.some(item => !item.code.trim() || !item.name.trim())) {
      throw new BadRequestException('质检指标编码和名称不能为空');
    }
    if (new Set(dto.indicators.map(item => item.code.trim())).size !== dto.indicators.length) {
      throw new BadRequestException('同一质检单的指标编码不能重复');
    }
    if (!dto.reportNo.trim()) throw new BadRequestException('报告编号不能为空');
    let institutionPartner: { id: string; name: string } | null = null;
    if (['PARTNER', 'THIRD_PARTY'].includes(dto.institutionType)) {
      if (!dto.institutionPartnerId) {
        throw new BadRequestException('合作方或第三方检测必须选择已维护的质检机构');
      }
      const profile = await this.prisma.serviceOrganization.findFirst({
        where: {
          partnerId: dto.institutionPartnerId,
          organizationType: 'QUALITY_INSTITUTION',
          status: 'ACTIVE',
          deletedAt: null,
          partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
        },
        include: { partner: { select: { id: true, name: true } } },
      });
      if (!profile) throw new BadRequestException('所选质检机构不存在、已停用或合作伙伴不具备供应商角色');
      institutionPartner = profile.partner;
    } else if (!dto.institutionName?.trim()) {
      throw new BadRequestException('检测机构名称不能为空');
    }
    if (dto.submit && dto.indicators.some(item => item.measuredValue === undefined)) {
      throw new BadRequestException('提交质检结论前请填写全部检测指标');
    }

    const definitionIds = [...new Set(dto.indicators.map(item => item.indicatorDefinitionId).filter(Boolean) as string[])];
    const methodIds = [...new Set(dto.indicators.map(item => item.methodId).filter(Boolean) as string[])];
    const [definitions, methods, allowedLinks] = await Promise.all([
      this.prisma.qualityIndicatorDefinition.findMany({ where: { id: { in: definitionIds }, status: 'ACTIVE' } }),
      this.prisma.qualityMethod.findMany({ where: { id: { in: methodIds }, status: 'ACTIVE' } }),
      this.prisma.qualityIndicatorMethod.findMany({
        where: { indicatorId: { in: definitionIds }, methodId: { in: methodIds }, status: 'ACTIVE' },
      }),
    ]);
    if (definitions.length !== definitionIds.length) throw new BadRequestException('检测指标不存在或已停用');
    if (methods.length !== methodIds.length) throw new BadRequestException('检测方法不存在或已停用');
    const definitionMap = new Map(definitions.map(item => [item.id, item]));
    const methodMap = new Map(methods.map(item => [item.id, item]));
    const allowed = new Set(allowedLinks.map(item => `${item.indicatorId}:${item.methodId}`));
    for (const item of dto.indicators) {
      if (item.methodId && !item.indicatorDefinitionId) throw new BadRequestException('选择检测方法时必须选择检测指标');
      if (item.indicatorDefinitionId && item.methodId && !allowed.has(`${item.indicatorDefinitionId}:${item.methodId}`)) {
        throw new BadRequestException(`检测方法未关联到指标“${item.name}”`);
      }
    }

    const evaluated = dto.indicators.map((item, index) => {
      const definition = item.indicatorDefinitionId ? definitionMap.get(item.indicatorDefinitionId) : null;
      const method = item.methodId ? methodMap.get(item.methodId) : null;
      return {
        ...item,
        code: definition?.code || item.code,
        name: definition?.name || item.name,
        methodCode: method?.code || item.methodCode,
        methodName: method?.name || item.methodName,
        sort: index,
        result: evaluateIndicator(item),
      };
    });
    const conclusion = dto.submit ? evaluateConclusion(evaluated) : 'PENDING';
    const baseWeight = Number(ticket.settlementWeight || ticket.netWeight || 0);
    const deductions = calculateDeductions(baseWeight, evaluated);
    const contract = ticket.waybill.dispatchNotice.order.contract;
    const isPurchase = ticket.waybill.dispatchNotice.type === 'PURCHASE';
    const supplierName = isPurchase ? contract.seller?.name : contract.signingPartner?.name;
    const fuseReason = conclusion === 'FUSE'
      ? evaluated.filter(item => item.result === 'FUSE').map(item => `${item.name}达到拒收线`).join('；')
      : null;

    const inspection = await this.prisma.qualityInspection.create({
      data: {
        inspectionNo: await this.generateNo(),
        qualityTaskId: task.id,
        qualitySampleId: sample.id,
        weighTicketId: ticket.id,
        contractId: contract.id,
        supplierId: isPurchase ? contract.sellerId : contract.signingPartnerId,
        businessUnitId: contract.businessUnitId,
        materialId: ticket.waybill.lineItems[0]?.materialId || null,
        taskLinks: { create: { qualityTaskId: task.id, linkedBy: userId } },
        status: dto.submit ? 'REPORTED' : 'DRAFT',
        conclusion,
        dataSource: dto.dataSource || 'MANUAL',
        institutionType: dto.institutionType,
        institutionPartnerId: institutionPartner?.id || null,
        institutionName: institutionPartner?.name || dto.institutionName!.trim(),
        reportNo: dto.reportNo.trim(),
        testedAt: new Date(dto.testedAt),
        sampledAt: sample.sampledAt,
        samplerName: sample.samplerName,
        samplingMethod: sample.samplingMethod || clean(dto.samplingMethod),
        sampleNo: sample.sampleNo,
        sampleNo1: clean(dto.sampleNo1), sampleNo2: clean(dto.sampleNo2), sampleNo3: clean(dto.sampleNo3),
        materialName: ticket.materialName || ticket.waybill.lineItems.map(line => line.materialName || line.materialId).join('、'),
        materialSpec: ticket.materialSpec,
        supplierName: supplierName || null,
        plateNo: ticket.plateNo || ticket.waybill.plateNo,
        baseWeight,
        moistureDeductionWeight: deductions.moistureWeight,
        impurityDeductionWeight: deductions.impurityWeight,
        // 质量超限扣价不扣减实物或计价数量；折干由库存过账按全部实测水分独立计算。
        settlementWeight: baseWeight,
        deductionAmount: dto.deductionAmount ?? deductions.amount,
        fuseReason,
        remarks: clean(dto.remarks),
        createdBy: userId,
        indicators: {
          create: evaluated.map(item => ({
            code: item.code.trim(), name: item.name.trim(), operator: item.operator,
            indicatorDefinitionId: item.indicatorDefinitionId || null,
            methodId: item.methodId || null,
            methodCode: clean(item.methodCode),
            methodName: clean(item.methodName),
            standardValue: item.standardValue, upperValue: item.upperValue, fuseValue: item.fuseValue,
            unit: item.unit || '%', measuredValue: item.measuredValue,
            result: item.result, sort: item.sort,
          })),
        },
      },
      include: this.include,
    });
    await this.prisma.qualityTask.update({
      where: { id: task.id },
      data: {
        status: ['COMPLETED', 'RECHECK_REQUIRED'].includes(task.status) ? 'RECHECK_REQUIRED' : 'INSPECTING',
        sampledAt: task.sampledAt || sample?.sampledAt || new Date(dto.sampledAt),
        samplerName: task.samplerName || sample?.samplerName || dto.samplerName.trim(),
        samplingMethod: task.samplingMethod || sample?.samplingMethod || clean(dto.samplingMethod),
        handlerId: task.handlerId || userId,
        handledAt: task.handledAt || new Date(),
      },
    });
    const materialId = ticket.waybill.lineItems[0]?.materialId;
    if (materialId) {
      for (const item of evaluated) {
        if (!item.indicatorDefinitionId || !item.methodId) continue;
        await this.prisma.qualityMethodPreference.upsert({
          where: {
            userId_materialId_indicatorId: {
              userId,
              materialId,
              indicatorId: item.indicatorDefinitionId,
            },
          },
          create: { userId, materialId, indicatorId: item.indicatorDefinitionId, methodId: item.methodId },
          update: { methodId: item.methodId },
        });
      }
    }
    return inspection;
  }

  async createStandalone(dto: CreateStandaloneQualityReportDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const material = await this.prisma.material.findFirst({ where: { id: dto.materialId, deletedAt: null, status: 'ACTIVE' } });
    if (!material) throw new BadRequestException('请选择有效物料');
    if (!dto.reportNo?.trim() || !dto.samplerName?.trim()) throw new BadRequestException('请填写报告编号和取样人');
    if (!dto.indicators?.length) throw new BadRequestException('请至少填写一个检测指标');
    if (new Set(dto.indicators.map(item => item.code.trim())).size !== dto.indicators.length) throw new BadRequestException('检测指标不能重复');
    if (dto.submit && dto.indicators.some(item => item.measuredValue === undefined)) throw new BadRequestException('提交报告前请填写全部实测指标');
    let institutionName = dto.institutionName?.trim() || '';
    let institutionPartnerId: string | null = null;
    if (['PARTNER', 'THIRD_PARTY'].includes(dto.institutionType)) {
      const profile = await this.prisma.serviceOrganization.findFirst({ where: {
        partnerId: dto.institutionPartnerId,
        organizationType: 'QUALITY_INSTITUTION', status: 'ACTIVE', deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
      }, include: { partner: { select: { id: true, name: true } } } });
      if (!profile) throw new BadRequestException('请选择已维护且启用的质检机构');
      institutionName = profile.partner.name;
      institutionPartnerId = profile.partner.id;
    }
    if (!institutionName) throw new BadRequestException('请填写检测机构名称');
    const indicatorIds = [...new Set(dto.indicators.map(item => item.indicatorDefinitionId).filter(Boolean) as string[])];
    const methodIds = [...new Set(dto.indicators.map(item => item.methodId).filter(Boolean) as string[])];
    const [definitions, methods, allowedLinks] = await Promise.all([
      this.prisma.qualityIndicatorDefinition.findMany({ where: { id: { in: indicatorIds }, status: 'ACTIVE' } }),
      this.prisma.qualityMethod.findMany({ where: { id: { in: methodIds }, status: 'ACTIVE' } }),
      this.prisma.qualityIndicatorMethod.findMany({ where: { indicatorId: { in: indicatorIds }, methodId: { in: methodIds }, status: 'ACTIVE' } }),
    ]);
    if (definitions.length !== indicatorIds.length || methods.length !== methodIds.length) throw new BadRequestException('检测指标或方法不存在、已停用');
    const allowed = new Set(allowedLinks.map(link => `${link.indicatorId}:${link.methodId}`));
    const definitionMap = new Map(definitions.map(item => [item.id, item]));
    const methodMap = new Map(methods.map(item => [item.id, item]));
    const evaluated = dto.indicators.map((item, index) => {
      if (item.methodId && (!item.indicatorDefinitionId || !allowed.has(`${item.indicatorDefinitionId}:${item.methodId}`))) {
        throw new BadRequestException(`检测方法未关联到指标“${item.name}”`);
      }
      const definition = item.indicatorDefinitionId ? definitionMap.get(item.indicatorDefinitionId) : null;
      const method = item.methodId ? methodMap.get(item.methodId) : null;
      return { ...item, code: definition?.code || item.code, name: definition?.name || item.name,
        methodCode: method?.code || item.methodCode, methodName: method?.name || item.methodName,
        result: evaluateIndicator(item), sort: index };
    });
    return this.prisma.qualityInspection.create({ data: {
      inspectionNo: await this.generateNo(),
      materialId: material.id, materialName: material.name, materialSpec: material.spec,
      samplingGroupNo: clean(dto.samplingGroupNo), sampleNo: clean(dto.sampleNo),
      sampledAt: new Date(dto.sampledAt), samplerName: dto.samplerName.trim(), samplingMethod: clean(dto.samplingMethod),
      testedAt: new Date(dto.testedAt), reportNo: dto.reportNo.trim(),
      institutionType: dto.institutionType, institutionPartnerId, institutionName,
      status: dto.submit ? 'REPORTED' : 'DRAFT',
      conclusion: dto.submit ? evaluateConclusion(evaluated) : 'PENDING',
      remarks: clean(dto.remarks), createdBy: userId,
      indicators: { create: evaluated.map(item => ({
        code: item.code.trim(), name: item.name.trim(), operator: item.operator,
        indicatorDefinitionId: item.indicatorDefinitionId || null, methodId: item.methodId || null,
        methodCode: clean(item.methodCode), methodName: clean(item.methodName),
        standardValue: item.standardValue, upperValue: item.upperValue, fuseValue: item.fuseValue,
        unit: item.unit || '%', measuredValue: item.measuredValue, result: item.result, sort: item.sort,
      })) },
    }, include: this.include });
  }

  async findAll(params: { page?: number; pageSize?: number; search?: string; status?: string; conclusion?: string; dateFrom?: string; dateTo?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getQualityInspectionScope(userId, 'quality.view');
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const where: Prisma.QualityInspectionWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.conclusion) where.conclusion = params.conclusion;
    if (params.dateFrom || params.dateTo) {
      where.sampledAt = {};
      if (params.dateFrom) where.sampledAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.sampledAt.lte = new Date(`${params.dateTo}T23:59:59.999`);
    }
    if (params.search) {
      where.OR = [
        { inspectionNo: { contains: params.search, mode: 'insensitive' } },
        { materialName: { contains: params.search, mode: 'insensitive' } },
        { supplierName: { contains: params.search, mode: 'insensitive' } },
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { reportNo: { contains: params.search, mode: 'insensitive' } },
        { institutionName: { contains: params.search, mode: 'insensitive' } },
        { weighTicket: { ticketNo: { contains: params.search, mode: 'insensitive' } } },
        { weighTicket: { waybill: { waybillNo: { contains: params.search, mode: 'insensitive' } } } },
        { weighTicket: { waybill: { dispatchNotice: { order: { orderNo: { contains: params.search, mode: 'insensitive' } } } } } },
        { weighTicket: { waybill: { dispatchNotice: { order: { name: { contains: params.search, mode: 'insensitive' } } } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.qualityInspection.findMany({ where, include: this.include, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.qualityInspection.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async findOne(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityInspectionScope(userId, permission);
    const item = await this.prisma.qualityInspection.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!item) throw new NotFoundException('质检单不存在');
    const relatedInspections = item.weighTicketId ? await this.prisma.qualityInspection.findMany({
      where: { weighTicketId: item.weighTicketId, deletedAt: null, id: { not: item.id } },
      select: {
        id: true, inspectionNo: true, institutionType: true, institutionName: true,
        reportNo: true, testedAt: true, status: true, conclusion: true,
      },
      orderBy: { testedAt: 'desc' },
    }) : [];
    return { ...item, relatedInspections };
  }

  async updateStatus(id: string, status: string, userId: string, resolution?: string) {
    const item = await this.findOne(id, userId, 'quality.manage');
    const transitions: Record<string, string[]> = {
      DRAFT: ['TESTING', 'REPORTED', 'VOIDED'], TESTING: ['REPORTED', 'VOIDED'],
      REPORTED: ['CONFIRMED', 'VOIDED'], CONFIRMED: [], VOIDED: [],
    };
    if (!(transitions[item.status] || []).includes(status)) throw new BadRequestException('当前质检单不能进行该状态操作');
    if (status === 'REPORTED' && item.indicators.some(indicator => indicator.measuredValue === null)) {
      throw new BadRequestException('全部检测指标填写完整后才能出具报告');
    }
    if (status === 'CONFIRMED' && item.conclusion === 'FUSE' && !resolution?.trim()) {
      throw new BadRequestException('拒收质检单确认时必须填写处理方案');
    }
    // 检测报告是独立检测事实，确认报告不以任何一辆车的磅单/到达状态为前提；
    // 任务最终判定和入库过账仍分别校验其车辆磅单与现场状态。
    await this.prisma.qualityInspection.update({
      where: { id },
      data: {
        status,
        ...(status === 'CONFIRMED' ? { confirmedBy: userId, confirmedAt: new Date() } : {}),
        ...(resolution?.trim() ? { resolution: resolution.trim(), resolvedAt: new Date() } : {}),
      },
    });
    if (status === 'CONFIRMED') {
      for (const link of item.taskLinks || []) {
        await this.prisma.qualityTask.update({ where: { id: link.qualityTaskId }, data: {
          status: link.qualityTask.status === 'COMPLETED' ? 'RECHECK_REQUIRED' : 'PENDING_DECISION',
          handlerId: userId, handledAt: new Date(),
        } });
      }
    }
    return this.findOne(id, userId, 'quality.manage');
  }

  async createAttachment(data: { qualityInspectionId: string; fileName: string; originalName: string; mimeType: string; size: number; category: string }, userId: string) {
    const inspection = await this.findOne(data.qualityInspectionId, userId, 'quality.manage');
    if (['CONFIRMED', 'VOIDED'].includes(inspection.status)) throw new BadRequestException('已确认或已作废质检单不能上传附件');
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityInspectionScope(userId, permission);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        qualityInspectionId: { not: null },
        qualityInspection: { deletedAt: null, AND: [scope] },
      },
      include: { qualityInspection: { select: { status: true } } },
    });
  }

  async deleteAttachment(id: string, userId: string) {
    const attachment = await this.findAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return null;
    if (['CONFIRMED', 'VOIDED'].includes(attachment.qualityInspection?.status || '')) {
      throw new BadRequestException('已确认或已作废质检单附件不能删除');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  async createTaskAttachment(data: {
    qualityTaskId: string;
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
    const task = await this.findTask(data.qualityTaskId, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(task.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能追加现场影像');
    }
    return this.prisma.attachment.create({
      data: {
        ...data,
        capturedAt: data.capturedAt ? new Date(data.capturedAt) : null,
        uploadedBy: userId,
      },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async createSampleAttachment(data: {
    qualitySampleId: string;
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
    const sample = await this.findSample(data.qualitySampleId, userId, 'quality.manage');
    if (['COMPLETED', 'VOIDED'].includes(sample.qualityTask.status)) {
      throw new BadRequestException('已完成或已作废质检任务不能追加样品影像');
    }
    return this.prisma.attachment.create({
      data: {
        ...data,
        capturedAt: data.capturedAt ? new Date(data.capturedAt) : null,
        uploadedBy: userId,
      },
      include: {
        uploader: { select: { id: true, name: true } },
        qualitySample: { select: { qualityTaskId: true } },
      },
    });
  }

  async findSampleAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityTaskScope(userId, permission);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        qualitySampleId: { not: null },
        qualitySample: { deletedAt: null, qualityTask: { deletedAt: null, AND: [scope] } },
      },
      include: { qualitySample: { include: { qualityTask: { select: { id: true, status: true } } } } },
    });
  }

  async deleteSampleAttachment(id: string, userId: string) {
    const attachment = await this.findSampleAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return null;
    if (['COMPLETED', 'VOIDED'].includes(attachment.qualitySample?.qualityTask.status || '')) {
      throw new BadRequestException('已完成或已作废质检任务的样品影像不能删除');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }

  async findTaskAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityTaskScope(userId, permission);
    return this.prisma.attachment.findFirst({
      where: {
        id,
        qualityTaskId: { not: null },
        qualityTask: { deletedAt: null, AND: [scope] },
      },
      include: { qualityTask: { select: { status: true } } },
    });
  }

  async deleteTaskAttachment(id: string, userId: string) {
    const attachment = await this.findTaskAttachmentById(id, userId, 'quality.manage');
    if (!attachment) return null;
    if (['COMPLETED', 'VOIDED'].includes(attachment.qualityTask?.status || '')) {
      throw new BadRequestException('已完成或已作废质检任务的现场影像不能删除');
    }
    return this.prisma.attachment.delete({ where: { id } });
  }
}

function clean(value?: string) {
  return value?.trim() || null;
}

export function evaluateIndicator(item: QualityIndicatorDto) {
  if (item.measuredValue === undefined) return 'PENDING';
  const value = Number(item.measuredValue);
  const standard = item.standardValue === undefined ? null : Number(item.standardValue);
  const upper = item.upperValue === undefined ? null : Number(item.upperValue);
  const fuse = item.fuseValue === undefined ? null : Number(item.fuseValue);
  if (fuse !== null) {
    if (item.operator === 'GTE' && value < fuse) return 'FUSE';
    if (item.operator === 'LTE' && value > fuse) return 'FUSE';
  }
  if (standard === null) return 'PASS';
  if (item.operator === 'GTE') return value >= standard ? 'PASS' : 'FAIL';
  if (item.operator === 'LTE') return value <= standard ? 'PASS' : 'FAIL';
  if (item.operator === 'EQ') return value === standard ? 'PASS' : 'FAIL';
  if (item.operator === 'RANGE') return value >= standard && (upper === null || value <= upper) ? 'PASS' : 'FAIL';
  return 'PENDING';
}

function evaluateConclusion(items: Array<{ result: string }>) {
  if (items.some(item => item.result === 'FUSE')) return 'FUSE';
  if (items.some(item => item.result === 'FAIL')) return 'DEDUCTION';
  return items.every(item => item.result === 'PASS') ? 'PASS' : 'PENDING';
}

function calculateDeductions(baseWeight: number, items: Array<QualityIndicatorDto & { result: string }>) {
  const moisture = items.find(item => item.code.toLowerCase().includes('moisture') || item.name.includes('水分'));
  const impurity = items.find(item => item.code.toLowerCase().includes('impurity') || item.name.includes('杂质'));
  const excess = (item?: QualityIndicatorDto & { result: string }) => item && item.operator === 'LTE' && item.measuredValue !== undefined && item.standardValue !== undefined
    ? Math.max(0, Number(item.measuredValue) - Number(item.standardValue)) : 0;
  const moistureExcess = excess(moisture);
  const impurityExcess = excess(impurity);
  const moistureWeight = round(baseWeight * moistureExcess / 100, 3);
  const impurityWeight = round(baseWeight * impurityExcess / 100, 3);
  const amount = round(baseWeight * (moistureExcess / 0.1) * 10 + baseWeight * (impurityExcess / 0.1) * 8, 2);
  return { moistureWeight, impurityWeight, amount };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function qualityTemplateSnapshot(template: any) {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    version: template.version,
    businessScene: template.businessScene,
    items: template.items.map((item: any) => ({
      indicatorId: item.indicatorId,
      code: item.indicator.code,
      name: item.indicator.name,
      symbol: item.indicator.symbol,
      methodId: item.defaultMethodId,
      methodCode: item.defaultMethod?.code || null,
      methodName: item.defaultMethod?.name || null,
      operator: item.operator,
      standardValue: item.standardValue === null ? null : Number(item.standardValue),
      upperValue: item.upperValue === null ? null : Number(item.upperValue),
      fuseValue: item.fuseValue === null ? null : Number(item.fuseValue),
      unit: item.unit,
      required: item.required,
      core: item.core,
      participates: item.participates,
      sort: item.sort,
    })),
  };
}
