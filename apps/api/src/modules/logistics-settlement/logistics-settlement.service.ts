import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateLogisticsSettlementDto, SetLinePriceDto } from './dto/logistics-settlement.dto';

@Injectable()
export class LogisticsSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    payerCompany: { select: { id: true, name: true, code: true } },
    preparer: { select: { id: true, name: true } },
    reviewer: { select: { id: true, name: true } },
    lines: {
      include: {
        waybill: {
          select: {
            id: true, waybillNo: true, plateNo: true, signedAt: true,
            originLocation: true, destinationLocation: true,
            carrierPartnerId: true, carrierName: true,
          },
        },
        contractPriceTerm: true,
      },
    },
  };

  private async generateSettlementNo(): Promise<string> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const todayCount = await this.prisma.logisticsSettlement.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });
    return `LS${dateStr}${String(todayCount + 1).padStart(4, '0')}`;
  }

  /**
   * 按承运方匹配生效中的物流合同与运价条款；找不到时返回 null，由调用方转为 MANUAL 手工单价。
   */
  private async resolvePriceTerm(waybill: {
    carrierPartnerId: string | null;
    originLocation: string | null;
    destinationLocation: string | null;
    signedAt: Date | null;
  }, payerCompanyId: string) {
    if (!waybill.carrierPartnerId || !waybill.originLocation || !waybill.destinationLocation) return null;
    const referenceDate = waybill.signedAt ?? new Date();
    const findTerm = (companyId: string | null) => this.prisma.logisticsContractPriceTerm.findFirst({
      where: {
        originLocation: waybill.originLocation!,
        destinationLocation: waybill.destinationLocation!,
        effectiveAt: { lte: referenceDate },
        OR: [{ expiresAt: null }, { expiresAt: { gt: referenceDate } }],
        contract: {
          is: {
            carrierPartnerId: waybill.carrierPartnerId!,
            companyId,
            status: 'ACTIVE',
            AND: [
              { OR: [{ effectiveAt: null }, { effectiveAt: { lte: referenceDate } }] },
              { OR: [{ expireAt: null }, { expireAt: { gt: referenceDate } }] },
            ],
          },
        },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    // 优先匹配当前结算主体签订的合同；没有时才允许使用未指定主体的通用合同。
    return (await findTerm(payerCompanyId)) ?? findTerm(null);
  }

  async listCandidateWaybills(query: { periodStart: string; periodEnd: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const periodStart = new Date(query.periodStart);
    const periodEnd = new Date(query.periodEnd);
    if (periodEnd <= periodStart) throw new BadRequestException('结算周期结束日期必须晚于开始日期');

    return this.prisma.waybill.findMany({
      where: {
        AND: [
          scope,
          { status: 'SIGNED' },
          { signedAt: { gte: periodStart, lte: periodEnd } },
          { logisticsSettlementLines: { none: { settlement: { status: { not: 'VOIDED' } } } } },
        ],
      },
      select: {
        id: true, waybillNo: true, plateNo: true, signedAt: true,
        originLocation: true, destinationLocation: true,
        carrierPartnerId: true, carrierName: true,
        weightSelections: {
          where: { purpose: 'SETTLEMENT', isCurrent: true },
          select: { quantity: true },
        },
      },
      orderBy: { signedAt: 'asc' },
    });
  }

  async create(dto: CreateLogisticsSettlementDto, userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    const payerCompanyId = dto.payerCompanyId || context.user.company?.id;
    if (!payerCompanyId) throw new BadRequestException('无法确定货主方企业，请手动指定 payerCompanyId');
    const waybillScope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) throw new BadRequestException('结算周期结束日期必须晚于开始日期');

    const waybillIds = dto.lines.map((line) => line.waybillId);
    if (new Set(waybillIds).size !== waybillIds.length) {
      throw new BadRequestException('同一张运单不能重复加入同一结算单');
    }

    const waybills = await this.prisma.waybill.findMany({
      where: { AND: [{ id: { in: waybillIds } }, waybillScope] },
      include: {
        weightSelections: {
          where: { purpose: 'SETTLEMENT', isCurrent: true },
          include: { weighTicket: { select: { grossWeight: true } } },
        },
      },
    });
    if (waybills.length !== waybillIds.length) {
      throw new BadRequestException('存在不在当前数据范围内或不存在的运单');
    }
    const notSigned = waybills.find((item) => item.status !== 'SIGNED');
    if (notSigned) {
      throw new BadRequestException(`运单 ${notSigned.waybillNo} 尚未签收，不能加入结算单`);
    }

    const alreadySettled = await this.prisma.logisticsSettlementLine.findMany({
      where: { waybillId: { in: waybillIds }, settlement: { status: { not: 'VOIDED' } } },
      include: { waybill: { select: { waybillNo: true } } },
    });
    if (alreadySettled.length > 0) {
      throw new BadRequestException(`运单 ${alreadySettled.map((item) => item.waybill.waybillNo).join('、')} 已在其他有效结算单中`);
    }

    let totalGrossWeight = 0;
    let totalNetWeight = 0;
    let totalAmount = 0;
    const linesData: Prisma.LogisticsSettlementLineCreateManySettlementInput[] = [];
    for (const line of dto.lines) {
      const waybill = waybills.find((item) => item.id === line.waybillId)!;
      const selection = waybill.weightSelections[0];
      if (!selection) {
        throw new BadRequestException(`运单 ${waybill.waybillNo} 尚未确认结算执行磅单，不能加入结算单`);
      }
      const netWeight = Number(selection.quantity);
      totalGrossWeight += Number(selection.weighTicket?.grossWeight ?? 0);
      totalNetWeight += netWeight;

      const term = await this.resolvePriceTerm(waybill, payerCompanyId);
      if (term) {
        const amount = netWeight * Number(term.unitPrice);
        totalAmount += amount;
        linesData.push({
          waybillId: waybill.id, netWeight, unitPrice: term.unitPrice,
          priceSource: 'CONTRACT', contractPriceTermId: term.id, amount,
        });
      } else {
        const manualPrice = line.manualUnitPrice;
        const amount = manualPrice != null ? netWeight * manualPrice : undefined;
        if (amount != null) totalAmount += amount;
        linesData.push({
          waybillId: waybill.id, netWeight, unitPrice: manualPrice ?? undefined,
          priceSource: 'MANUAL', amount,
        });
      }
    }

    const settlementNo = await this.generateSettlementNo();
    return this.prisma.logisticsSettlement.create({
      data: {
        settlementNo,
        payerCompanyId,
        periodStart,
        periodEnd,
        preparedBy: userId,
        preparedAt: new Date(),
        remarks: dto.remarks,
        createdBy: userId,
        totalGrossWeight,
        totalNetWeight,
        totalAmount,
        lines: { createMany: { data: linesData } },
      },
      include: this.include,
    });
  }

  async findAll(query: { status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.view');
    const scope = await this.accessControl.getLogisticsSettlementScope(userId, 'logistics.settlement.view');
    return this.prisma.logisticsSettlement.findMany({
      where: { AND: [scope, query.status ? { status: query.status } : {}] },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, permission = 'logistics.settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getLogisticsSettlementScope(userId, permission);
    const settlement = await this.prisma.logisticsSettlement.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.include,
    });
    if (!settlement) throw new NotFoundException('物流结算单不存在');
    return settlement;
  }

  private async recomputeTotals(settlementId: string) {
    const lines = await this.prisma.logisticsSettlementLine.findMany({ where: { settlementId } });
    const totalNetWeight = lines.reduce((sum, line) => sum + Number(line.netWeight), 0);
    const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    await this.prisma.logisticsSettlement.update({
      where: { id: settlementId },
      data: { totalNetWeight, totalAmount },
    });
  }

  async setLinePrice(settlementId: string, lineId: string, dto: SetLinePriceDto, userId: string) {
    const settlement = await this.findOne(settlementId, userId, 'logistics.settlement.manage');
    if (settlement.status !== 'DRAFT') {
      throw new BadRequestException('只有草稿状态的结算单可以调整单价');
    }
    const line = settlement.lines.find((item) => item.id === lineId);
    if (!line) throw new NotFoundException('结算单明细不存在');

    const isOverride = line.priceSource === 'CONTRACT' || line.priceSource === 'CONTRACT_OVERRIDDEN';
    if (isOverride && !dto.overrideReason) {
      throw new BadRequestException('调整合同单价必须填写调整原因');
    }
    const amount = Number(line.netWeight) * dto.unitPrice;
    const updated = await this.prisma.logisticsSettlementLine.update({
      where: { id: lineId },
      data: {
        unitPrice: dto.unitPrice,
        amount,
        priceSource: isOverride ? 'CONTRACT_OVERRIDDEN' : 'MANUAL',
        contractUnitPrice: isOverride ? (line.contractUnitPrice ?? line.unitPrice) : line.contractUnitPrice,
        overrideReason: isOverride ? dto.overrideReason : line.overrideReason,
      },
    });
    await this.recomputeTotals(settlementId);
    return updated;
  }

  async submit(id: string, userId: string) {
    const settlement = await this.findOne(id, userId, 'logistics.settlement.manage');
    if (settlement.status !== 'DRAFT') {
      throw new BadRequestException(`只有草稿状态可以提交，当前状态：${settlement.status}`);
    }
    const missingPrice = settlement.lines.find((line) => line.unitPrice === null || Number(line.unitPrice) <= 0);
    if (missingPrice) {
      throw new BadRequestException('存在未填写单价的明细，请先补全后再提交');
    }
    return this.prisma.logisticsSettlement.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: this.include,
    });
  }

  async review(id: string, userId: string) {
    const settlement = await this.findOne(id, userId, 'logistics.settlement.manage');
    if (settlement.status !== 'SUBMITTED') {
      throw new BadRequestException(`只有已提交状态可以复核，当前状态：${settlement.status}`);
    }
    return this.prisma.logisticsSettlement.update({
      where: { id },
      data: { status: 'REVIEWED', reviewedBy: userId, reviewedAt: new Date() },
      include: this.include,
    });
  }

  /** 作废重开不走审批，DRAFT/SUBMITTED/REVIEWED 均可直接作废；作废后运单回到未结算池。 */
  async voidSettlement(id: string, userId: string) {
    const settlement = await this.findOne(id, userId, 'logistics.settlement.manage');
    if (settlement.status === 'VOIDED') {
      throw new BadRequestException('结算单已作废');
    }
    return this.prisma.logisticsSettlement.update({
      where: { id },
      data: { status: 'VOIDED' },
      include: this.include,
    });
  }
}
