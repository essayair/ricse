import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateGradePrice, readMeasuredPct } from '../contract/grade-price-rules';
import { evaluateContractQualityRules } from '../quality/contract-quality-rules';
import { goodsAmounts } from './payment-balance';
import { negotiableGoodsQuantity } from './negotiable-goods-quantity';

const APPROVED_SETTLEMENT = ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'];
const SETTLEMENT_STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', PENDING_APPROVAL: '审批中', REJECTED: '已驳回' };
export const FOLLOW_SALES_PENDING = '请先完成销售结算审批';

/**
 * 将非库存直拨交付适配到既有逐车结算协议；价税、调整仍由原结算服务统一处理。
 * 直拨进出必须平：销售结算默认采用交付确认的磅单与报告；采购结算的磅单、报告、数量（含协商）
 * 全部跟随同车已审批的销售结算，金额按采购方向价格另行计算。
 */
export async function directSettlementSources(prisma: PrismaService, contract: any, direction: 'PAYABLE' | 'RECEIVABLE', excludeSettlementId?: string, reportChoices = new Map<string, string>(), ticketChoices = new Map<string, string>()): Promise<any[]> {
  if (contract.type !== 'BILATERAL') return [];
  if (typeof (prisma as any).$transaction !== 'function') {
    // 与交付撤销串行；不能校验完依据后被并发撤销。
    await prisma.$queryRaw`SELECT d.id FROM direct_deliveries d JOIN waybills w ON w.id=d."waybillId" JOIN direct_executions e ON e."salesNoticeId"=w."dispatchNoticeId" WHERE e."contractId"=${contract.id} AND d.status='CONFIRMED' ORDER BY d.id FOR SHARE OF d`;
  }
  const rows = await prisma.waybillLineItem.findMany({
    where: { waybill: { deletedAt: null, status: { not: 'CANCELLED' }, dispatchNotice: { directSalesExecution: { is: { contractId: contract.id } }, deletedAt: null, status: { not: 'CANCELLED' } } } },
    include: {
      dispatchNoticeLineItem: { include: { orderLineItem: true } },
      settlementLines: { where: { settlementId: excludeSettlementId ? { not: excludeSettlementId } : undefined, settlement: { direction, deletedAt: null, status: { not: 'VOIDED' } } }, include: { settlement: { select: { id: true, settlementNo: true, status: true } } } },
      waybill: { include: {
        dispatchNotice: { include: { order: true, directSalesExecution: { include: { purchaseNotice: { include: { order: true } } } } } },
        directDeliveries: { where: { status: 'CONFIRMED' }, include: { documents: true }, orderBy: { version: 'desc' }, take: 1 },
        weighTickets: { where: { deletedAt: null, status: 'REVIEWED' } }, weightSelections: { where: { isCurrent: true } },
        qualityTask: { include: { basisInspection: { include: { indicators: true } }, reports: { where: { deletedAt: null, status: 'CONFIRMED' }, include: { indicators: true } }, reportLinks: { where: { unlinkedAt: null }, include: { inspection: { include: { indicators: true } } } } } },
      } },
    }, orderBy: { createdAt: 'asc' },
  });
  const purchase = direction === 'PAYABLE';
  // 采购跟随：读取同车有效销售结算行（每车每方向只允许一张有效结算单）。
  const salesLines = purchase && rows.length ? await prisma.financialSettlementLine.findMany({
    where: { waybillLineItemId: { in: rows.map(row => row.id) }, settlement: { direction: 'RECEIVABLE', deletedAt: null, status: { not: 'VOIDED' } } },
    include: { settlement: { select: { id: true, settlementNo: true, status: true, lines: { select: { waybillLineItemId: true, sourceSnapshot: true } } } } },
  }) : [];
  const salesByLine = new Map(salesLines.map(line => [line.waybillLineItemId!, line]));
  return rows.filter(row => row.waybill.dispatchNotice.directSalesExecution).map(row => {
    const w = row.waybill, d = w.directDeliveries[0], task = w.qualityTask;
    const sale = purchase ? salesByLine.get(row.id) : undefined;
    const saleSnapshot = sale?.sourceSnapshot as Record<string, any> | null | undefined;
    const salesApproved = Boolean(sale && APPROVED_SETTLEMENT.includes(sale.settlement.status));
    const order = purchase ? w.dispatchNotice.directSalesExecution!.purchaseNotice.order : w.dispatchNotice.order;
    const item = contract.lineItems.find((l: any) => l.id === row.dispatchNoticeLineItem.orderLineItem.contractLineItemId);
    const effective = new Map<string, typeof w.weighTickets[number]>();
    for (const stage of ['SHIPPING', 'RECEIVING']) {
      const candidates = w.weighTickets.filter(t => t.weighingStage === stage && Number(t.netWeight) > 0);
      const selection = w.weightSelections.find(s => s.purpose === stage);
      const selected = selection ? candidates.find(t => t.id === selection.weighTicketId) : candidates.length === 1 ? candidates[0] : undefined;
      if (selected) effective.set(stage, selected);
    }
    const reports = [...new Map([...(task?.reports || []), ...(task?.reportLinks.map(l => l.inspection) || []), ...(task?.basisInspection ? [task.basisInspection] : [])].filter(r => !r.deletedAt && r.status === 'CONFIRMED').map(r => [r.id, r])).values()];
    // 销售默认采用交付确认时的磅单与报告（销售磅单），可改选并走既有审批；采购不能改选，固定跟随销售结算。
    const deliveryTicket = w.weighTickets.find(t => t.id === d?.weighTicketId);
    const deliveryReport = reports.find(r => r.id === d?.qualityInspectionId);
    let ticket: typeof w.weighTickets[number] | undefined, report: typeof reports[number] | undefined, defaultReport: typeof reports[number] | undefined;
    if (purchase) {
      ticket = w.weighTickets.find(t => t.id === (saleSnapshot?.weighTicketId || d?.weighTicketId));
      report = reports.find(r => r.id === (saleSnapshot?.reportId || d?.qualityInspectionId));
      defaultReport = report;
    } else {
      const ticketId = ticketChoices.get(row.id);
      ticket = ticketId ? w.weighTickets.find(t => t.id === ticketId) : deliveryTicket || effective.get('RECEIVING');
      defaultReport = deliveryReport || reports.find(r => r.id === task?.basisInspectionId);
      report = reportChoices.has(row.id) ? reports.find(r => r.id === reportChoices.get(row.id)) : defaultReport;
    }
    const gradeTier = contract.pricingType === 'GRADE_TIER';
    const gradeRules = purchase ? item?.priceRulesSnapshot : item?.salesPriceRulesSnapshot;
    const basis = gradeTier ? gradeRules?.quantityBasis || item?.pricingQuantityBasis || d?.pricingQuantityBasis : item?.pricingQuantityBasis || d?.pricingQuantityBasis;
    const moisture = readMeasuredPct(report?.indicators || [], 'MOISTURE');
    const net = ticket?.netWeight == null ? null : Number(ticket.netWeight);
    const dry = net == null || moisture == null || moisture < 0 || moisture >= 100 ? null : new Prisma.Decimal(net).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(moisture).div(100))).toDecimalPlaces(3).toNumber();
    // 采购数量取同车销售结算行数量（已含销售逐车协商或调整）；尚无销售结算时仅按销售默认依据试算。
    const salesAdjustment = sale?.settlement.lines.map(line => (line.sourceSnapshot as any)?.settlementAdjustment).find(Boolean);
    const followAdjustment = sale && salesAdjustment?.mode === 'QUANTITY' ? {
      settlementId: sale.settlement.id, settlementNo: sale.settlement.settlementNo, finalQuantity: Number(salesAdjustment.final.quantity),
      waybillLineItemIds: sale.settlement.lines.map(line => line.waybillLineItemId).filter(Boolean) as string[],
    } : null;
    const total = sale ? Number(sale.quantity) : basis === 'DRY_MATTER' ? dry || 0 : net || 0;
    const used = row.settlementLines.reduce((a, l) => a.plus(l.quantity || 0), new Prisma.Decimal(0)).toNumber();
    const remaining = Math.max(0, new Prisma.Decimal(total).minus(used).toDecimalPlaces(3).toNumber());
    const negotiable = purchase
      ? (followAdjustment ? Number(saleSnapshot?.lineAdjustment?.quantityCeiling ?? total) : total)
      : negotiableGoodsQuantity(total, basis, effective, reports, moisture);
    const grade = gradeTier && gradeRules ? evaluateGradePrice(gradeRules, gradeRules.selectedSpec, remaining, report?.indicators || []) : null;
    const evaluation = report && item?.qualityRulesSnapshot ? evaluateContractQualityRules(item.qualityRulesSnapshot, report.indicators) : null;
    const defaultAccepted = task?.basisInspectionId === report?.id && ['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(task?.qualityDisposition || '');
    const disposition = gradeTier && !item?.qualityRulesSnapshot && grade?.status === 'READY' ? 'PASS' : defaultAccepted ? task!.qualityDisposition : evaluation?.disposition || (report?.conclusion === 'PASS' ? 'PASS' : 'REVIEW_REQUIRED');
    const deduction = purchase && disposition === 'ACCEPT_WITH_DEDUCTION' ? Number(task?.qualityDeductionPerTon || 0) : 0;
    const recovery = grade?.status === 'READY' ? grade.recovery?.deductionPerTon || 0 : 0;
    const unitPrice = grade?.status === 'READY' ? grade.unitPrice : Number(purchase ? item?.unitPrice || 0 : item?.salesUnitPrice || 0);
    const reasons: string[] = [];
    if (!d || !w.salesCompletionConfirmedAt) reasons.push('请先确认销售交付并同步采购');
    if (!ticket || effective.get(ticket.weighingStage)?.id !== ticket.id) reasons.push('请选择本车已复核的采信磅单');
    if (!report || !['SHIPPING', 'RECEIVING'].includes(report.evidenceStage)) reasons.push('请选择本车已确认并标明发收货环节的检测报告');
    if (!task || task.status !== 'COMPLETED') reasons.push('请先完成质检任务最终判定');
    if (basis === 'DRY_MATTER' && dry == null) reasons.push('折干结算缺少有效水分实测值');
    if (!['PHYSICAL', 'DRY_MATTER'].includes(basis || '')) reasons.push('请核对有效计价数量口径');
    if (!['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(disposition)) reasons.push('请先处理该报告对应的合同质量异常或扣款接收');
    if (gradeTier && (!grade || grade.status !== 'READY')) reasons.push(...(grade?.status === 'REVIEW_REQUIRED' ? grade.reasons : ['合同缺少有效品位分档价格表']));
    if (!item) reasons.push('无法匹配合同物料行');
    if (row.settlementLines.length) reasons.push('该运单本方向已创建结算单（含草稿），请先作废原结算单再重做');
    if (remaining <= 0) reasons.push('没有剩余可结算数量');
    if (purchase && sale && saleSnapshot?.pricingQuantityBasis && basis !== saleSnapshot.pricingQuantityBasis) reasons.push('采购与销售价格条款的计价重量口径不一致，无法保证进出数量一致，请先核对合同');
    // 跟随原因单列：仅缺销售审批时允许预览，不允许保存。
    const followReasons: string[] = [];
    if (purchase && !sale) followReasons.push(`${FOLLOW_SALES_PENDING}（本车尚未编制销售结算，以下数量仅按销售默认依据试算）`);
    else if (purchase && !salesApproved) followReasons.push(`${FOLLOW_SALES_PENDING}（销售结算 ${sale!.settlement.settlementNo} 当前${SETTLEMENT_STATUS_LABEL[sale!.settlement.status] || sale!.settlement.status}）`);
    const snapshot = { directDeliveryId: d?.id, directVersion: d?.version, direction, contractLineItemId: item?.id, contractRules: item?.qualityRulesSnapshot,
      gradeRules, weighTicketId: ticket?.id, ticketUpdatedAt: ticket?.updatedAt, reportId: report?.id, reportUpdatedAt: report?.updatedAt,
      decisionVersion: task?.decisionVersion, quantityBasis: basis, totalQuantity: total, unitPrice, taxRatePct: item?.taxRatePct?.toString(), deduction, recovery, disposition,
      ...(purchase ? { followSalesLineId: sale?.id || null, followSalesQuantity: sale ? String(sale.quantity) : null, salesApproved, followAdjustment } : {}) };
    const signature = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const inventoryReport = purchase ? report : deliveryReport;
    const allReasons = [...reasons, ...followReasons];
    return {
      id: row.id, waybillLineItemId: row.id, directDeliveryId: d?.id, directVersion: d?.version, direct: true,
      waybillId: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo, waybillStatus: w.status,
      orderId: order.id, orderNo: order.orderNo, orderName: order.name, orderStatus: order.status,
      contractLineItemId: item?.id, materialName: row.materialName || item?.materialName, unit: row.unit,
      totalQuantity: total, usedQuantity: used, remainingQuantity: remaining, negotiableQuantity: negotiable, negotiableRemainingQuantity: Math.max(0, negotiable - used),
      settlementOccupied: row.settlementLines.length > 0, occupiedSettlements: row.settlementLines.map(l => l.settlement),
      unitPrice, contractTaxRatePct: item?.taxRatePct == null ? null : Number(item.taxRatePct), pricingType: contract.pricingType, gradePrice: grade,
      weighTicketId: ticket?.id, ticketNo: ticket?.ticketNo, settlementTicketNo: ticket?.ticketNo, weightSelectionId: w.weightSelections.find(s => s.purpose === ticket?.weighingStage && s.weighTicketId === ticket?.id)?.id,
      settlementTicketScoped: !purchase && ticketChoices.has(row.id), settlementWeightSource: purchase ? 'FOLLOW_SALES' : 'DIRECT_SELECTED', settlementSelectionId: null,
      followSales: purchase, followSalesSettlementId: sale?.settlement.id || null, followSalesSettlementNo: sale?.settlement.settlementNo || null,
      followSalesStatus: sale?.settlement.status || null, followAdjustment, previewOnly: purchase && followReasons.length > 0 && reasons.length === 0,
      inventoryTicketNo: deliveryTicket?.ticketNo, inventoryNetWeight: deliveryTicket?.netWeight == null ? null : Number(deliveryTicket.netWeight),
      customerTicketNo: purchase ? ticket?.ticketNo : deliveryTicket?.ticketNo, customerNetWeight: d ? Number(d.quantity) : null, shippingNetWeight: effective.get('SHIPPING')?.netWeight == null ? null : Number(effective.get('SHIPPING')!.netWeight),
      grossWeight: ticket?.grossWeight == null ? null : Number(ticket.grossWeight), tareWeight: ticket?.tareWeight == null ? null : Number(ticket.tareWeight), netWeight: net, measuredMoisturePct: moisture, dryQuantity: dry,
      pricingQuantityBasis: basis, salesCompletionConfirmedAt: d?.confirmedAt, inboundDate: d?.confirmedAt, inboundPostedAt: d?.confirmedAt,
      inboundNo: d?.documents.find(doc => doc.direction === 'PURCHASE')?.documentNo, outboundNo: d?.documents.find(doc => doc.direction === 'SALES')?.documentNo,
      qualityTaskId: task?.id, taskNo: task?.taskNo, reportId: report?.id, reportNo: report?.reportNo || report?.inspectionNo,
      inventoryReportId: inventoryReport?.id, inventoryReportNo: inventoryReport?.reportNo || inventoryReport?.inspectionNo, defaultReportId: defaultReport?.id,
      // 采购跟随销售：候选只保留销售采用的磅单和报告，页面无法改选。
      availableWeighTickets: w.weighTickets.filter(t => !purchase || t.id === ticket?.id).map(t => ({ id: t.id, ticketNo: t.ticketNo, weighingStage: t.weighingStage, netWeight: Number(t.netWeight), isSelectable: effective.get(t.weighingStage)?.id === t.id })),
      availableQualityReports: reports.filter(r => !purchase || r.id === report?.id).map(r => ({ id: r.id, reportNo: r.reportNo || r.inspectionNo, evidenceStage: r.evidenceStage, institutionName: r.institutionName, conclusion: r.conclusion, measuredGradePct: readMeasuredPct(r.indicators, 'GRADE'), measuredMoisturePct: readMeasuredPct(r.indicators, 'MOISTURE'), measuredRecoveryPct: readMeasuredPct(r.indicators, 'RECOVERY') })),
      qualityDisposition: disposition, qualityReady: !reasons.some(r => /质|报告|水分/.test(r)), qualityAcceptance: task?.qualityAcceptanceSnapshot, evaluation, decisionVersion: task?.decisionVersion,
      deductionPerTon: deduction, recoveryDeductionPerTon: recovery, inboundStatuses: d ? ['POSTED'] : [], signature, priorSignature: signature, legacySignature: signature, basis: snapshot,
      available: allReasons.length === 0, reasons: allReasons, ...goodsAmounts(remaining, unitPrice, deduction + recovery),
    };
  });
}
