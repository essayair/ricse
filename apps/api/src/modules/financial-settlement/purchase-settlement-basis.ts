import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { goodsAmounts } from './payment-balance';

export const snapshotJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const signature = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** 从已经选定的磅单和报告读取事实；不在资金模块重新选报告或解释合同质量规则。 */
export class PurchaseSettlementBasis {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  async sources(contractId: string, userId: string, permission = 'settlement.view', excludeSettlementId?: string) {
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
          weightSelections: { where: { isCurrent: true }, include: { weighTicket: true }, orderBy: { selectedAt: 'desc' } },
          qualityTask: { include: { basisInspection: true } },
          inboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, include: { weighTicket: true, businessInbound: true }, orderBy: { createdAt: 'desc' } },
        } },
      }, orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => {
      const w = row.waybill, order = w.dispatchNotice.order;
      const item = contract.lineItems.find(l => l.id === row.dispatchNoticeLineItem.orderLineItem.contractLineItemId);
      const receipt = w.inboundReceipts.find(r => r.status === 'POSTED' && r.businessInbound?.status === 'POSTED');
      const posted = receipt?.businessInbound, ticket = receipt?.weighTicket;
      const selection = w.weightSelections.find(s => s.purpose === 'INVENTORY' && s.weighTicketId === receipt?.weighTicketId), task = w.qualityTask, report = task?.basisInspection;
      const legacySelection = w.weightSelections.find(s => s.purpose === 'SETTLEMENT');
      // 最终采购货款跟随实际入库过账，不另选货款磅单，也不以磅单最新净重覆盖已过账数量。
      const totalQuantity = Number(posted?.pricingQuantity ?? posted?.quantity ?? 0);
      const usedQuantity = row.settlementLines.reduce((sum, l) => sum.plus(l.quantity || 0), new Prisma.Decimal(0));
      const remainingQuantity = Prisma.Decimal.max(0, new Prisma.Decimal(totalQuantity).minus(usedQuantity)).toDecimalPlaces(3).toNumber();
      const reasons: string[] = [];
      if (w.lineItems.length !== 1) reasons.push('该车含多物料，需先明确各物料重量及检测依据');
      if (!posted || totalQuantity <= 0) reasons.push('请先完成采购入库过账；最终货款按入库过账数量结算，提前付款请使用预付款或阶段款申请');
      if (!ticket || ticket.deletedAt || ticket.status !== 'REVIEWED') reasons.push('请先核对入库过账关联的结算入库磅单');
      if (!item) reasons.push('无法匹配合同物料行');
      if (!task || task.deletedAt || task.status !== 'COMPLETED' || !report || report.deletedAt || report.status !== 'CONFIRMED') reasons.push('请先完成最终质检判定');
      if (task && !['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition)) reasons.push(task.qualityDisposition === 'DEDUCTION_PENDING' ? '请由结算或付款申请人员确认按合同扣款接收' : '当前质量结果为拒收或待判定，不能正常结算');
      if (legacyContract || legacyOrders.has(order.id)) reasons.push('存在未映射到具体货物的历史应付，请先复核并处理重叠结算');
      if (remainingQuantity <= 0) reasons.push('该来源数量已全部结算或被结算草稿占用');
      if (!['TON', '吨', 't'].includes(row.unit)) reasons.push('当前自动质量扣款仅支持已明确以吨计价的物料');
      const deductionPerTon = task && ['DEDUCTION_PENDING', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition) ? Number(task.qualityDeductionPerTon || 0) : 0;
      const qualityReady = Boolean(task && !task.deletedAt && task.status === 'COMPLETED' && report && !report.deletedAt && report.status === 'CONFIRMED' && ['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition));
      const basis = { contractLineItemId: item?.id, contractRules: task?.contractQualitySnapshot || item?.qualityRulesSnapshot,
        waybillLineItemId: row.id, weightSelectionId: selection?.id, weight: totalQuantity,
        weighTicketId: receipt?.weighTicketId, ticketUpdatedAt: ticket?.updatedAt,
        businessInboundId: posted?.id, inboundQuantity: (posted?.pricingQuantity ?? posted?.quantity)?.toString(), inboundPhysicalQuantity: posted?.quantity?.toString(), inboundStatus: posted?.status, inboundPostedAt: posted?.postedAt,
        qualityTaskId: task?.id, decisionVersion: task?.decisionVersion, qualityDisposition: task?.qualityDisposition,
        reportId: report?.id, reportUpdatedAt: report?.updatedAt, unitPrice: item?.unitPrice.toString(), deductionPerTon };
      const priorBasis = { ...basis, inboundQuantity: posted?.quantity?.toString() };
      delete (priorBasis as Partial<typeof basis>).inboundPhysicalQuantity;
      const legacyBasis = { contractLineItemId: item?.id, contractRules: task?.contractQualitySnapshot || item?.qualityRulesSnapshot,
        waybillLineItemId: row.id, weightSelectionId: legacySelection?.id, weight: Number(legacySelection?.quantity || 0),
        weighTicketId: legacySelection?.weighTicketId, ticketUpdatedAt: legacySelection?.weighTicket.updatedAt,
        qualityTaskId: task?.id, decisionVersion: task?.decisionVersion, qualityDisposition: task?.qualityDisposition,
        reportId: report?.id, reportUpdatedAt: report?.updatedAt, unitPrice: item?.unitPrice.toString(), deductionPerTon };
      return {
        id: row.id, waybillLineItemId: row.id, waybillId: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo,
        orderId: order.id, orderNo: order.orderNo, orderName: order.name, orderStatus: order.status, waybillStatus: w.status,
        contractLineItemId: item?.id, materialName: row.materialName || item?.materialName, unit: row.unit,
        totalQuantity, usedQuantity: usedQuantity.toNumber(), remainingQuantity, unitPrice: Number(item?.unitPrice || 0),
        weightSelectionId: selection?.id, weighTicketId: receipt?.weighTicketId, ticketNo: ticket?.ticketNo,
        inboundNo: posted?.inboundNo, inboundPostedAt: posted?.postedAt,
        qualityTaskId: task?.id, taskNo: task?.taskNo, reportId: report?.id, reportNo: report?.reportNo || report?.inspectionNo,
        qualityDisposition: task?.qualityDisposition || 'PENDING', qualityReady, qualityAcceptance: task?.qualityAcceptanceSnapshot,
        deductionPerTon, evaluation: task?.contractQualityEvaluation, decisionVersion: task?.decisionVersion,
        inboundStatuses: w.inboundReceipts.map(r => r.status), signature: signature(basis), priorSignature: signature(priorBasis), legacySignature: signature(legacyBasis),
        available: reasons.length === 0, reasons,
        ...goodsAmounts(remainingQuantity, item?.unitPrice || 0, deductionPerTon),
      };
    });
  }

  async assertCurrent(settlementId: string, userId: string, permission = 'settlement.view') {
    const settlement = await this.prisma.financialSettlement.findUnique({ where: { id: settlementId }, include: { lines: true } });
    if (!settlement) throw new NotFoundException('采购结算单不存在');
    const tracked = settlement.lines.filter(l => l.waybillLineItemId);
    if (!tracked.length) return; // 历史人工结算保持原快照，不按新模板自动重算。
    const sources = await this.sources(settlement.contractId, userId, permission, settlementId);
    for (const line of tracked) {
      const current = sources.find(s => s.id === line.waybillLineItemId);
      const old = line.sourceSnapshot as Record<string, any> | null;
      const sameVersion = current && (
        current.signature === old?.signature
        || (old?.inboundNo && old.inboundNo === current.inboundNo && old?.inboundPhysicalQuantity == null
          && Number(old?.totalQuantity) === current.totalQuantity && current.priorSignature === old?.signature)
        || (!old?.inboundNo && Number(old?.totalQuantity) === current.totalQuantity && current.legacySignature === old?.signature)
      );
      if (!current || !current.available || !sameVersion || Number(line.quantity) > current.remainingQuantity) {
        throw new BadRequestException(`结算依据已变更，待复核：${old?.waybillNo || line.orderNo || ''}。请检查磅单、最终检测报告或合同规则后重新确认结算。`);
      }
    }
  }
}
