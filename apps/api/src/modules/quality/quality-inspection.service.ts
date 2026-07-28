import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateQualityInspectionDto, QualityIndicatorDto } from './dto/create-quality-inspection.dto';

@Injectable()
export class QualityInspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    creator: { select: { id: true, name: true } },
    confirmer: { select: { id: true, name: true } },
    indicators: { orderBy: { sort: 'asc' as const } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
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

  private async generateNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const count = await this.prisma.qualityInspection.count({ where: { createdAt: { gte: start, lt: end } } });
    return `QC-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  async eligibleWeighTickets(userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getWeighTicketScope(userId);
    const tickets = await this.prisma.weighTicket.findMany({
      where: {
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
      take: 100,
    });
    const materialIds = [...new Set(tickets.flatMap(ticket => ticket.waybill.lineItems.map(line => line.materialId)))];
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true, spec: true, grade: true, specs: true, qcTemplate: true },
    });
    const materialMap = new Map(materials.map(material => [material.id, material]));
    return tickets.map(ticket => ({
      ...ticket,
      materials: ticket.waybill.lineItems.map(line => ({
        materialId: line.materialId,
        materialName: line.materialName,
        ...materialMap.get(line.materialId),
      })),
    }));
  }

  async create(dto: CreateQualityInspectionDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.manage');
    const scope = await this.accessControl.getWeighTicketScope(userId);
    const ticket = await this.prisma.weighTicket.findFirst({
      where: { id: dto.weighTicketId, deletedAt: null, AND: [scope] },
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

    const evaluated = dto.indicators.map((item, index) => ({ ...item, sort: index, result: evaluateIndicator(item) }));
    const conclusion = dto.submit ? evaluateConclusion(evaluated) : 'PENDING';
    const baseWeight = Number(ticket.settlementWeight || ticket.netWeight || 0);
    const deductions = calculateDeductions(baseWeight, evaluated);
    const contract = ticket.waybill.dispatchNotice.order.contract;
    const isPurchase = ticket.waybill.dispatchNotice.type === 'PURCHASE';
    const supplierName = isPurchase ? contract.seller?.name : contract.signingPartner?.name;
    const fuseReason = conclusion === 'FUSE'
      ? evaluated.filter(item => item.result === 'FUSE').map(item => `${item.name}达到熔断线`).join('；')
      : null;

    return this.prisma.qualityInspection.create({
      data: {
        inspectionNo: await this.generateNo(),
        weighTicketId: ticket.id,
        status: dto.submit ? 'REPORTED' : 'DRAFT',
        conclusion,
        dataSource: dto.dataSource || 'MANUAL',
        institutionType: dto.institutionType,
        institutionPartnerId: institutionPartner?.id || null,
        institutionName: institutionPartner?.name || dto.institutionName!.trim(),
        reportNo: dto.reportNo.trim(),
        testedAt: new Date(dto.testedAt),
        sampledAt: new Date(dto.sampledAt),
        samplerName: dto.samplerName.trim(),
        samplingMethod: clean(dto.samplingMethod),
        sampleNo1: clean(dto.sampleNo1), sampleNo2: clean(dto.sampleNo2), sampleNo3: clean(dto.sampleNo3),
        materialName: ticket.materialName || ticket.waybill.lineItems.map(line => line.materialName || line.materialId).join('、'),
        materialSpec: ticket.materialSpec,
        supplierName: supplierName || null,
        plateNo: ticket.plateNo || ticket.waybill.plateNo,
        baseWeight,
        moistureDeductionWeight: deductions.moistureWeight,
        impurityDeductionWeight: deductions.impurityWeight,
        settlementWeight: Math.max(0, baseWeight - deductions.moistureWeight - deductions.impurityWeight),
        deductionAmount: dto.deductionAmount ?? deductions.amount,
        fuseReason,
        remarks: clean(dto.remarks),
        createdBy: userId,
        indicators: {
          create: evaluated.map(item => ({
            code: item.code.trim(), name: item.name.trim(), operator: item.operator,
            standardValue: item.standardValue, upperValue: item.upperValue, fuseValue: item.fuseValue,
            unit: item.unit || '%', measuredValue: item.measuredValue,
            result: item.result, sort: item.sort,
          })),
        },
      },
      include: this.include,
    });
  }

  async findAll(params: { page?: number; pageSize?: number; search?: string; status?: string; conclusion?: string; dateFrom?: string; dateTo?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'quality.view');
    const scope = await this.accessControl.getQualityInspectionScope(userId);
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
    const scope = await this.accessControl.getQualityInspectionScope(userId);
    const item = await this.prisma.qualityInspection.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!item) throw new NotFoundException('质检单不存在');
    const relatedInspections = await this.prisma.qualityInspection.findMany({
      where: { weighTicketId: item.weighTicketId, deletedAt: null, id: { not: item.id } },
      select: {
        id: true, inspectionNo: true, institutionType: true, institutionName: true,
        reportNo: true, testedAt: true, status: true, conclusion: true,
      },
      orderBy: { testedAt: 'desc' },
    });
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
      throw new BadRequestException('熔断质检单确认时必须填写处理方案');
    }
    await this.prisma.qualityInspection.update({
      where: { id },
      data: {
        status,
        ...(status === 'CONFIRMED' ? { confirmedBy: userId, confirmedAt: new Date() } : {}),
        ...(resolution?.trim() ? { resolution: resolution.trim(), resolvedAt: new Date() } : {}),
      },
    });
    return this.findOne(id, userId, 'quality.manage');
  }

  async createAttachment(data: { qualityInspectionId: string; fileName: string; originalName: string; mimeType: string; size: number; category: string }, userId: string) {
    const inspection = await this.findOne(data.qualityInspectionId, userId, 'quality.manage');
    if (['CONFIRMED', 'VOIDED'].includes(inspection.status)) throw new BadRequestException('已确认或已作废质检单不能上传附件');
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId: string, permission = 'quality.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getQualityInspectionScope(userId);
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
