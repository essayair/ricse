import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { decimalMoney, requestCommitment } from './payment-balance';
import { signature } from './purchase-settlement-basis';

export class LogisticsPaymentContext {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  async load(id: string, userId: string, permission = 'settlement.view', excludeRequestId?: string) {
    await this.access.assertPermission(userId, permission);
    const scope = await this.access.getLogisticsPaymentScope(userId, permission);
    const bankAccounts = { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }] };
    const settlement = await this.prisma.logisticsSettlement.findFirst({
      where: { id, AND: [scope] },
      include: {
        payerPartner: { include: { bankAccounts } },
        payerCompany: { include: { partner: { include: { bankAccounts } } } },
        preparer: { select: { companyId: true, employee: { select: { departmentId: true } } } },
        lines: { include: { waybill: { include: {
          carrierPartner: { include: { bankAccounts } },
          dispatchNotice: { include: { order: { include: { contract: { include: { businessUnit: true } } } } } },
        } } }, orderBy: { id: 'asc' } },
        paymentRequests: { include: { fundTransactions: { where: { status: { not: 'VOIDED' } } } } },
        paymentAllocations: { where: { reversedAt: null } },
      },
    });
    if (!settlement) throw new BadRequestException('物流结算单不存在或无权访问全部关联运单');
    if (settlement.status !== 'REVIEWED') throw new BadRequestException('请选择已复核且未作废的物流结算单');
    if (!settlement.lines.length) throw new BadRequestException('物流结算单没有运单明细');
    const payer = settlement.payerPartner || settlement.payerCompany?.partner;
    const carriers = new Set(settlement.lines.map(l => l.waybill.carrierPartnerId));
    const units = new Set(settlement.lines.map(l => l.waybill.dispatchNotice.order.contract.businessUnitId));
    if (!payer || !payer.isInternal || payer.status !== 'ACTIVE') throw new BadRequestException('请先为物流结算单维护有效的内部付款主体');
    if (carriers.size !== 1 || carriers.has(null)) throw new BadRequestException('物流结算单须归属同一已维护的承运方，请按承运方拆分结算后申请付款');
    if (units.size !== 1 || units.has(null)) throw new BadRequestException('物流结算单须归属同一业务单元，请按事业部拆分结算后申请付款');
    const carrier = settlement.lines[0].waybill.carrierPartner!;
    if (carrier.status !== 'ACTIVE') throw new BadRequestException('物流承运方已停用，请先核对合作伙伴资料');
    const businessUnit = settlement.lines[0].waybill.dispatchNotice.order.contract.businessUnit!;
    const registered = settlement.paymentRequests.reduce((sum, r) => sum.plus(r.fundTransactions.reduce((v, f) => v.plus(f.amount), new Prisma.Decimal(0))), new Prisma.Decimal(0));
    const reserved = settlement.paymentRequests.filter(r => r.id !== excludeRequestId).reduce((sum, r) => sum.plus(requestCommitment(r)), new Prisma.Decimal(0));
    const paidAmount = decimalMoney(registered);
    const reservedAmount = decimalMoney(reserved);
    const allocatedAmount = decimalMoney(settlement.paymentAllocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0)));
    const evidence = {
      sourceVersion: 2,
      logisticsSettlementId: settlement.id, settlementNo: settlement.settlementNo, totalAmount: settlement.totalAmount.toString(),
      payerPartnerId: payer.id, ownerPartnerId: settlement.ownerPartnerId, payerChangeReason: settlement.payerChangeReason, carrierPartnerId: carrier.id, businessUnitId: businessUnit.id,
      lines: settlement.lines.map(l => ({ id: l.id, waybillId: l.waybillId, waybillNo: l.waybill.waybillNo, netWeight: l.netWeight.toString(), unitPrice: l.unitPrice?.toString(), amount: l.amount?.toString(),
        weighTicketId: l.weighTicketId, chargeQuantity: l.chargeQuantity?.toString(), pricingBasis: l.pricingBasis, weightBasis: l.weightBasis, contractPriceTermId: l.contractPriceTermId, evidence: l.evidenceSnapshot })),
    };
    return {
      id: settlement.id, settlementNo: settlement.settlementNo, status: settlement.status,
      periodStart: settlement.periodStart, periodEnd: settlement.periodEnd, totalAmount: decimalMoney(settlement.totalAmount),
      legalEntity: payer, counterparty: carrier, businessUnit,
      companyId: settlement.payerCompanyId || settlement.preparer.companyId,
      departmentId: settlement.preparer.employee?.departmentId || null,
      paidAmount, reservedAmount, allocatedAmount,
      availableAmount: decimalMoney(Prisma.Decimal.max(0, settlement.totalAmount.minus(registered).minus(reserved))),
      evidence: { ...evidence, signature: signature(evidence), capturedAt: new Date().toISOString(),
        financialSnapshot: { logisticsTotal: decimalMoney(settlement.totalAmount), paidAmount, allocatedAmount, reservedAmount } },
    };
  }

  async validate(request: any, userId: string, permission: string, financeSubmit = false) {
    if (!request.logisticsSettlementId || request.contractId || request.orderId || request.settlementId || request.relatedTransactionId || request.basisType !== 'LOGISTICS_SETTLEMENT') throw new BadRequestException('物流付款须且只能关联一张物流结算单');
    if (!['SETTLEMENT', 'FINAL'].includes(request.paymentStage)) throw new BadRequestException('物流付款请选择结算款或尾款');
    const context = await this.load(request.logisticsSettlementId, userId, permission, request.id);
    if (request.legalEntityPartnerId !== context.legalEntity.id || request.counterpartyId !== context.counterparty.id || request.businessUnitId !== context.businessUnit.id) throw new BadRequestException('物流结算的付款主体、承运方或业务单元已变化，请重新核对付款申请');
    if (!request.purpose?.trim() || !request.conditionText?.trim()) throw new BadRequestException('请填写物流付款用途和付款条件说明');
    if (request.isThirdParty && !request.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const types = Array.isArray(request.conditionTypes) ? request.conditionTypes : [];
    if (types.some((t: string) => !['INVOICE', 'DATE', 'OTHER'].includes(t))) throw new BadRequestException('物流结算仅支持发票、约定日期或其他付款条件');
    if (types.includes('INVOICE') && financeSubmit && !request.attachments?.length) throw new BadRequestException('见票付款请先上传发票或财务核对依据');
    const registered = decimalMoney((request.fundTransactions || []).reduce((sum: Prisma.Decimal, f: any) => f.status === 'VOIDED' ? sum : sum.plus(f.amount), new Prisma.Decimal(0)));
    const remaining = decimalMoney(Math.max(0, Number(request.amount) - registered));
    if (remaining > context.availableAmount) throw new BadRequestException(`超过物流结算单可申请余额 ${context.availableAmount.toFixed(2)} 元，请核对已付款和其他申请`);
    let expectedSignature = context.evidence.signature;
    if (request.evidenceSnapshot?.signature && !(request.evidenceSnapshot as any).sourceVersion) {
      // 旧申请仅在原主体、承运方、事业部、原数量价格金额仍完全一致时兼容，不追溯重算。
      const e = context.evidence;
      expectedSignature = signature({ logisticsSettlementId: e.logisticsSettlementId, settlementNo: e.settlementNo, totalAmount: e.totalAmount,
        payerPartnerId: e.payerPartnerId, carrierPartnerId: e.carrierPartnerId, businessUnitId: e.businessUnitId,
        lines: e.lines.map(l => ({ id: l.id, waybillId: l.waybillId, waybillNo: l.waybillNo, netWeight: l.netWeight, unitPrice: l.unitPrice, amount: l.amount })) });
    }
    if (request.evidenceSnapshot?.signature && request.evidenceSnapshot.signature !== expectedSignature) throw new BadRequestException('物流结算依据已变更，请退回业务重新确认');
    return context;
  }
}
