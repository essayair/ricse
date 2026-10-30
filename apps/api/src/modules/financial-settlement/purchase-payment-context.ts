import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { decimalMoney, requestCommitment, TRADE_PAYMENT_STAGES } from './payment-balance';
import { PurchaseSettlementBasis, signature } from './purchase-settlement-basis';

export class PurchasePaymentContext {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  async load(contractId: string, userId: string, permission = 'settlement.view', excludeRequestId?: string) {
    await this.access.assertPermission(userId, permission);
    const scope = await this.access.getContractScope(userId, permission);
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, deletedAt: null, AND: [scope] },
      include: { lineItems: true, signingPartner: { include: { bankAccounts: { where: { status: 'ACTIVE' } } } }, seller: { include: { bankAccounts: { where: { status: 'ACTIVE' } } } }, buyer: { include: { bankAccounts: { where: { status: 'ACTIVE' } } } }, businessUnit: true } });
    if (!contract) throw new BadRequestException('合同不存在或无权访问');
    const [requests, funds, settlements, orders, sources] = await Promise.all([
      this.prisma.paymentRequest.findMany({ where: { contractId, businessType: 'PURCHASE', paymentStage: { in: TRADE_PAYMENT_STAGES } }, include: { fundTransactions: true } }),
      this.prisma.fundTransaction.findMany({ where: { contractId, businessType: 'PURCHASE', direction: 'PAYMENT', paymentStage: { in: TRADE_PAYMENT_STAGES }, status: { not: 'VOIDED' } }, include: { paymentRequest: true, earmarks: { where: { releasedAt: null } }, allocations: { where: { reversedAt: null } } } }),
      this.prisma.financialSettlement.findMany({ where: { contractId, direction: 'PAYABLE', deletedAt: null, status: { in: ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'] } }, include: { lines: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.order.findMany({ where: { contractId, type: 'PURCHASE', deletedAt: null, status: { not: 'CANCELLED' } }, select: { id: true, orderNo: true, name: true, status: true, totalAmount: true } }),
      ['PURCHASE', 'BILATERAL'].includes(contract.type) ? new PurchaseSettlementBasis(this.prisma, this.access).sources(contractId, userId, permission) : Promise.resolve([]),
    ]);
    const pending = requests.filter(r => r.id !== excludeRequestId);
    const nominalAmount = decimalMoney(contract.type === 'BILATERAL' ? contract.lineItems.reduce((sum, l) => sum.plus(l.totalPrice), new Prisma.Decimal(0)) : contract.totalAmount);
    const paidAmount = decimalMoney(funds.reduce((sum, f) => sum.plus(f.amount).minus(f.refundedAmount), new Prisma.Decimal(0)));
    const unpaidCommitment = decimalMoney(pending.reduce((sum, r) => sum.plus(requestCommitment(r)), new Prisma.Decimal(0)));
    const formalAmount = decimalMoney(settlements.reduce((sum, s) => sum.plus(s.totalAmount), new Prisma.Decimal(0)));
    const contractLimit = ['COMPLETED', 'CLOSED', 'TERMINATED'].includes(contract.status) && settlements.length && sources.every(s => s.available || s.remainingQuantity === 0)
      ? formalAmount : Math.max(nominalAmount, formalAmount);
    const availableContract = decimalMoney(Math.max(0, contractLimit - paidAmount - unpaidCommitment));
    const fundRows = funds.map(f => {
      const available = decimalMoney(Math.max(0, Number(f.amount) - Number(f.refundedAmount) - Number(f.allocatedAmount)));
      const earmarked = decimalMoney(f.earmarks.reduce((sum, e) => sum.plus(e.amount).minus(e.consumedAmount), new Prisma.Decimal(0)));
      return { ...f, available, earmarked, unassigned: f.paymentRequest?.settlementId ? 0 : decimalMoney(Math.max(0, available - earmarked)) };
    });
    const settlementRows = settlements.map(s => {
      const reserved = decimalMoney(pending.filter(r => r.settlementId === s.id).reduce((sum, r) => sum.plus(requestCommitment(r)), new Prisma.Decimal(0)));
      const registered = decimalMoney(fundRows.reduce((sum, f) => {
        if (f.paymentRequest?.settlementId === s.id) return sum.plus(f.available);
        return sum.plus(f.earmarks.filter(e => e.settlementId === s.id).reduce((v, e) => v.plus(e.amount).minus(e.consumedAmount), new Prisma.Decimal(0)));
      }, new Prisma.Decimal(0)));
      return { ...s, reservedAmount: reserved, registeredUnallocatedAmount: registered,
        availableAmount: decimalMoney(Math.max(0, Number(s.totalAmount) - Number(s.settledAmount) - reserved - registered)) };
    });
    const advanceExposure = decimalMoney(funds.filter(f => f.paymentStage === 'ADVANCE').reduce((sum, f) => sum.plus(f.amount).minus(f.refundedAmount), new Prisma.Decimal(0))
      .plus(pending.filter(r => r.paymentStage === 'ADVANCE').reduce((sum, r) => sum.plus(requestCommitment(r)), new Prisma.Decimal(0))));
    const prepayLimit = contract.prepayPct == null ? null : decimalMoney(nominalAmount * Number(contract.prepayPct) / 100);
    return { contract: { ...contract, counterparty: contract.sellerId !== contract.signingPartnerId ? contract.seller : contract.buyer },
      orders, settlements: settlementRows, sources, funds: fundRows,
      summary: { nominalAmount, contractLimit, formalAmount, paidAmount, unpaidCommitment, availableContract, advanceExposure,
        availableAdvance: prepayLimit == null ? availableContract : decimalMoney(Math.max(0, Math.min(availableContract, prepayLimit - advanceExposure))),
        unassignedFundAmount: decimalMoney(fundRows.reduce((sum, f) => sum.plus(f.unassigned), new Prisma.Decimal(0))) } };
  }

  async validate(request: any, userId: string, permission: string, financeSubmit = false) {
    if (request.businessType !== 'PURCHASE') return null;
    const context = await this.load(request.contractId, userId, permission, request.id);
    if (!['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED', 'TERMINATED'].includes(context.contract.status)) throw new BadRequestException('合同尚未审批生效或已作废，不能继续付款');
    if (request.basisType === 'LEGACY') return context; // 保留老单据，不补造新合同付款条件。
    if (['COMPLETED', 'CLOSED', 'TERMINATED'].includes(context.contract.status) && !request.settlementId && ['ADVANCE', 'PROGRESS'].includes(request.paymentStage)) throw new BadRequestException('合同已结束，请按已确认采购结算办理剩余货款，不再新增预付款或阶段备款');
    if (!request.purpose?.trim() || !request.conditionText?.trim()) throw new BadRequestException('请填写付款用途和本次付款条件说明');
    if (['SETTLEMENT', 'FINAL'].includes(request.paymentStage) && !request.settlementId) throw new BadRequestException('结算款和尾款请先关联已确认的采购结算单；提前付款请选择预付款或阶段款');
    if (request.basisType === 'BATCH' && !request.orderId) throw new BadRequestException('按执行批次申请时请选择执行批次');
    if (request.orderId && !context.orders.some(o => o.id === request.orderId)) throw new BadRequestException('关联执行批次已取消或不属于当前合同');
    const registered = decimalMoney((request.fundTransactions || []).filter((f: any) => f.status !== 'VOIDED').reduce((sum: number, f: any) => sum + Number(f.amount), 0));
    const unapplied = decimalMoney(Math.max(0, Number(request.amount) - registered));
    if (TRADE_PAYMENT_STAGES.includes(request.paymentStage)) {
      if (unapplied > context.summary.availableContract) throw new BadRequestException(`付款额度不足，当前最多可再申请 ${context.summary.availableContract.toFixed(2)} 元，请核对已付、预付款和其他申请`);
      if (request.paymentStage === 'ADVANCE' && unapplied > context.summary.availableAdvance) throw new BadRequestException(`超过合同预付款可申请余额 ${context.summary.availableAdvance.toFixed(2)} 元`);
    }
    const chosen = context.settlements.find(s => s.id === request.settlementId);
    if (request.settlementId) {
      if (!chosen || !['CONFIRMED', 'PARTIALLY_SETTLED'].includes(chosen.status)) throw new BadRequestException('采购结算单无效、已结清或不属于当前合同');
      if (request.orderId && chosen.lines.length && !chosen.lines.some(l => l.orderId === request.orderId)) throw new BadRequestException('所选执行批次不在该采购结算单中');
      if (unapplied > chosen.availableAmount) throw new BadRequestException(`超过采购结算单可申请余额 ${chosen.availableAmount.toFixed(2)} 元`);
      await new PurchaseSettlementBasis(this.prisma, this.access).assertCurrent(chosen.id, userId, permission);
      if (financeSubmit && TRADE_PAYMENT_STAGES.includes(request.paymentStage)) {
        const orderIds = new Set(chosen.lines.map(l => l.orderId));
        const unprocessed = context.funds.filter(f => f.available > 0 && f.paymentRequest?.settlementId !== chosen.id)
          .filter(f => f.unassigned > 0 || f.earmarks.some(e => Number(e.amount) > Number(e.consumedAmount) && (e.settlementId === chosen.id || Boolean(e.orderId && orderIds.has(e.orderId)))));
        if (unprocessed.length) throw new BadRequestException('存在本合同尚未处理的已付款资金，请先核销抵扣本结算，或明确保留给其他批次后再提交审批');
      }
    } else if (request.basisType === 'SETTLEMENT') throw new BadRequestException('请选择已确认的采购结算单');
    const ids: string[] = Array.isArray(request.sourceLineIds) ? request.sourceLineIds : [];
    const types: string[] = Array.isArray(request.conditionTypes) ? request.conditionTypes : [];
    if (types.includes('INVOICE') && financeSubmit && !request.attachments?.length) throw new BadRequestException('本次按见票付款申请，请上传发票或对应核对依据后由财务提交');
    const required = types.some(t => ['DISPATCHED', 'ARRIVED', 'SIGNED_RECEIPT', 'QUALITY', 'INBOUND'].includes(t));
    const effectiveIds = chosen ? chosen.lines.map(l => l.waybillLineItemId).filter((id): id is string => Boolean(id)) : ids;
    const selected = effectiveIds.map(id => context.sources.find(s => s.id === id));
    if (selected.some(s => !s || (request.orderId && s.orderId !== request.orderId))) throw new BadRequestException('付款依据包含无效或其他执行批次的货物');
    if (required && !selected.length) throw new BadRequestException('请关联满足本次条件的具体运单货物；历史人工结算请明确核对原始凭据，不标记未经系统验证的条件');
    for (const s of selected) {
      if (!s) continue;
      if (types.includes('QUALITY') && !s.qualityReady) throw new BadRequestException(`${s.waybillNo}尚未完成合格或扣款接收确认`);
      if (types.includes('DISPATCHED') && !['IN_TRANSIT', 'ARRIVED', 'SIGNED'].includes(s.waybillStatus)) throw new BadRequestException(`${s.waybillNo}尚未发货`);
      if (types.includes('ARRIVED') && !['ARRIVED', 'SIGNED'].includes(s.waybillStatus)) throw new BadRequestException(`${s.waybillNo}尚未到达`);
      if (types.includes('SIGNED_RECEIPT') && s.waybillStatus !== 'SIGNED') throw new BadRequestException(`${s.waybillNo}尚未签收`);
      if (types.includes('INBOUND') && !s.inboundStatuses.includes('POSTED')) throw new BadRequestException(`${s.waybillNo}尚未完成入库过账`);
    }
    const evidence = { settlementId: chosen?.id, settlementAmount: chosen?.totalAmount.toString(),
      lines: chosen?.lines.slice().sort((a, b) => a.id.localeCompare(b.id)).map(l => ({ id: l.id, source: l.sourceSnapshot, totalAmount: l.totalAmount.toString() })),
      qualitySources: types.includes('QUALITY') ? selected.map(s => ({ id: s!.id, signature: s!.signature })) : [] };
    const old = request.evidenceSnapshot as any;
    if (old?.signature && old.signature !== signature(evidence)) throw new BadRequestException('付款依据已变更，请退回业务重新核对并提交审批');
    return { ...context, evidence: { ...evidence, signature: signature(evidence), capturedAt: new Date().toISOString(),
      financialSnapshot: { ...context.summary, settlementTotal: chosen?.totalAmount.toString(), settledAmount: chosen?.settledAmount.toString(), availableAmount: chosen?.availableAmount },
      selectedSources: selected.filter(Boolean) } };
  }
}
