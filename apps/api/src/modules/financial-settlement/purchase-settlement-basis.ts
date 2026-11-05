import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { evaluateGradePrice, readMeasuredPct } from '../contract/grade-price-rules';
import { evaluateContractQualityRules } from '../quality/contract-quality-rules';
import { goodsAmounts } from './payment-balance';

export const snapshotJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const signature = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** 从已经选定的磅单和报告读取事实；不在资金模块重新选报告或解释合同质量规则。 */
export class PurchaseSettlementBasis {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  async sources(contractId: string, userId: string, permission = 'settlement.view', excludeSettlementId?: string, reportChoices = new Map<string, string>(), ticketChoices = new Map<string, string>(), ignoreLegacySelection = false) {
    await this.access.assertPermission(userId, permission);
    const scope = await this.access.getContractScope(userId, permission);
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null, AND: [scope] }, include: { lineItems: true },
    });
    if (!contract) throw new NotFoundException('合同不存在或无权访问');
    if (!['PURCHASE', 'BILATERAL'].includes(contract.type)) throw new BadRequestException('仅支持采购方向的采购结算');
    // 在资金写事务中锁定依据行，避免校验通过到保存付款之间检测/磅单被并发改写。
    if (typeof (this.prisma as any).$transaction !== 'function') {
      await this.prisma.$queryRaw`SELECT q."id" FROM "quality_tasks" q JOIN "waybills" w ON w."id"=q."waybillId" JOIN "dispatch_notices" d ON d."id"=w."dispatchNoticeId" JOIN "orders" o ON o."id"=d."orderId" WHERE o."contractId"=${contractId} ORDER BY q."id" FOR SHARE OF q`;
      await this.prisma.$queryRaw`SELECT q."id" FROM "quality_inspections" q JOIN "quality_tasks" t ON t."id"=q."qualityTaskId" JOIN "waybills" w ON w."id"=t."waybillId" JOIN "dispatch_notices" d ON d."id"=w."dispatchNoticeId" JOIN "orders" o ON o."id"=d."orderId" WHERE o."contractId"=${contractId} ORDER BY q."id" FOR SHARE OF q`;
      await this.prisma.$queryRaw`SELECT s."id" FROM "waybill_weight_selections" s JOIN "waybills" w ON w."id"=s."waybillId" JOIN "dispatch_notices" d ON d."id"=w."dispatchNoticeId" JOIN "orders" o ON o."id"=d."orderId" WHERE o."contractId"=${contractId} ORDER BY s."id" FOR SHARE OF s`;
      await this.prisma.$queryRaw`SELECT t."id" FROM "weigh_tickets" t JOIN "waybills" w ON w."id"=t."waybillId" JOIN "dispatch_notices" d ON d."id"=w."dispatchNoticeId" JOIN "orders" o ON o."id"=d."orderId" WHERE o."contractId"=${contractId} ORDER BY t."id" FOR SHARE OF t`;
    }
    const legacy = await this.prisma.financialSettlement.findMany({
      where: { contractId, direction: 'PAYABLE', deletedAt: null, status: { not: 'VOIDED' }, id: excludeSettlementId ? { not: excludeSettlementId } : undefined },
      include: { lines: true },
    });
    const legacyContract = legacy.some(s => s.settlementScope !== 'ADJUSTMENT' && !s.lines.length);
    const legacyOrders = new Set(legacy.flatMap(s => s.lines.filter(l => !l.waybillLineItemId).map(l => l.orderId)));
    const rows = await this.prisma.waybillLineItem.findMany({
      where: { waybill: { deletedAt: null, status: { not: 'CANCELLED' }, dispatchNotice: { deletedAt: null, status: { not: 'CANCELLED' }, order: { contractId, deletedAt: null, status: { not: 'CANCELLED' }, type: 'PURCHASE' } } } },
      include: {
        dispatchNoticeLineItem: { include: { orderLineItem: true } },
        settlementLines: { where: { settlementId: excludeSettlementId ? { not: excludeSettlementId } : undefined, settlement: { deletedAt: null, status: { not: 'VOIDED' } } } },
        waybill: { include: {
          lineItems: true, dispatchNotice: { include: { order: true } },
          weighTickets: { where: { deletedAt: null, status: { not: 'VOIDED' } }, select: { id: true, ticketNo: true, weighingStage: true, status: true, netWeight: true, grossWeight: true, tareWeight: true, updatedAt: true, deletedAt: true }, orderBy: { createdAt: 'asc' } },
          weightSelections: { where: { isCurrent: true }, include: { weighTicket: true }, orderBy: { selectedAt: 'desc' } },
          qualityTask: { include: {
            basisInspection: { include: { indicators: true } },
            reports: { where: { deletedAt: null, status: 'CONFIRMED' }, include: { indicators: true } },
            reportLinks: { where: { unlinkedAt: null, inspection: { deletedAt: null, status: 'CONFIRMED' } }, include: { inspection: { include: { indicators: true } } } },
          } },
          inboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, include: { weighTicket: true, businessInbound: true }, orderBy: { createdAt: 'desc' } },
        } },
      }, orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => {
      const w = row.waybill, order = w.dispatchNotice.order;
      const item = contract.lineItems.find(l => l.id === row.dispatchNoticeLineItem.orderLineItem.contractLineItemId);
      const isGradeTier = contract.pricingType === 'GRADE_TIER';
      const gradeQuantityBasis = isGradeTier ? (item?.priceRulesSnapshot as { quantityBasis?: 'PHYSICAL' | 'DRY_MATTER' } | null)?.quantityBasis || 'PHYSICAL' : null;
      const receipt = w.inboundReceipts.find(r => r.status === 'POSTED' && r.businessInbound?.status === 'POSTED');
      const posted = receipt?.businessInbound, inventoryTicket = receipt?.weighTicket;
      const inventorySelection = w.weightSelections.find(s => s.purpose === 'INVENTORY' && s.weighTicketId === receipt?.weighTicketId), task = w.qualityTask;
      const inventoryReport = task?.basisInspection;
      const availableReports = new Map([
        ...(inventoryReport ? [inventoryReport] : []), ...(task?.reports || []), ...(task?.reportLinks || []).map(link => link.inspection),
      ].filter(report => report.status === 'CONFIRMED' && !report.deletedAt).map(report => [report.id, report]));
      const requestedReportId = reportChoices.get(row.id);
      const report = requestedReportId
        ? requestedReportId === inventoryReport?.id ? inventoryReport : availableReports.get(requestedReportId)
        : inventoryReport;
      const separateSettlementReport = Boolean(requestedReportId && requestedReportId !== inventoryReport?.id);
      const settlementSelection = w.weightSelections.find(s => s.purpose === 'SETTLEMENT');
      const requestedTicketId = ticketChoices.get(row.id);
      const chosenTicket = requestedTicketId ? w.weighTickets.find(candidate => candidate.id === requestedTicketId) : undefined;
      const legacyTicket = !ignoreLegacySelection && settlementSelection?.weighTicketId !== receipt?.weighTicketId ? settlementSelection?.weighTicket : undefined;
      const ticket = requestedTicketId ? chosenTicket : legacyTicket || inventoryTicket;
      const separateSettlementTicket = Boolean(ticket && (ticket.id || receipt?.weighTicketId) !== receipt?.weighTicketId);
      const selection = requestedTicketId
        ? w.weightSelections.find(candidate => candidate.purpose === ticket?.weighingStage && candidate.weighTicketId === ticket?.id)
        : separateSettlementTicket ? settlementSelection : inventorySelection;
      const measuredMoisturePct = isGradeTier || separateSettlementReport || posted?.measuredMoisturePct == null
        ? readMeasuredPct(report?.indicators || [], 'MOISTURE')
        : Number(posted.measuredMoisturePct);
      const netWeight = ticket?.netWeight == null ? null : Number(ticket.netWeight);
      const dryQuantity = netWeight == null || measuredMoisturePct == null ? null
        : new Prisma.Decimal(netWeight).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(measuredMoisturePct).div(100))).toDecimalPlaces(3).toNumber();
      // 库存过账口径与合同货款口径分离：新分档合同可约定所选净重折干，存量合同沿用原净重口径。
      const settlementQuantityBasis = gradeQuantityBasis || posted?.pricingQuantityBasis || 'PHYSICAL';
      const totalQuantity = isGradeTier
        ? (settlementQuantityBasis === 'DRY_MATTER' ? (dryQuantity ?? 0) : (netWeight ?? 0))
        : separateSettlementTicket || separateSettlementReport
          ? (settlementQuantityBasis === 'DRY_MATTER' ? (dryQuantity ?? 0) : (netWeight ?? 0))
          : Number(posted?.pricingQuantity ?? posted?.quantity ?? 0);
      // 同侧多张只采用已确认的采信磅单；不能用“最新一张”静默替代人工结论。
      const effectiveByStage = new Map<string, (typeof w.weighTickets)[number]>();
      for (const stage of ['SHIPPING', 'RECEIVING']) {
        const candidates = w.weighTickets.filter(candidate => candidate.weighingStage === stage);
        const chosen = w.weightSelections.find(selection => selection.purpose === stage);
        const effective = chosen ? candidates.find(candidate => candidate.id === chosen.weighTicketId && candidate.status === 'REVIEWED')
          : candidates.length === 1 && candidates[0].status === 'REVIEWED' ? candidates[0] : undefined;
        if (effective) effectiveByStage.set(stage, effective);
      }
      const candidateQuantities = [...effectiveByStage.values()].filter(candidate => candidate.netWeight != null && (settlementQuantityBasis !== 'DRY_MATTER' || measuredMoisturePct != null)).map(candidate => {
        const physical = Number(candidate.netWeight);
        return settlementQuantityBasis === 'DRY_MATTER' && measuredMoisturePct != null
          ? new Prisma.Decimal(physical).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(measuredMoisturePct).div(100))).toDecimalPlaces(3).toNumber()
          : physical;
      });
      // 只有发货、收货两侧均有已复核事实时，才开放双侧区间内的协商数量。
      const negotiableQuantity = effectiveByStage.has('SHIPPING') && effectiveByStage.has('RECEIVING')
        ? Math.max(totalQuantity, ...candidateQuantities) : totalQuantity;
      const usedQuantity = row.settlementLines.reduce((sum, l) => sum.plus(l.quantity || 0), new Prisma.Decimal(0));
      const remainingQuantity = Prisma.Decimal.max(0, new Prisma.Decimal(totalQuantity).minus(usedQuantity)).toDecimalPlaces(3).toNumber();
      const negotiableRemainingQuantity = Prisma.Decimal.max(0, new Prisma.Decimal(negotiableQuantity).minus(usedQuantity)).toDecimalPlaces(3).toNumber();
      const reasons: string[] = [];
      if (w.lineItems.length !== 1) reasons.push('该车含多物料，需先明确各物料重量及检测依据');
      for (const stage of ['SHIPPING', 'RECEIVING']) {
        if (w.weighTickets.filter(candidate => candidate.weighingStage === stage).length > 1 && !effectiveByStage.has(stage)) {
          reasons.push(`${stage === 'SHIPPING' ? '发货' : '收货'}侧有多张磅单，请先确认采信磅单`);
        }
      }
      if (!requestedTicketId && !ignoreLegacySelection && settlementSelection && settlementSelection.weighTicket.weighingStage
        && w.weighTickets.some(candidate => candidate.weighingStage === settlementSelection.weighTicket.weighingStage)
        && effectiveByStage.get(settlementSelection.weighTicket.weighingStage)?.id !== settlementSelection.weighTicketId) {
        reasons.push('货款结算磅单与该侧采信磅单不一致，请重新选择');
      }
      if (!posted || totalQuantity <= 0) reasons.push('请先完成采购入库过账；最终货款按入库过账数量结算，提前付款请使用预付款或阶段款申请');
      if (requestedTicketId && (!chosenTicket || chosenTicket.status !== 'REVIEWED')) reasons.push('本次结算所选磅单不存在或未复核');
      if (requestedTicketId && chosenTicket && effectiveByStage.get(chosenTicket.weighingStage)?.id !== chosenTicket.id) reasons.push('本次结算所选磅单不是该侧采信磅单');
      if (!inventoryTicket || inventoryTicket.deletedAt || inventoryTicket.status !== 'REVIEWED') reasons.push('请先核对入库过账关联的库存磅单');
      if (separateSettlementTicket && (!ticket || ticket.deletedAt || ticket.status !== 'REVIEWED')) reasons.push('货款依据磅单已失效，请重新选择');
      if (settlementQuantityBasis === 'DRY_MATTER' && measuredMoisturePct == null) reasons.push('折干货款结算需要所选报告的水分实测值');
      if (requestedReportId && !report) reasons.push('所选货款检测报告未确认、已解绑或不属于本车质检任务');
      if (separateSettlementReport && report?.evidenceStage === 'UNSPECIFIED') reasons.push('所选货款检测报告未标明发货或收货环节');
      if (!item) reasons.push('无法匹配合同物料行');
      if (!task || task.deletedAt || task.status !== 'COMPLETED' || !report || report.deletedAt || report.status !== 'CONFIRMED') reasons.push('请先完成最终质检判定');
      if (legacyContract || legacyOrders.has(order.id)) reasons.push('存在未映射到具体货物的历史应付，请先复核并处理重叠结算');
      if (remainingQuantity <= 0) reasons.push('该来源数量已全部结算或被结算草稿占用');
      if (!['TON', '吨', 't'].includes(row.unit)) reasons.push('当前自动质量扣款仅支持已明确以吨计价的物料');
      const gradePrice = isGradeTier && item?.priceRulesSnapshot
        ? evaluateGradePrice(item.priceRulesSnapshot, (item.priceRulesSnapshot as any).selectedSpec, remainingQuantity, report?.indicators || [])
        : null;
      // 矿石分档价本身以实测品位决定价格；若合同没有另设质量拒收/扣款条款，
      // 不把旧的通用质检模板阈值误当作矿石交易的拒收线。
      const selectedEvaluation = separateSettlementReport && task?.contractQualitySnapshot && report
        ? evaluateContractQualityRules(task.contractQualitySnapshot, report.indicators) : null;
      const selectedDisposition = separateSettlementReport
        ? selectedEvaluation?.disposition || (report?.conclusion === 'PASS' ? 'LEGACY' : 'REVIEW_REQUIRED')
        : task?.qualityDisposition;
      const gradePriceCanSettle = isGradeTier && !task?.contractQualitySnapshot && gradePrice?.status === 'READY';
      if (task && !gradePriceCanSettle && !['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(selectedDisposition || '')) {
        reasons.push(separateSettlementReport && selectedDisposition === 'DEDUCTION'
          ? '另选报告触发合同扣款，需先办理质量扣款接收与审批'
          : selectedDisposition === 'DEDUCTION_PENDING' ? '请由结算或付款申请人员确认按合同扣款接收' : '当前质量结果为拒收或待判定，不能正常结算');
      }
      if (isGradeTier && !item?.priceRulesSnapshot) reasons.push('合同物料缺少品位分档价格表');
      if (isGradeTier && gradePrice?.status === 'REVIEW_REQUIRED') reasons.push(...gradePrice.reasons);
      const deductionPerTon = !separateSettlementReport && task && ['DEDUCTION_PENDING', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition) ? Number(task.qualityDeductionPerTon || 0) : 0;
      // 回收率扣价属于合同价格条款（不含税元/吨），与质量扣款规则分开记录，避免触发“分档价与质量扣价叠加”拦截。
      const recoveryDeductionPerTon = gradePrice?.status === 'READY' ? gradePrice.recovery?.deductionPerTon || 0 : 0;
      const qualityReady = Boolean(task && !task.deletedAt && task.status === 'COMPLETED' && report && !report.deletedAt && report.status === 'CONFIRMED' && (gradePriceCanSettle || ['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(selectedDisposition || '')));
      const basis = { contractLineItemId: item?.id, contractRules: task?.contractQualitySnapshot || item?.qualityRulesSnapshot,
        waybillLineItemId: row.id, weightSelectionId: selection?.id, weight: totalQuantity,
        weighTicketId: ticket?.id || receipt?.weighTicketId, ticketUpdatedAt: ticket?.updatedAt,
        businessInboundId: posted?.id, inboundQuantity: (posted?.pricingQuantity ?? posted?.quantity)?.toString(), inboundPhysicalQuantity: posted?.quantity?.toString(), inboundStatus: posted?.status, inboundPostedAt: posted?.postedAt,
        settlementQuantityBasis, settlementQuantity: totalQuantity, contractTaxRatePct: item?.taxRatePct?.toString(),
        qualityTaskId: task?.id, decisionVersion: task?.decisionVersion, qualityDisposition: selectedDisposition,
        reportId: report?.id, reportUpdatedAt: report?.updatedAt, unitPrice: item?.unitPrice.toString(), deductionPerTon,
        gradePrice: gradePrice?.status === 'READY' ? { gradePct: gradePrice.gradePct, moisturePct: gradePrice.moisturePct, band: gradePrice.band, spec: gradePrice.spec, rate: gradePrice.rate, unitPriceExTax: gradePrice.unitPrice,
          // 仅约定回收率条款的合同写入回收率事实，存量依据签名保持不变。
          ...('recovery' in gradePrice ? { recoveryPct: gradePrice.recoveryPct, recovery: gradePrice.recovery } : {}) } : null,
        priceRulesSnapshot: isGradeTier ? item?.priceRulesSnapshot : null };
      const priorBasis = { ...basis, inboundQuantity: posted?.quantity?.toString() };
      delete (priorBasis as Partial<typeof basis>).inboundPhysicalQuantity;
      const legacyBasis = { contractLineItemId: item?.id, contractRules: task?.contractQualitySnapshot || item?.qualityRulesSnapshot,
        waybillLineItemId: row.id, weightSelectionId: settlementSelection?.id, weight: Number(settlementSelection?.quantity || 0),
        weighTicketId: settlementSelection?.weighTicketId, ticketUpdatedAt: settlementSelection?.weighTicket.updatedAt,
        qualityTaskId: task?.id, decisionVersion: task?.decisionVersion, qualityDisposition: selectedDisposition,
        reportId: report?.id, reportUpdatedAt: report?.updatedAt, unitPrice: item?.unitPrice.toString(), deductionPerTon };
      return {
        id: row.id, waybillLineItemId: row.id, waybillId: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo,
        orderId: order.id, orderNo: order.orderNo, orderName: order.name, orderStatus: order.status, waybillStatus: w.status,
        contractLineItemId: item?.id, materialName: row.materialName || item?.materialName, unit: row.unit,
        totalQuantity, usedQuantity: usedQuantity.toNumber(), remainingQuantity, negotiableQuantity, negotiableRemainingQuantity,
        unitPrice: gradePrice?.status === 'READY' ? gradePrice.unitPrice : Number(item?.unitPrice || 0),
        contractTaxRatePct: item?.taxRatePct == null ? null : Number(item.taxRatePct),
        pricingType: contract.pricingType || 'FIXED', gradePrice,
        weightSelectionId: selection?.id, weighTicketId: ticket?.id || receipt?.weighTicketId, ticketNo: ticket?.ticketNo,
        inventoryTicketNo: inventoryTicket?.ticketNo, inventoryNetWeight: inventoryTicket?.netWeight == null ? null : Number(inventoryTicket.netWeight),
        settlementTicketNo: ticket?.ticketNo, settlementSelectionId: requestedTicketId ? null : settlementSelection?.id,
        settlementTicketScoped: Boolean(requestedTicketId),
        availableWeighTickets: w.weighTickets.filter(candidate => candidate.status === 'REVIEWED').map(candidate => ({ id: candidate.id, ticketNo: candidate.ticketNo, weighingStage: candidate.weighingStage, netWeight: candidate.netWeight == null ? null : Number(candidate.netWeight), isSelectable: effectiveByStage.get(candidate.weighingStage)?.id === candidate.id })),
        settlementWeightSource: separateSettlementTicket ? 'SELECTED_OTHER_SIDE' : settlementSelection ? 'EXPLICIT_INVENTORY' : 'INVENTORY_DEFAULT',
        inboundNo: posted?.inboundNo, inboundPostedAt: posted?.postedAt,
        inboundDate: receipt?.receivedAt || posted?.postedAt || null,
        grossWeight: ticket?.grossWeight == null ? null : Number(ticket.grossWeight),
        tareWeight: ticket?.tareWeight == null ? null : Number(ticket.tareWeight),
        netWeight, measuredMoisturePct, dryQuantity,
        pricingQuantityBasis: settlementQuantityBasis,
        qualityTaskId: task?.id, taskNo: task?.taskNo, reportId: report?.id, reportNo: report?.reportNo || report?.inspectionNo,
        inventoryReportId: inventoryReport?.id, inventoryReportNo: inventoryReport?.reportNo || inventoryReport?.inspectionNo,
        availableQualityReports: [...availableReports.values()].map(candidate => ({ id: candidate.id, reportNo: candidate.reportNo || candidate.inspectionNo, evidenceStage: candidate.evidenceStage, institutionName: candidate.institutionName, conclusion: candidate.conclusion, measuredMoisturePct: readMeasuredPct(candidate.indicators || [], 'MOISTURE') })),
        qualityDisposition: selectedDisposition || 'PENDING', qualityReady, qualityAcceptance: separateSettlementReport ? null : task?.qualityAcceptanceSnapshot,
        deductionPerTon, recoveryDeductionPerTon, evaluation: selectedEvaluation || task?.contractQualityEvaluation, decisionVersion: task?.decisionVersion,
        inboundStatuses: w.inboundReceipts.map(r => r.status), signature: signature(basis), priorSignature: signature(priorBasis), legacySignature: signature(legacyBasis),
        available: reasons.length === 0, reasons,
        ...goodsAmounts(remainingQuantity, gradePrice?.status === 'READY' ? gradePrice.unitPrice : item?.unitPrice || 0, deductionPerTon + recoveryDeductionPerTon),
      };
    });
  }

  async assertCurrent(settlementId: string, userId: string, permission = 'settlement.view') {
    const settlement = await this.prisma.financialSettlement.findUnique({ where: { id: settlementId }, include: { lines: true } });
    if (!settlement) throw new NotFoundException('采购结算单不存在');
    const tracked = settlement.lines.filter(l => l.waybillLineItemId);
    if (!tracked.length) return; // 历史人工结算保持原快照，不按新模板自动重算。
    const reportChoices = new Map(tracked.filter(line => (line.sourceSnapshot as any)?.reportId).map(line => [line.waybillLineItemId!, String((line.sourceSnapshot as any).reportId)]));
    const ticketChoices = new Map(tracked.filter(line => (line.sourceSnapshot as any)?.settlementTicketScoped && (line.sourceSnapshot as any)?.weighTicketId).map(line => [line.waybillLineItemId!, String((line.sourceSnapshot as any).weighTicketId)]));
    const sources = await this.sources(settlement.contractId, userId, permission, settlementId, reportChoices, ticketChoices);
    for (const line of tracked) {
      const current = sources.find(s => s.id === line.waybillLineItemId);
      const old = line.sourceSnapshot as Record<string, any> | null;
      const sameVersion = current && (
        current.signature === old?.signature
        || (old?.inboundNo && old.inboundNo === current.inboundNo && old?.inboundPhysicalQuantity == null
          && Number(old?.totalQuantity) === current.totalQuantity && current.priorSignature === old?.signature)
        || (!old?.inboundNo && Number(old?.totalQuantity) === current.totalQuantity && current.legacySignature === old?.signature)
      );
      const quantityCeiling = old?.negotiatedQuantity ? current?.negotiableRemainingQuantity : current?.remainingQuantity;
      if (!current || !current.available || !sameVersion || Number(line.quantity) > Number(quantityCeiling || 0)) {
        throw new BadRequestException(`结算依据已变更，待复核：${old?.waybillNo || line.orderNo || ''}。请检查磅单、最终检测报告或合同规则后重新确认结算。`);
      }
    }
  }
}
