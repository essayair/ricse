import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { evaluateGradePrice, readMeasuredPct } from '../contract/grade-price-rules';
import { goodsAmounts } from './payment-balance';
import { signature } from './purchase-settlement-basis';

/** 销售货款以交付事实编制；我方出库过账量始终单独留存，不被客户计量覆盖。 */
export class SalesSettlementBasis {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  async sources(contractId: string, userId: string, permission = 'settlement.view', excludeSettlementId?: string, reportChoices = new Map<string, string>(), ticketChoices = new Map<string, string>(), ignoreLegacySelection = false) {
    await this.access.assertPermission(userId, permission);
    const scope = await this.access.getContractScope(userId, permission);
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null, AND: [scope] }, include: { lineItems: true } });
    if (!contract) throw new NotFoundException('合同不存在或无权访问');
    if (!['SALES', 'BILATERAL'].includes(contract.type)) throw new BadRequestException('仅支持销售方向的货物结算');
    const legacy = await this.prisma.financialSettlement.findMany({
      where: { contractId, direction: 'RECEIVABLE', deletedAt: null, status: { not: 'VOIDED' }, id: excludeSettlementId ? { not: excludeSettlementId } : undefined },
      include: { lines: true },
    });
    const legacyContract = legacy.some(s => s.settlementScope !== 'ADJUSTMENT' && !s.lines.length);
    const legacyOrders = new Set(legacy.flatMap(s => s.lines.filter(l => !l.waybillLineItemId).map(l => l.orderId)));
    const rows = await this.prisma.waybillLineItem.findMany({
      where: { waybill: { deletedAt: null, status: { not: 'CANCELLED' }, dispatchNotice: { deletedAt: null, status: { not: 'CANCELLED' }, order: { contractId, type: 'SALES', deletedAt: null, status: { not: 'CANCELLED' } } } } },
      include: {
        dispatchNoticeLineItem: { include: { orderLineItem: true } },
        settlementLines: { where: { settlementId: excludeSettlementId ? { not: excludeSettlementId } : undefined, settlement: { deletedAt: null, status: { not: 'VOIDED' } } } },
        waybill: { include: {
          lineItems: true, dispatchNotice: { include: { order: true } },
          weighTickets: { where: { deletedAt: null, status: { not: 'VOIDED' } }, select: { id: true, ticketNo: true, weighingStage: true, status: true, deletedAt: true, netWeight: true, grossWeight: true, tareWeight: true, updatedAt: true }, orderBy: { createdAt: 'asc' } },
          weightSelections: { where: { isCurrent: true }, include: { weighTicket: true }, orderBy: { selectedAt: 'desc' } },
          qualityTask: { include: {
            basisInspection: { include: { indicators: true } },
            reports: { where: { deletedAt: null, status: 'CONFIRMED' }, include: { indicators: true } },
            reportLinks: { where: { unlinkedAt: null, inspection: { deletedAt: null, status: 'CONFIRMED' } }, include: { inspection: { include: { indicators: true } } } },
          } },
          outboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, include: { weighTicket: true }, orderBy: { createdAt: 'desc' } },
        } },
      }, orderBy: { createdAt: 'asc' },
    });
    const materialIds = [...new Set(rows.map(row => row.materialId))];
    const materials = await this.prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, pricingQuantityBasis: true } });
    const materialBasis = new Map(materials.map(material => [material.id, material.pricingQuantityBasis]));
    return rows.map(row => {
      const w = row.waybill, order = w.dispatchNotice.order;
      const waybillLineIds = new Set(w.lineItems.map(line => line.id));
      const occupiedSettlements = legacy.filter(settlement => settlement.lines.some(line => line.waybillLineItemId && waybillLineIds.has(line.waybillLineItemId)))
        .map(settlement => ({ id: settlement.id, settlementNo: settlement.settlementNo, status: settlement.status }));
      const settlementOccupied = row.settlementLines.length > 0 || occupiedSettlements.length > 0;
      const item = contract.lineItems.find(line => line.id === row.dispatchNoticeLineItem.orderLineItem.contractLineItemId);
      const gradeTier = contract.pricingType === 'GRADE_TIER';
      const gradeRules = contract.type === 'BILATERAL' ? item?.salesPriceRulesSnapshot : item?.priceRulesSnapshot;
      const outbound = w.outboundReceipts.find(receipt => receipt.status === 'POSTED');
      const inventoryTicket = outbound?.weighTicket;
      const task = w.qualityTask;
      const reports = new Map([
        ...(task?.basisInspection ? [task.basisInspection] : []), ...(task?.reports || []), ...(task?.reportLinks || []).map(link => link.inspection),
      ].filter(report => report.status === 'CONFIRMED' && !report.deletedAt).map(report => [report.id, report]));
      const requestedReportId = reportChoices.get(row.id);
      const report = requestedReportId ? reports.get(requestedReportId) : reports.get(w.salesCompletionReportId || '');
      const settlementSelection = w.weightSelections.find(selection => selection.purpose === 'SETTLEMENT');
      const requestedTicketId = ticketChoices.get(row.id);
      const chosenTicket = requestedTicketId ? w.weighTickets.find(candidate => candidate.id === requestedTicketId) : undefined;
      const ticket = requestedTicketId ? chosenTicket : (!ignoreLegacySelection ? settlementSelection?.weighTicket : undefined) || w.weighTickets.find(candidate => candidate.id === w.salesCompletionCustomerTicketId);
      const selectedStage = ticket?.weighingStage;
      const stageSelection = w.weightSelections.find(selection => selection.purpose === selectedStage);
      const sourceSelection = requestedTicketId ? stageSelection : settlementSelection || stageSelection;
      const stageTickets = selectedStage ? w.weighTickets.filter(candidate => candidate.weighingStage === selectedStage) : [];
      const pricingQuantityBasis = gradeTier ? (gradeRules as { quantityBasis?: 'PHYSICAL' | 'DRY_MATTER' } | null)?.quantityBasis || 'PHYSICAL' : materialBasis.get(row.materialId) || 'PHYSICAL';
      const measuredMoisturePct = readMeasuredPct(report?.indicators || [], 'MOISTURE');
      const netWeight = ticket?.netWeight == null ? null : Number(ticket.netWeight);
      const dryQuantity = netWeight == null || measuredMoisturePct == null ? null
        : new Prisma.Decimal(netWeight).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(measuredMoisturePct).div(100))).toDecimalPlaces(3).toNumber();
      const totalQuantity = pricingQuantityBasis === 'DRY_MATTER' ? (dryQuantity ?? 0) : (netWeight ?? 0);
      const effectiveByStage = new Map<string, (typeof w.weighTickets)[number]>();
      for (const stage of ['SHIPPING', 'RECEIVING']) {
        const candidates = w.weighTickets.filter(candidate => candidate.weighingStage === stage);
        const chosen = w.weightSelections.find(selection => selection.purpose === stage);
        const effective = chosen ? candidates.find(candidate => candidate.id === chosen.weighTicketId && candidate.status === 'REVIEWED')
          : candidates.length === 1 && candidates[0].status === 'REVIEWED' ? candidates[0] : undefined;
        if (effective) effectiveByStage.set(stage, effective);
      }
      const quantityCandidates = [...effectiveByStage.values()].map(candidate => {
        if (candidate.netWeight == null) return 0;
        if (pricingQuantityBasis === 'PHYSICAL') return Number(candidate.netWeight);
        return measuredMoisturePct == null ? 0 : new Prisma.Decimal(candidate.netWeight).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(measuredMoisturePct).div(100))).toDecimalPlaces(3).toNumber();
      });
      const negotiableQuantity = effectiveByStage.has('SHIPPING') && effectiveByStage.has('RECEIVING')
        ? Math.max(totalQuantity, ...quantityCandidates) : totalQuantity;
      const usedQuantity = row.settlementLines.reduce((sum, line) => sum.plus(line.quantity || 0), new Prisma.Decimal(0));
      const remainingQuantity = Prisma.Decimal.max(0, new Prisma.Decimal(totalQuantity).minus(usedQuantity)).toDecimalPlaces(3).toNumber();
      const negotiableRemainingQuantity = Prisma.Decimal.max(0, new Prisma.Decimal(negotiableQuantity).minus(usedQuantity)).toDecimalPlaces(3).toNumber();
      const reasons: string[] = [];
      if (settlementOccupied) reasons.push('该运单已创建结算单（含草稿），不可重复选择；如需重做，请先作废原结算单');
      if (w.lineItems.length !== 1) reasons.push('该车含多物料，请先明确各物料重量与质量依据');
      if (!w.salesCompletionConfirmedAt) reasons.push('请先确认客户签收、收货计量与销售交付完成');
      if (w.dispatchNotice.mode === 'STANDARD' && !outbound) reasons.push('请先完成我方出库过账');
      if (!ticket || ticket.deletedAt || ticket.status !== 'REVIEWED') reasons.push('请先确认已复核的销售货款磅单');
      if (requestedTicketId && chosenTicket && effectiveByStage.get(chosenTicket.weighingStage)?.id !== chosenTicket.id) reasons.push('本次结算所选磅单不是该侧采信磅单');
      if (stageTickets.length > 1 && stageSelection?.weighTicketId !== ticket?.id) reasons.push('所选侧有多张磅单，请先确认采信磅单');
      for (const stage of ['SHIPPING', 'RECEIVING']) {
        const candidates = w.weighTickets.filter(candidate => candidate.weighingStage === stage);
        const chosen = w.weightSelections.find(selection => selection.purpose === stage);
        if (candidates.length > 1 && !candidates.some(candidate => candidate.id === chosen?.weighTicketId && candidate.status === 'REVIEWED')) {
          reasons.push(`${stage === 'SHIPPING' ? '发货' : '收货'}侧有多张磅单，请先确认采信磅单`);
        }
      }
      if (!report || report.status !== 'CONFIRMED' || report.deletedAt) reasons.push('请先选择本车已确认的货款检测报告');
      if (report?.evidenceStage === 'UNSPECIFIED') reasons.push('货款检测报告未标明发货或收货环节');
      if (pricingQuantityBasis === 'DRY_MATTER' && measuredMoisturePct == null) reasons.push('折干销售结算缺少检测报告水分实测值');
      if (!task || task.deletedAt || task.status !== 'COMPLETED') reasons.push('请先完成质检任务最终判定');
      if (report?.conclusion === 'FUSE') reasons.push('所选报告结论为拒收，请先处理质量争议');
      if (!item) reasons.push('无法匹配销售合同物料行');
      if (legacyContract || legacyOrders.has(order.id)) reasons.push('存在未映射到具体货物的历史应收，请先处理重叠结算');
      if (negotiableRemainingQuantity <= 0) reasons.push('该车货物无剩余可结算数量');
      if (!['TON', '吨', 't'].includes(row.unit)) reasons.push('当前自动货物结算仅支持吨计价');
      const rules = gradeRules;
      const gradePrice = gradeTier && rules ? evaluateGradePrice(rules, (rules as any).selectedSpec, remainingQuantity, report?.indicators || []) : null;
      if (gradeTier && gradePrice?.status !== 'READY') reasons.push(...(gradePrice?.reasons || ['销售合同品位分档价缺少有效依据']));
      // 合同已约定回收率扣价时，仅“选矿回收率”未达标不再视为质量争议：差额已按合同条款计入扣价。
      const recoveryPricedByContract = gradePrice?.status === 'READY' && Boolean(gradePrice.recovery) && report?.conclusion === 'DEDUCTION'
        && report.indicators.filter(indicator => indicator.result === 'FAIL' || indicator.result === 'FUSE').every(indicator => readMeasuredPct([indicator], 'RECOVERY') !== null && indicator.result === 'FAIL');
      if (report && report.conclusion !== 'PASS' && !recoveryPricedByContract) reasons.push('所选检测报告未形成合格结论，须先处理销售质量争议与扣价');
      // 无合同质量规则时，报告非全部合格会使任务处置为待复核；若仅因已计价的回收率未达标，则不重复拦截。
      const dispositionPricedByContract = recoveryPricedByContract && !task?.contractQualitySnapshot
        && task?.qualityDisposition === 'REVIEW_REQUIRED' && task.basisInspectionId === report?.id;
      if (task && ['REJECT', 'REVIEW_REQUIRED', 'DEDUCTION_PENDING', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition) && !dispositionPricedByContract) reasons.push('销售质量处置尚未形成可直接结算的价格，须先人工确认');
      const unitPrice = gradePrice?.status === 'READY' ? gradePrice.unitPrice : Number(contract.type === 'BILATERAL' ? item?.salesUnitPrice || 0 : item?.unitPrice || 0);
      const recoveryDeductionPerTon = gradePrice?.status === 'READY' ? gradePrice.recovery?.deductionPerTon || 0 : 0;
      const basis = {
        waybillLineItemId: row.id, contractLineItemId: item?.id, waybillId: w.id,
        salesCompletionConfirmedAt: w.salesCompletionConfirmedAt, salesCompletionReportId: w.salesCompletionReportId,
        salesCompletionCustomerTicketId: w.salesCompletionCustomerTicketId, salesCompletionShippingTicketId: w.salesCompletionShippingTicketId,
        outboundReceiptId: outbound?.id, outboundQuantity: outbound?.outboundQuantity?.toString(), outboundStatus: outbound?.status,
        weighTicketId: ticket?.id, ticketUpdatedAt: ticket?.updatedAt, weightSelectionId: sourceSelection?.id,
        qualityTaskId: task?.id, decisionVersion: task?.decisionVersion, reportId: report?.id, reportUpdatedAt: report?.updatedAt,
        pricingQuantityBasis, totalQuantity, unitPrice, contractTaxRatePct: item?.taxRatePct?.toString(), gradePrice: gradePrice?.status === 'READY' ? gradePrice : null,
      };
      return {
        id: row.id, waybillLineItemId: row.id, waybillId: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo,
        orderId: order.id, orderNo: order.orderNo, orderName: order.name, orderStatus: order.status,
        contractLineItemId: item?.id, materialName: row.materialName || item?.materialName, unit: row.unit,
        salesCompletionConfirmedAt: w.salesCompletionConfirmedAt, outboundNo: outbound?.receiptNo,
        inventoryTicketNo: inventoryTicket?.ticketNo, inventoryNetWeight: inventoryTicket?.netWeight == null ? null : Number(inventoryTicket.netWeight),
        customerTicketNo: w.weighTickets.find(candidate => candidate.id === w.salesCompletionCustomerTicketId)?.ticketNo,
        customerNetWeight: w.salesCompletionCustomerWeight == null ? null : Number(w.salesCompletionCustomerWeight),
        shippingNetWeight: w.salesCompletionShippingWeight == null ? null : Number(w.salesCompletionShippingWeight),
        weightVariance: w.salesCompletionWeightVariance == null ? null : Number(w.salesCompletionWeightVariance),
        ticketNo: ticket?.ticketNo, weighTicketId: ticket?.id, weightSelectionId: sourceSelection?.id,
        settlementTicketScoped: Boolean(requestedTicketId),
        settlementSelectionId: requestedTicketId ? null : settlementSelection?.id, settlementTicketNo: ticket?.ticketNo,
        availableWeighTickets: w.weighTickets.filter(candidate => candidate.status === 'REVIEWED').map(candidate => ({ id: candidate.id, ticketNo: candidate.ticketNo, weighingStage: candidate.weighingStage, netWeight: candidate.netWeight == null ? null : Number(candidate.netWeight), isSelectable: effectiveByStage.get(candidate.weighingStage)?.id === candidate.id })),
        reportId: report?.id, reportNo: report?.reportNo || report?.inspectionNo, defaultReportId: w.salesCompletionReportId, qualityTaskId: task?.id,
        availableQualityReports: [...reports.values()].map(candidate => ({ id: candidate.id, reportNo: candidate.reportNo || candidate.inspectionNo, evidenceStage: candidate.evidenceStage, institutionName: candidate.institutionName, conclusion: candidate.conclusion,
          measuredGradePct: readMeasuredPct(candidate.indicators || [], 'GRADE'), measuredMoisturePct: readMeasuredPct(candidate.indicators || [], 'MOISTURE'), measuredRecoveryPct: readMeasuredPct(candidate.indicators || [], 'RECOVERY') })),
        netWeight, grossWeight: ticket?.grossWeight == null ? null : Number(ticket.grossWeight), tareWeight: ticket?.tareWeight == null ? null : Number(ticket.tareWeight),
        measuredMoisturePct, dryQuantity, pricingQuantityBasis, totalQuantity, usedQuantity: usedQuantity.toNumber(), remainingQuantity,
        negotiableQuantity, negotiableRemainingQuantity, settlementOccupied, occupiedSettlements,
        unitPrice, contractTaxRatePct: item?.taxRatePct == null ? null : Number(item.taxRatePct), pricingType: contract.pricingType || 'FIXED', gradePrice, deductionPerTon: 0, recoveryDeductionPerTon,
        qualityDisposition: task?.qualityDisposition && task.qualityDisposition !== 'PENDING'
          ? task.qualityDisposition : report?.conclusion === 'PASS' ? 'PASS' : report?.conclusion === 'FUSE' ? 'REJECT' : 'REVIEW_REQUIRED',
        signature: signature(basis), basis, available: reasons.length === 0, reasons,
        ...goodsAmounts(remainingQuantity, unitPrice, recoveryDeductionPerTon),
      };
    });
  }

  async assertCurrent(settlementId: string, userId: string, permission = 'settlement.confirm') {
    const settlement = await this.prisma.financialSettlement.findUnique({ where: { id: settlementId }, include: { lines: true } });
    if (!settlement) throw new NotFoundException('销售结算单不存在');
    const tracked = settlement.lines.filter(line => line.waybillLineItemId);
    if (!tracked.length) return;
    const reportChoices = new Map(tracked.filter(line => (line.sourceSnapshot as any)?.reportId).map(line => [line.waybillLineItemId!, String((line.sourceSnapshot as any).reportId)]));
    const ticketChoices = new Map(tracked.filter(line => (line.sourceSnapshot as any)?.settlementTicketScoped && (line.sourceSnapshot as any)?.weighTicketId).map(line => [line.waybillLineItemId!, String((line.sourceSnapshot as any).weighTicketId)]));
    const sources = await this.sources(settlement.contractId, userId, permission, settlementId, reportChoices, ticketChoices);
    for (const line of tracked) {
      const source = sources.find(candidate => candidate.id === line.waybillLineItemId);
      if (!source?.available || source.signature !== (line.sourceSnapshot as any)?.signature) {
        throw new BadRequestException('销售结算依据已变更，请复核磅单、质检与交付事实后重新编制');
      }
    }
  }
}
