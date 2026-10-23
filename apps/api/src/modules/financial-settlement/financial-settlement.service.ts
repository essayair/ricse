import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, FundEarmark, Attachment } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  AllocateFundDto, ClaimFundDto, CreateFinancialSettlementDto, CreateFundTransactionDto, CreatePaymentRequestDto,
  ExecutePaymentRequestDto, RejectPaymentRequestDto, ReviewPaymentRequestDto, ReverseAllocationDto, UpdatePaymentRequestDto, CreateFundEarmarkDto,
} from './dto/financial-settlement.dto';
import { PurchaseSettlementBasis, snapshotJson, signature } from './purchase-settlement-basis';
import { PurchasePaymentContext } from './purchase-payment-context';
import { LogisticsPaymentContext } from './logistics-payment-context';
import { goodsAmounts, requestCommitment, ACTIVE_PAYMENT_REQUEST_STATUSES } from './payment-balance';

const SETTLEMENT_INCLUDE = {
  contract: { select: { id: true, contractNo: true, title: true, type: true, totalAmount: true } },
  businessUnit: { select: { id: true, code: true, name: true } },
  legalEntity: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true, username: true } },
  confirmer: { select: { id: true, name: true, username: true } },
  lines: {
    include: { order: { select: { id: true, status: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  allocations: {
    include: {
      fundTransaction: {
        select: {
          id: true, transactionNo: true, direction: true, category: true, businessType: true,
          paymentStage: true, paymentMethod: true, amount: true, occurredAt: true,
          bankReference: true, status: true,
        },
      },
      creator: { select: { id: true, name: true, username: true } },
      reverser: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const PRINT_PARTY_SELECT = {
  id: true, code: true, name: true, address: true, bizAddress: true, contactPerson: true, contactPhone: true,
  bankAccounts: {
    where: { status: 'ACTIVE' },
    orderBy: [
      { isDefault: 'desc' },
      { createdAt: 'asc' },
    ] as Prisma.BankAccountOrderByWithRelationInput[],
    take: 1,
    select: { accountName: true, accountNo: true, bankName: true, currency: true },
  },
} as const;

const BANK_ACCOUNT_SELECT = {
  id: true, accountName: true, accountNo: true, bankName: true, bankCode: true, currency: true, isDefault: true,
} as const;

const SETTLEMENT_DETAIL_INCLUDE = {
  ...SETTLEMENT_INCLUDE,
  legalEntity: { select: PRINT_PARTY_SELECT },
  counterparty: { select: PRINT_PARTY_SELECT },
} as const;

const FUND_INCLUDE = {
  contract: { select: { id: true, contractNo: true, title: true, type: true } },
  legalEntity: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true, username: true } },
  claimer: { select: { id: true, name: true, username: true } },
  confirmer: { select: { id: true, name: true, username: true } },
  paymentRequest: { select: { id: true, requestNo: true, status: true, logisticsSettlementId: true, logisticsSettlement: { select: { id: true, settlementNo: true, totalAmount: true } } } },
  logisticsAllocations: { include: { settlement: { select: { id: true, settlementNo: true } } }, orderBy: { createdAt: 'desc' as const } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  relatedTransaction: { select: { id: true, transactionNo: true, paymentStage: true, amount: true } },
  allocations: {
    include: { settlement: { select: { id: true, settlementNo: true, direction: true, totalAmount: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  claims: {
    where: { status: { not: 'REVERSED' } },
    include: {
      contract: { select: { id: true, contractNo: true, title: true } },
      order: { select: { id: true, orderNo: true, name: true, status: true } },
      businessUnit: { select: { id: true, code: true, name: true } },
      counterparty: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, name: true, username: true } },
      confirmer: { select: { id: true, name: true, username: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const PAYMENT_REQUEST_INCLUDE = {
  logisticsSettlement: { select: { id: true, settlementNo: true, totalAmount: true, status: true, payerCompanyId: true, preparer: { select: { companyId: true, employee: { select: { departmentId: true } } } } } },
  contract: { select: { id: true, contractNo: true, title: true, type: true, companyId: true, departmentId: true, businessUnitId: true } },
  settlement: { select: { id: true, settlementNo: true, totalAmount: true, settledAmount: true, status: true } },
  order: { select: { id: true, orderNo: true, name: true, status: true, totalAmount: true } },
  relatedTransaction: { select: { id: true, transactionNo: true, paymentStage: true, amount: true, allocatedAmount: true, refundedAmount: true } },
  businessUnit: { select: { id: true, code: true, name: true } },
  legalEntity: {
    select: {
      id: true, code: true, name: true,
      bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] as Prisma.BankAccountOrderByWithRelationInput[], select: BANK_ACCOUNT_SELECT },
    },
  },
  counterparty: {
    select: {
      id: true, code: true, name: true,
      bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] as Prisma.BankAccountOrderByWithRelationInput[], select: BANK_ACCOUNT_SELECT },
    },
  },
  creator: { select: { id: true, name: true, username: true } },
  businessConfirmer: { select: { id: true, name: true, username: true } },
  submitter: { select: { id: true, name: true, username: true } },
  approver: { select: { id: true, name: true, username: true } },
  rejecter: { select: { id: true, name: true, username: true } },
  fundTransactions: {
    where: { status: { not: 'VOIDED' } },
    select: { id: true, transactionNo: true, status: true, amount: true, occurredAt: true, bankReference: true },
    orderBy: { occurredAt: 'desc' as const },
  },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  approvals: {
    include: {
      assignee: { select: { id: true, name: true, username: true } },
      actedBy: { select: { id: true, name: true, username: true } },
    },
    orderBy: [
      { round: 'desc' as const },
      { step: 'asc' as const },
      { createdAt: 'asc' as const },
    ] as Prisma.PaymentRequestApprovalOrderByWithRelationInput[],
  },
} as const;

const ALLOCATABLE_STAGES = ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'OTHER'];
type SettlementResult = Prisma.FinancialSettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;
type PaymentRequestResult = Prisma.PaymentRequestGetPayload<{ include: typeof PAYMENT_REQUEST_INCLUDE }>;
type FundResult = Prisma.FundTransactionGetPayload<{ include: typeof FUND_INCLUDE }>;
const REVERSE_STAGES = ['REFUND', 'GUARANTEE_RETURN'];
// 结算申请不以履约完成为前提。预付款、发货款、到货款等都可能发生在不同执行阶段，
// 但已取消批次不能继续形成新的应收/应付。
const SETTLEABLE_ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'DISPATCHED', 'COMPLETED'];

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function quantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function businessDate(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function normalizedBankAccount(value?: string | null) {
  return (value || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function normalizedPartyName(value?: string | null) {
  return (value || '').replace(/[\s（）()·,，.。]/g, '').toLowerCase();
}

@Injectable()
export class FinancialSettlementService {
  private transactional = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private async withContractLock<T>(contractId: string, action: (service: FinancialSettlementService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contractId}, 0))::text`;
      const service = new FinancialSettlementService(tx as PrismaService, this.accessControl);
      service.transactional = true;
      return action(service);
    }, { timeout: 25000 });
  }

  private async runTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.transactional ? action(this.prisma) : this.prisma.$transaction(action);
  }

  private paymentLockKey(request: { contractId?: string | null; logisticsSettlementId?: string | null }) {
    const key = request.logisticsSettlementId ? `logistics:${request.logisticsSettlementId}` : request.contractId;
    if (!key) throw new BadRequestException('请选择有效的合同或物流结算单');
    return key;
  }

  private fundLockKey(fund: { id: string; contractId?: string | null; paymentRequest?: { logisticsSettlementId?: string | null } | null }) {
    return fund.paymentRequest?.logisticsSettlementId ? `logistics:${fund.paymentRequest.logisticsSettlementId}` : fund.contractId || `fund:${fund.id}`;
  }

  private validatePayment(request: any, userId: string, permission: string, financeSubmit = false) {
    return request.businessType === 'LOGISTICS'
      ? new LogisticsPaymentContext(this.prisma, this.accessControl).validate(request, userId, permission, financeSubmit)
      : new PurchasePaymentContext(this.prisma, this.accessControl).validate(request, userId, permission, financeSubmit);
  }

  async logisticsPaymentOptions(userId: string, excludeRequestId?: string) {
    if (excludeRequestId) await this.findPaymentRequest(excludeRequestId, userId);
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getLogisticsPaymentScope(userId);
    const rows = await this.prisma.logisticsSettlement.findMany({ where: { AND: [scope], status: 'REVIEWED' }, select: { id: true, settlementNo: true }, orderBy: { createdAt: 'desc' } });
    const results = await Promise.all(rows.map(async r => {
      try { return await new LogisticsPaymentContext(this.prisma, this.accessControl).load(r.id, userId, 'settlement.view', excludeRequestId); }
      catch (error) { if (error instanceof BadRequestException) return { id: r.id, settlementNo: r.settlementNo, unavailableReason: error.message }; throw error; }
    }));
    return results;
  }

  async paymentContext(contractId: string, userId: string, excludeRequestId?: string) {
    if (excludeRequestId) {
      const request = await this.findPaymentRequest(excludeRequestId, userId);
      if (request.contractId !== contractId) throw new BadRequestException('付款申请不属于当前合同');
    }
    return new PurchasePaymentContext(this.prisma, this.accessControl).load(contractId, userId, 'settlement.view', excludeRequestId);
  }

  async settlementSources(contractId: string, userId: string) {
    return new PurchaseSettlementBasis(this.prisma, this.accessControl).sources(contractId, userId);
  }

  async paymentPrecheck(id: string, userId: string) {
    const item = await this.findPaymentRequest(id, userId);
    try {
      const result = await this.validatePayment(item, userId, 'settlement.view', true);
      return { valid: true, blockers: [], context: result };
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return { valid: false, blockers: [error.message] };
    }
  }

  async paymentApprovalList(userId: string, status: 'PENDING' | 'DONE' = 'PENDING') {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const scope = await this.accessControl.getPaymentRequestScope(userId, 'settlement.payment.approve');
    const rows = await this.prisma.paymentRequestApproval.findMany({
      where: {
        ...(status === 'PENDING' ? { status: 'PENDING', ...(access.isAdmin ? {} : { assigneeId: userId }) } : { actedById: userId, status: { in: ['APPROVED', 'REJECTED'] } }),
        paymentRequest: { AND: [scope], ...(status === 'PENDING' ? { status: 'PENDING_APPROVAL' } : {}) },
      },
      include: { paymentRequest: { include: { contract: true, businessUnit: true, logisticsSettlement: { select: { settlementNo: true } } } } },
      orderBy: status === 'PENDING' ? { createdAt: 'asc' } : { actedAt: 'desc' }, take: 300,
    });
    const unique = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = status === 'PENDING' ? `${row.paymentRequestId}:${row.round}:${row.step}` : row.id;
      if (!unique.has(key)) unique.set(key, row);
    }
    return { status, total: unique.size, list: [...unique.values()].map(row => ({
      id: row.id, businessType: 'PAYMENT_REQUEST' as const, nodeName: row.nodeName, roleName: row.roleName,
      approvalMode: row.approvalMode, round: row.round, step: row.step, status: row.status, comment: row.comment, actedAt: row.actedAt,
      contract: row.paymentRequest.contract,
      paymentRequest: { id: row.paymentRequestId, requestNo: row.paymentRequest.requestNo, amount: row.paymentRequest.amount,
        paymentBusinessType: row.paymentRequest.businessType, logisticsSettlementNo: row.paymentRequest.logisticsSettlement?.settlementNo,
        stageName: row.paymentRequest.stageName, purpose: row.paymentRequest.purpose, businessUnit: row.paymentRequest.businessUnit },
    })) };
  }

  async paymentApprovalDetail(id: string, userId: string) {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    const pending = item.approvals.filter(a => a.status === 'PENDING');
    const round = Math.max(0, ...pending.map(a => a.round));
    const step = Math.min(...pending.filter(a => a.round === round).map(a => a.step));
    const active = pending.filter(a => a.round === round && a.step === step);
    const context = item.businessType === 'PURCHASE'
      ? await new PurchasePaymentContext(this.prisma, this.accessControl).load(item.contractId!, userId, 'settlement.payment.approve', item.id) : null;
    const logisticsContext = item.businessType === 'LOGISTICS' && item.logisticsSettlementId
      ? await new LogisticsPaymentContext(this.prisma, this.accessControl).load(item.logisticsSettlementId, userId, 'settlement.payment.approve', item.id) : null;
    const attachments = await this.paymentEvidenceAttachments(item);
    let blockers: string[] = [];
    try { await this.validatePayment(item, userId, 'settlement.payment.approve'); }
    catch (e) { if (!(e instanceof BadRequestException)) throw e; blockers = [e.message]; }
    return { paymentRequest: item, context, logisticsContext, blockers, supportingAttachments: attachments.map(({ fileName, ...a }) => a), canAct: item.status === 'PENDING_APPROVAL' && active.length > 0 && (access.isAdmin || active.some(a => a.assigneeId === userId)),
      currentNode: active[0] ? { nodeName: active[0].nodeName, roleName: active[0].roleName, approvalMode: active[0].approvalMode } : null };
  }

  private async paymentEvidenceAttachments(item: PaymentRequestResult) {
    const evidence = item.evidenceSnapshot as any;
    const sources = [...(evidence?.lines || []).map((l: any) => l.source).filter(Boolean), ...(evidence?.selectedSources || [])];
    const qualityIds = sources.map((s: any) => s.reportId).filter((s: unknown): s is string => typeof s === 'string');
    const ticketIds = sources.map((s: any) => s.weighTicketId).filter((s: unknown): s is string => typeof s === 'string');
    return this.prisma.attachment.findMany({ where: { OR: [{ paymentRequestId: item.id }, ...(item.contractId ? [{ contractId: item.contractId }] : []),
      ...(qualityIds.length ? [{ qualityInspectionId: { in: qualityIds } }] : []), ...(ticketIds.length ? [{ weighTicketId: { in: ticketIds } }] : [])] },
      select: { id: true, originalName: true, mimeType: true, fileName: true, category: true } });
  }

  async paymentApprovalAttachment(id: string, attachmentId: string, userId: string) {
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    const attachment = (await this.paymentEvidenceAttachments(item)).find(a => a.id === attachmentId);
    if (!attachment) throw new NotFoundException('附件不属于本付款申请的有效依据或无权访问');
    return attachment;
  }

  async earmarkFund(id: string, dto: CreateFundEarmarkDto, userId: string): Promise<FundEarmark> {
    const fund = await this.findFund(id, userId, 'settlement.allocate');
    if (!fund.contractId || fund.direction !== 'PAYMENT' || !ALLOCATABLE_STAGES.includes(fund.paymentStage)) throw new BadRequestException('只能指定采购合同货款的待核销资金用途');
    if (!this.transactional) return this.withContractLock(fund.contractId, service => service.earmarkFund(id, dto, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${id} FOR UPDATE`;
    const current = await this.prisma.fundTransaction.findUnique({ where: { id }, include: { earmarks: { where: { releasedAt: null } }, paymentRequest: true } });
    if (!current || !['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(current.status)) throw new BadRequestException('请先财务确认付款单，且资金须有未核销余额');
    if (current.paymentRequest?.settlementId) throw new BadRequestException('该付款已按申请指定采购结算，请核销到原结算');
    if (Boolean(dto.orderId) === Boolean(dto.settlementId) || !dto.reason.trim()) throw new BadRequestException('请选择一个目标批次或结算，并填写用途说明');
    if (dto.settlementId) {
      const s = await this.findOne(dto.settlementId, userId, 'settlement.allocate');
      if (s.contractId !== fund.contractId || s.direction !== 'PAYABLE' || !['CONFIRMED', 'PARTIALLY_SETTLED'].includes(s.status)) throw new BadRequestException('目标采购结算无效或不属于本合同');
    }
    if (dto.orderId && !await this.prisma.order.findFirst({ where: { id: dto.orderId, contractId: fund.contractId, type: 'PURCHASE', status: { not: 'CANCELLED' }, deletedAt: null } })) throw new BadRequestException('目标批次无效或不属于本合同');
    const marked = current.earmarks.reduce((sum, m) => sum + Number(m.amount) - Number(m.consumedAmount), 0);
    const available = money(Number(current.amount) - Number(current.allocatedAmount) - Number(current.refundedAmount) - marked);
    if (dto.amount > available) throw new BadRequestException(`超过尚未指定用途的资金余额 ${available.toFixed(2)} 元`);
    return this.prisma.fundEarmark.create({ data: { fundTransactionId: id, settlementId: dto.settlementId, orderId: dto.orderId, amount: dto.amount, reason: dto.reason.trim(), createdBy: userId } });
  }

  async releaseFundEarmark(id: string, earmarkId: string, userId: string): Promise<FundEarmark> {
    const fund = await this.findFund(id, userId, 'settlement.allocate');
    if (!this.transactional) return this.withContractLock(fund.contractId || `fund:${id}`, service => service.releaseFundEarmark(id, earmarkId, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${id} FOR UPDATE`;
    const mark = await this.prisma.fundEarmark.findFirst({ where: { id: earmarkId, fundTransactionId: id, releasedAt: null } });
    if (!mark) throw new NotFoundException('有效资金用途记录不存在');
    return this.prisma.fundEarmark.update({ where: { id: earmarkId }, data: { releasedAt: new Date() } });
  }

  async assertPaymentExecutionPermission(userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.payment.execute');
  }

  private async nextNo(prefix: string, table: 'settlement' | 'fund' | 'paymentRequest') {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    // 不按行数编号：不同合同并发制单以及删除草稿不会重复使用编号。
    return `${prefix}${date}${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private directionForBusinessType(businessType: string) {
    return businessType === 'PURCHASE' ? 'PAYABLE' : 'RECEIVABLE';
  }

  private counterpartyId(contract: { sellerId: string | null; buyerId: string | null; signingPartnerId: string | null }, direction: string) {
    if (!contract.signingPartnerId) return null;
    if (direction === 'PAYABLE') return contract.sellerId && contract.sellerId !== contract.signingPartnerId ? contract.sellerId : contract.buyerId;
    return contract.buyerId && contract.buyerId !== contract.signingPartnerId ? contract.buyerId : contract.sellerId;
  }

  private assertDirection(type: string, direction: string) {
    const valid = direction === 'PAYABLE'
      ? ['PURCHASE', 'BILATERAL'].includes(type)
      : direction === 'RECEIVABLE' && ['SALES', 'BILATERAL'].includes(type);
    if (!valid) throw new BadRequestException('合同类型与采购/销售结算方向不匹配');
  }

  private contractAmount(contract: { type: string; totalAmount: Prisma.Decimal; lineItems: Array<{ totalPrice: Prisma.Decimal; salesTotalPrice: Prisma.Decimal | null }> }, direction: string) {
    return money(contract.type === 'BILATERAL'
      ? contract.lineItems.reduce((sum, line) => sum + Number(direction === 'RECEIVABLE' ? line.salesTotalPrice || 0 : line.totalPrice), 0)
      : Number(contract.totalAmount));
  }

  private async accessibleContract(contractId: string, direction: string, userId: string, permission = 'settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getContractScope(userId, permission);
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null, AND: [scope] },
      include: {
        seller: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        buyer: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        signingPartner: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        businessUnit: { select: { id: true, code: true, name: true } },
        lineItems: { select: { quantity: true, unit: true, totalPrice: true, salesTotalPrice: true } },
      },
    });
    if (!contract) throw new NotFoundException('合同不存在或不在当前数据权限范围内');
    this.assertDirection(contract.type, direction);
    if (!['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED'].includes(contract.status)) throw new BadRequestException('合同尚未审批生效或已作废，不能办理资金结算');
    return contract;
  }

  async contractOptions(direction: string, userId: string) {
    if (!['RECEIVABLE', 'PAYABLE'].includes(direction)) throw new BadRequestException('结算方向无效');
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const types = direction === 'PAYABLE' ? ['PURCHASE', 'BILATERAL'] : ['SALES', 'BILATERAL'];
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null, type: { in: types }, status: { in: ['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED'] }, AND: [scope] },
      include: {
        seller: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        buyer: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        signingPartner: { select: { id: true, code: true, name: true, bankAccounts: { where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }], select: BANK_ACCOUNT_SELECT } } },
        businessUnit: { select: { id: true, code: true, name: true } },
        lineItems: { select: { quantity: true, unit: true, totalPrice: true, salesTotalPrice: true } },
        financialSettlements: { where: { direction, status: { not: 'VOIDED' }, deletedAt: null }, select: { totalAmount: true } },
        fundTransactions: {
          where: { businessType: direction === 'PAYABLE' ? 'PURCHASE' : 'SALES', status: { not: 'VOIDED' } },
          select: { paymentStage: true, direction: true, amount: true, allocatedAmount: true, refundedAmount: true },
        },
        paymentRequests: {
          where: { status: { in: ACTIVE_PAYMENT_REQUEST_STATUSES }, businessType: direction === 'PAYABLE' ? 'PURCHASE' : 'SALES', paymentStage: { in: ALLOCATABLE_STAGES } },
          select: { amount: true, status: true, fundTransactions: { select: { amount: true, status: true } } },
        },
      },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
    return contracts.map((contract) => {
      const counterpartId = this.counterpartyId(contract, direction);
      const counterparty = counterpartId === contract.sellerId ? contract.seller : contract.buyer;
      const amount = this.contractAmount(contract, direction);
      const settledTotal = money(contract.financialSettlements.reduce((sum, item) => sum + Number(item.totalAmount), 0));
      const units = [...new Set(contract.lineItems.map((line) => line.unit))];
      const advances = contract.fundTransactions
        .filter((item) => item.paymentStage === 'ADVANCE' && item.direction === (direction === 'PAYABLE' ? 'PAYMENT' : 'RECEIPT'))
        .reduce((sum, item) => sum + Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount), 0);
      const paid = contract.fundTransactions.filter(f => f.direction === (direction === 'PAYABLE' ? 'PAYMENT' : 'RECEIPT') && ALLOCATABLE_STAGES.includes(f.paymentStage))
        .reduce((sum, f) => sum + Number(f.amount) - Number(f.refundedAmount), 0);
      const plannedPaymentAmount = money(paid + contract.paymentRequests.reduce((sum, item) => sum + requestCommitment(item), 0));
      return {
        id: contract.id, contractNo: contract.contractNo, title: contract.title, type: contract.type,
        amount, settledTotal, remainingSettleable: money(Math.max(0, amount - settledTotal)), advanceBalance: money(advances),
        quantity: contract.lineItems.reduce((sum, line) => sum + Number(line.quantity), 0),
        unit: units.length === 1 ? units[0] : undefined,
        plannedPaymentAmount,
        remainingPaymentAmount: money(Math.max(0, amount - plannedPaymentAmount)),
        signingPartner: contract.signingPartner, counterparty, businessUnit: contract.businessUnit,
      };
    }).filter((item) => item.signingPartner && item.counterparty && item.businessUnit);
  }

  async orderOptions(contractId: string, direction: string, userId: string) {
    const contract = await this.accessibleContract(contractId, direction, userId);
    const type = direction === 'PAYABLE' ? 'PURCHASE' : 'SALES';
    const orders = await this.prisma.order.findMany({
      where: { contractId: contract.id, type, status: { in: SETTLEABLE_ORDER_STATUSES }, deletedAt: null },
      include: {
        lineItems: { select: { quantity: true, unit: true, unitPrice: true, totalPrice: true } },
        settlementLines: { where: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } }, select: { quantity: true, totalAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => {
      const totalQuantity = quantity(order.lineItems.reduce((sum, line) => sum + Number(line.quantity), 0));
      const units = [...new Set(order.lineItems.map((line) => line.unit))];
      const settledQuantity = quantity(order.settlementLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0));
      const settledAmount = money(order.settlementLines.reduce((sum, line) => sum + Number(line.totalAmount), 0));
      return {
        id: order.id, orderNo: order.orderNo, name: order.name, status: order.status,
        quantity: totalQuantity, settledQuantity, remainingQuantity: quantity(Math.max(0, totalQuantity - settledQuantity)),
        unit: units.length === 1 ? units[0] : undefined,
        amount: money(Number(order.totalAmount)), settledAmount,
        remainingAmount: money(Math.max(0, Number(order.totalAmount) - settledAmount)),
      };
    }).filter((order) => order.remainingAmount > 0 || order.remainingQuantity > 0);
  }

  async receiptRegistrationOptions(userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.receipt.register');
    return this.prisma.partner.findMany({
      where: { isInternal: true, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true, code: true, name: true,
        bankAccounts: {
          where: { status: 'ACTIVE' }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, accountName: true, accountNo: true, bankName: true, bankCode: true, currency: true, isDefault: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAll(query: { direction?: string; status?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const where: Prisma.FinancialSettlementWhereInput = {
      deletedAt: null, contract: contractScope,
      ...(query.direction ? { direction: query.direction } : {}), ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { settlementNo: { contains: query.search, mode: 'insensitive' } },
        { contract: { contractNo: { contains: query.search, mode: 'insensitive' } } },
        { contract: { title: { contains: query.search, mode: 'insensitive' } } },
        { counterparty: { name: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const items = await this.prisma.financialSettlement.findMany({ where, include: SETTLEMENT_INCLUDE, orderBy: { createdAt: 'desc' } });
    // 草稿尚未正式形成应收/应付，不进入正式余额与逾期统计。
    const today = businessDate(new Date());
    const summary = items.filter((item) => ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status)).reduce((result, item) => {
      result.total += Number(item.totalAmount); result.settled += Number(item.settledAmount);
      result.outstanding += Number(item.totalAmount) - Number(item.settledAmount);
      // 到期日当天仍属于履约期限，次日才进入逾期。
      if (item.dueDate && businessDate(item.dueDate) < today && item.status !== 'SETTLED') result.overdue += Number(item.totalAmount) - Number(item.settledAmount);
      return result;
    }, { total: 0, settled: 0, outstanding: 0, overdue: 0 });
    return { items, summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, money(value)])) };
  }

  async findOne(id: string, userId: string, permission = 'settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const contractScope = await this.accessControl.getContractScope(userId, permission);
    const item = await this.prisma.financialSettlement.findFirst({ where: { id, deletedAt: null, contract: contractScope }, include: SETTLEMENT_DETAIL_INCLUDE });
    if (!item) throw new NotFoundException('结算单不存在或无权访问');
    return item;
  }

  async create(dto: CreateFinancialSettlementDto, userId: string): Promise<SettlementResult> {
    if (!this.transactional) return this.withContractLock(dto.contractId, service => service.create(dto, userId));
    const contract = await this.accessibleContract(dto.contractId, dto.direction, userId, 'settlement.create');
    if (!contract.signingPartnerId || !contract.businessUnitId) throw new BadRequestException('合同缺少我方签约主体或业务单元，不能生成结算单');
    const counterpartyId = this.counterpartyId(contract, dto.direction);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方，不能生成结算单');
    if (dto.direction === 'PAYABLE' && ['GOODS', 'CONTRACT_FINAL'].includes(dto.settlementScope)) {
      return this.createGoodsSettlement(dto, contract, counterpartyId, userId);
    }
    if (dto.direction === 'PAYABLE' && dto.settlementScope === 'CONTRACT_STAGE') throw new BadRequestException('预付或阶段备款请直接创建付款申请；货物应付请按实际货物编制，避免重复结算');
    if (dto.direction === 'PAYABLE' && dto.settlementScope === 'BATCH') {
      throw new BadRequestException('最终采购货款请按已入库过账的实际货物编制采购结算单；按批次提前付款请创建预付款或阶段款申请');
    }
    const contractTotal = this.contractAmount(contract, dto.direction);
    const existing = await this.prisma.financialSettlement.aggregate({
      where: { contractId: contract.id, direction: dto.direction, status: { not: 'VOIDED' }, deletedAt: null }, _sum: { totalAmount: true },
    });
    const remainingContract = money(contractTotal - Number(existing._sum.totalAmount || 0));
    if (remainingContract <= 0 && dto.settlementScope !== 'ADJUSTMENT') throw new BadRequestException('该合同已无剩余可结算金额');

    let grossAmount = dto.settlementScope === 'BATCH' ? 0 : money(dto.grossAmount || 0);
    let totalQuantity = 0;
    let unit: string | undefined;
    const selectedUnits = new Set<string>();
    let sourceNo = dto.sourceNo?.trim() || contract.contractNo;
    const lineCreates: Prisma.FinancialSettlementLineCreateWithoutSettlementInput[] = [];

    if (dto.settlementScope === 'BATCH') {
      if (!dto.lines?.length) throw new BadRequestException('按执行批次结算时至少选择一个可结算批次');
      const ids = [...new Set(dto.lines.map((line) => line.orderId))];
      if (ids.length !== dto.lines.length) throw new BadRequestException('同一个执行批次不能重复选择');
      const orders = await this.prisma.order.findMany({
        where: {
          id: { in: ids }, contractId: contract.id,
          type: dto.direction === 'PAYABLE' ? 'PURCHASE' : 'SALES',
          status: { in: SETTLEABLE_ORDER_STATUSES }, deletedAt: null,
        },
        include: {
          lineItems: true,
          settlementLines: { where: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } }, select: { quantity: true, totalAmount: true } },
        },
      });
      if (orders.length !== ids.length) throw new BadRequestException('存在不属于本合同、已取消或不可结算的执行批次');
      for (const input of dto.lines) {
        const order = orders.find((item) => item.id === input.orderId)!;
        const totalOrderQty = quantity(order.lineItems.reduce((sum, item) => sum + Number(item.quantity), 0));
        const usedQty = quantity(order.settlementLines.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
        const usedAmount = money(order.settlementLines.reduce((sum, item) => sum + Number(item.totalAmount), 0));
        const remainingQty = quantity(totalOrderQty - usedQty);
        const remainingAmount = money(Number(order.totalAmount) - usedAmount);
        const lineQty = quantity(input.quantity ?? remainingQty);
        if (lineQty <= 0 || lineQty > remainingQty) throw new BadRequestException(`执行批次 ${order.orderNo} 的结算数量超过剩余数量`);
        const defaultPrice = totalOrderQty > 0 ? Number(order.totalAmount) / totalOrderQty : 0;
        const price = input.unitPrice ?? defaultPrice;
        const lineGross = money(lineQty * price);
        const lineTotal = money(lineGross + (input.adjustmentAmount || 0));
        if (Number(input.adjustmentAmount || 0) !== 0 && !input.remarks?.trim()) {
          throw new BadRequestException(`执行批次 ${order.orderNo} 存在结算加减项，请填写调整原因`);
        }
        if (lineTotal <= 0 || lineTotal > remainingAmount) throw new BadRequestException(`执行批次 ${order.orderNo} 的结算金额超过剩余金额`);
        const units = [...new Set(order.lineItems.map((item) => item.unit))];
        const lineUnit = units.length === 1 ? units[0] : undefined;
        lineCreates.push({
          order: { connect: { id: order.id } }, orderNo: order.orderNo, orderName: order.name,
          quantity: lineQty, unit: lineUnit, unitPrice: price, grossAmount: lineGross,
          adjustmentAmount: input.adjustmentAmount || 0, totalAmount: lineTotal, remarks: input.remarks?.trim(),
        });
        grossAmount = money(grossAmount + lineGross); totalQuantity = quantity(totalQuantity + lineQty);
        if (lineUnit) selectedUnits.add(lineUnit);
      }
      unit = selectedUnits.size === 1 ? [...selectedUnits][0] : undefined;
      sourceNo = lineCreates.map((line) => line.orderNo).filter(Boolean).join('、');
    } else if (dto.settlementScope === 'CONTRACT_STAGE') {
      if (!dto.stageName?.trim()) throw new BadRequestException('合同阶段结算必须填写阶段名称');
      if (dto.stageRatio) grossAmount = money(contractTotal * dto.stageRatio / 100);
      if (grossAmount <= 0) throw new BadRequestException('请填写阶段结算金额或比例');
    } else if (dto.settlementScope === 'CONTRACT_FINAL') {
      grossAmount = remainingContract;
      if (grossAmount <= 0) throw new BadRequestException('合同已无可结算尾款');
    } else {
      if (!dto.remarks?.trim()) throw new BadRequestException('手工调整必须填写调整原因');
      if (grossAmount <= 0) throw new BadRequestException('手工调整金额必须大于 0');
    }

    const lineAdjustment = lineCreates.reduce((sum, line) => sum + Number(line.adjustmentAmount || 0), 0);
    const headerAdjustment = dto.settlementScope === 'BATCH' ? 0 : (dto.adjustmentAmount || 0);
    if (headerAdjustment !== 0 && !dto.remarks?.trim()) {
      throw new BadRequestException('存在结算加减项时必须填写调整原因');
    }
    const totalAmount = money(grossAmount + lineAdjustment + headerAdjustment);
    if (totalAmount <= 0) throw new BadRequestException('结算金额必须大于 0');
    if (dto.settlementScope !== 'ADJUSTMENT' && totalAmount > remainingContract) throw new BadRequestException('结算金额超过合同剩余可结算金额');
    const settlementNo = await this.nextNo(dto.direction === 'RECEIVABLE' ? 'YS' : 'YF', 'settlement');
    return this.prisma.financialSettlement.create({
      data: {
        settlementNo, direction: dto.direction, sourceType: dto.sourceType || (dto.settlementScope === 'ADJUSTMENT' ? 'MANUAL' : 'CONTRACT'),
        sourceNo, settlementScope: dto.settlementScope, stageName: dto.stageName?.trim(), stageRatio: dto.stageRatio,
        contractId: contract.id, businessUnitId: contract.businessUnitId, legalEntityPartnerId: contract.signingPartnerId,
        counterpartyId, quantity: totalQuantity || undefined, unit, grossAmount,
        adjustmentAmount: money(lineAdjustment + headerAdjustment), totalAmount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null, remarks: dto.remarks?.trim(), createdBy: userId,
        ...(lineCreates.length ? { lines: { create: lineCreates } } : {}),
      },
      include: SETTLEMENT_INCLUDE,
    });
  }

  private async createGoodsSettlement(dto: CreateFinancialSettlementDto, contract: any, counterpartyId: string, userId: string, preview = false): Promise<any> {
    if (!dto.lines?.length || dto.lines.some(l => !l.waybillLineItemId)) throw new BadRequestException('请勾选本次结算的具体运单货物');
    const ids = dto.lines.map(l => l.waybillLineItemId!);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('同一货物来源不能重复选择');
    const sources = await new PurchaseSettlementBasis(this.prisma, this.accessControl).sources(contract.id, userId, 'settlement.create');
    const lines = dto.lines.map(input => {
      const source = sources.find(s => s.id === input.waybillLineItemId && s.orderId === input.orderId);
      if (!source || !source.available) throw new BadRequestException(`${source?.waybillNo || '货物'}不可结算：${source?.reasons.join('；') || '来源不存在或不属于该批次'}`);
      const qty = input.quantity ?? source.remainingQuantity;
      if (qty <= 0 || qty > source.remainingQuantity) throw new BadRequestException(`${source.waybillNo}本次结算数量超过剩余可结算数量`);
      if (input.unitPrice != null && new Prisma.Decimal(input.unitPrice).comparedTo(source.unitPrice) !== 0) throw new BadRequestException('实际货物结算单价取自合同，价格变化请先确认合同变更或使用有说明的结算调整');
      if (Number(input.adjustmentAmount || 0) !== 0 && !input.remarks?.trim()) throw new BadRequestException('其他结算调整须填写原因，不得重复录入系统已计算的质量扣款');
      const amounts = goodsAmounts(qty, source.unitPrice, source.deductionPerTon, input.adjustmentAmount || 0);
      if (amounts.totalAmount <= 0) throw new BadRequestException('扣款后货物结算金额须大于零，超额扣款请先复核合同规则和处置');
      return { orderId: source.orderId, orderNo: source.orderNo, orderName: source.orderName,
        waybillLineItemId: source.id, weightSelectionId: source.weightSelectionId, qualityTaskId: source.qualityTaskId,
        sourceSnapshot: snapshotJson({ ...source, settlementQuantity: amounts.quantity, ...amounts }), unit: source.unit, unitPrice: source.unitPrice, ...amounts, remarks: input.remarks?.trim() };
    });
    const contractItems = await this.prisma.contractLineItem.findMany({ where: { contractId: contract.id } });
    const existingLines = await this.prisma.financialSettlementLine.findMany({ where: { settlement: { contractId: contract.id, direction: 'PAYABLE', deletedAt: null, status: { not: 'VOIDED' } } } });
    for (const item of contractItems) {
      const current = lines.filter(line => (line.sourceSnapshot as any).contractLineItemId === item.id).reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0));
      const previous = existingLines.filter(line => (line.sourceSnapshot as any)?.contractLineItemId === item.id).reduce((sum, line) => sum.plus(line.quantity || 0), new Prisma.Decimal(0));
      const limit = new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(contract.overfillPct || 0).div(100)));
      if (current.plus(previous).greaterThan(limit)) throw new BadRequestException(`物料“${item.materialName || item.materialId}”累计结算数量超过合同及溢装约定，请先处理合同变更`);
    }
    const total = (key: 'grossAmount' | 'qualityDeductionAmount' | 'adjustmentAmount' | 'totalAmount' | 'quantity') => new Prisma.Decimal(lines.reduce((sum, l) => sum.plus(l[key]), new Prisma.Decimal(0))).toDecimalPlaces(key === 'quantity' ? 3 : 2).toNumber();
    const data = { direction: 'PAYABLE', sourceType: 'CONTRACT', contractId: contract.id, businessUnitId: contract.businessUnitId,
      legalEntityPartnerId: contract.signingPartnerId, counterpartyId, settlementScope: dto.settlementScope,
      sourceNo: [...new Set(lines.map(l => l.orderNo))].join('、'), quantity: total('quantity'), unit: 'TON',
      grossAmount: total('grossAmount'), qualityDeductionAmount: total('qualityDeductionAmount'), adjustmentAmount: total('adjustmentAmount'), totalAmount: total('totalAmount'),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null, remarks: dto.remarks?.trim(), createdBy: userId };
    if (preview) return { ...data, lines };
    return this.prisma.financialSettlement.create({ data: { ...data, settlementNo: await this.nextNo('YF', 'settlement'), lines: { create: lines } }, include: SETTLEMENT_INCLUDE });
  }

  async previewGoodsSettlement(dto: CreateFinancialSettlementDto, userId: string) {
    const contract = await this.accessibleContract(dto.contractId, 'PAYABLE', userId, 'settlement.create');
    return this.createGoodsSettlement(dto, contract, this.counterpartyId(contract, 'PAYABLE')!, userId, true);
  }

  async confirm(id: string, userId: string): Promise<SettlementResult> {
    const item = await this.findOne(id, userId, 'settlement.confirm');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.confirm(id, userId));
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的结算单可以确认');
    if (item.direction === 'PAYABLE') await new PurchaseSettlementBasis(this.prisma, this.accessControl).assertCurrent(id, userId, 'settlement.confirm');
    return this.prisma.financialSettlement.update({ where: { id }, data: { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() }, include: SETTLEMENT_INCLUDE });
  }

  async recordPrint(id: string, userId: string) {
    const item = await this.findOne(id, userId);
    if (item.status === 'DRAFT') throw new BadRequestException('结算单尚未确认，不能作为正式单据打印存档');
    if (item.status === 'VOIDED') throw new BadRequestException('已作废结算单不能打印存档');
    return item;
  }

  async voidSettlement(id: string, userId: string): Promise<SettlementResult> {
    const item = await this.findOne(id, userId, 'settlement.reverse');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.voidSettlement(id, userId));
    if (item.status === 'VOIDED') throw new BadRequestException('结算单已作废');
    if (Number(item.settledAmount) > 0 || item.allocations.some((entry) => !entry.reversedAt)) throw new BadRequestException('已有有效核销记录，必须先撤销核销后才能作废');
    const linked = await this.prisma.paymentRequest.count({ where: { settlementId: id, status: { in: ACTIVE_PAYMENT_REQUEST_STATUSES } } });
    if (linked) throw new BadRequestException('结算单有关联有效付款申请，请先处理付款申请及付款记录');
    await this.prisma.fundEarmark.updateMany({ where: { settlementId: id, releasedAt: null }, data: { releasedAt: new Date() } });
    return this.prisma.financialSettlement.update({ where: { id }, data: { status: 'VOIDED' }, include: SETTLEMENT_INCLUDE });
  }

  async listFunds(query: { businessType?: string; direction?: string; contractId?: string }, userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const canSeeUnclaimed = context.isAdmin || context.permissions.some((code) => [
      'settlement.receipt.register', 'settlement.receipt.claim', 'settlement.fund.confirm',
    ].includes(code));
    // FundTransaction.contract is nullable. Prisma treats an empty nested relation
    // filter (`contract: {}`) differently from an unrestricted top-level filter.
    // Administrators receive an empty contract scope, so embedding it here used to
    // hide every directly-linked payment order. Keep unrestricted access at the
    // FundTransaction level, and only build relation filters for scoped users.
    const accessScope: Prisma.FundTransactionWhereInput = context.isAdmin ? {} : {
      OR: [
        { businessType: 'LOGISTICS', paymentRequest: { is: await this.accessControl.getPaymentRequestScope(userId, 'settlement.view') } },
        { contract: { is: contractScope } },
        { claims: { some: { contract: contractScope, status: { not: 'REVERSED' } } } },
        ...(canSeeUnclaimed ? [{ direction: 'RECEIPT', contractId: null }] : []),
      ],
    };
    return this.prisma.fundTransaction.findMany({
      where: {
        AND: [accessScope],
        ...(query.businessType ? { businessType: query.businessType } : {}),
        ...(query.direction ? { direction: query.direction } : {}),
        ...(query.contractId ? { OR: [{ contractId: query.contractId }, { claims: { some: { contractId: query.contractId, status: { not: 'REVERSED' } } } }] } : {}),
      },
      include: FUND_INCLUDE, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findFund(id: string, userId: string, permission = 'settlement.view') {
    const context = await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getContractScope(userId, permission);
    const canSeeUnclaimed = context.isAdmin || context.permissions.some((code) => [
      'settlement.receipt.register', 'settlement.receipt.claim', 'settlement.fund.confirm',
    ].includes(code));
    const item = await this.prisma.fundTransaction.findFirst({
      where: context.isAdmin ? { id } : {
        id,
        OR: [
          { businessType: 'LOGISTICS', paymentRequest: { is: await this.accessControl.getPaymentRequestScope(userId, permission) } },
          { contract: { is: scope } },
          { claims: { some: { contract: scope, status: { not: 'REVERSED' } } } },
          ...(canSeeUnclaimed ? [{ direction: 'RECEIPT', contractId: null }] : []),
        ],
      },
      include: FUND_INCLUDE,
    });
    if (!item) throw new NotFoundException('资金单不存在或无权访问');
    return item;
  }

  async settlementLedger(userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        type: { in: ['PURCHASE', 'SALES', 'BILATERAL'] },
        status: { in: ['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED'] },
        AND: [contractScope],
      },
      include: {
        seller: { select: { id: true, code: true, name: true } },
        buyer: { select: { id: true, code: true, name: true } },
        signingPartner: { select: { id: true, code: true, name: true } },
        businessUnit: { select: { id: true, code: true, name: true } },
        lineItems: { select: { totalPrice: true, salesTotalPrice: true } },
        financialSettlements: {
          where: { deletedAt: null, status: { not: 'VOIDED' } },
          select: {
            direction: true, status: true, grossAmount: true, adjustmentAmount: true,
            totalAmount: true, settledAmount: true, dueDate: true, confirmedAt: true, createdAt: true,
          },
        },
        fundTransactions: {
          where: { status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'] } },
          select: {
            direction: true, businessType: true, paymentStage: true, amount: true,
            allocatedAmount: true, refundedAmount: true, occurredAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const today = businessDate(new Date());
    const rows: Array<Record<string, unknown>> = [];
    for (const contract of contracts) {
      const directions = contract.type === 'BILATERAL'
        ? ['PAYABLE', 'RECEIVABLE']
        : [contract.type === 'PURCHASE' ? 'PAYABLE' : 'RECEIVABLE'];
      for (const direction of directions) {
        const counterpartyId = this.counterpartyId(contract, direction);
        const counterparty = counterpartyId === contract.sellerId ? contract.seller : contract.buyer;
        if (!contract.signingPartner || !counterparty) continue;
        const settlements = contract.financialSettlements.filter((item) => item.direction === direction);
        const formal = settlements.filter((item) => ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status));
        const drafts = settlements.filter((item) => item.status === 'DRAFT');
        const settlementAmount = money(formal.reduce((sum, item) => sum + Number(item.totalAmount), 0));
        const allocatedAmount = money(formal.reduce((sum, item) => sum + Number(item.settledAmount), 0));
        const outstandingAmount = money(Math.max(0, settlementAmount - allocatedAmount));
        const adjustmentAmount = money(formal.reduce((sum, item) => sum + Number(item.adjustmentAmount), 0));
        const overdueAmount = money(formal.reduce((sum, item) => (
          item.status !== 'SETTLED' && item.dueDate && businessDate(item.dueDate) < today
            ? sum + Number(item.totalAmount) - Number(item.settledAmount)
            : sum
        ), 0));
        const businessType = direction === 'PAYABLE' ? 'PURCHASE' : 'SALES';
        const cashDirection = direction === 'PAYABLE' ? 'PAYMENT' : 'RECEIPT';
        const allocatableFunds = contract.fundTransactions.filter((item) => (
          item.businessType === businessType && item.direction === cashDirection && ALLOCATABLE_STAGES.includes(item.paymentStage)
        ));
        const fundAmount = money(allocatableFunds.reduce((sum, item) => sum + Number(item.amount), 0));
        const unappliedFundAmount = money(allocatableFunds.reduce((sum, item) => (
          sum + Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount))
        ), 0));
        const advanceBalance = money(allocatableFunds.filter((item) => item.paymentStage === 'ADVANCE').reduce((sum, item) => (
          sum + Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount))
        ), 0));
        const latestSettlementAt = formal.reduce<Date | null>((latest, item) => {
          const value = item.confirmedAt || item.createdAt;
          return !latest || value > latest ? value : latest;
        }, null);
        rows.push({
          id: `${contract.id}:${direction}`, contractId: contract.id, contractNo: contract.contractNo,
          contractTitle: contract.title, contractType: contract.type, direction,
          legalEntity: contract.signingPartner, counterparty, businessUnit: contract.businessUnit,
          contractAmount: this.contractAmount(contract, direction),
          draftAmount: money(drafts.reduce((sum, item) => sum + Number(item.totalAmount), 0)),
          settlementAmount, adjustmentAmount, fundAmount, allocatedAmount, unappliedFundAmount,
          advanceBalance, outstandingAmount, overdueAmount, latestSettlementAt,
          status: settlementAmount <= 0 ? 'UNSETTLED'
            : outstandingAmount <= 0 ? 'SETTLED'
              : allocatedAmount > 0 ? 'PARTIALLY_SETTLED' : 'PENDING_PAYMENT',
        });
      }
    }
    return rows;
  }

  async listPaymentRequests(query: { status?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getPaymentRequestScope(userId, 'settlement.view');
    return this.prisma.paymentRequest.findMany({
      where: {
        AND: [scope],
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { OR: [
          { requestNo: { contains: query.search, mode: 'insensitive' } },
          { logisticsSettlement: { settlementNo: { contains: query.search, mode: 'insensitive' } } },
          { contract: { contractNo: { contains: query.search, mode: 'insensitive' } } },
          { contract: { title: { contains: query.search, mode: 'insensitive' } } },
          { counterparty: { name: { contains: query.search, mode: 'insensitive' } } },
        ] } : {}),
      },
      include: PAYMENT_REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDocumentAttachment(
    target: { fundTransactionId?: string; paymentRequestId?: string },
    data: { fileName: string; originalName: string; mimeType: string; size: number; category: string },
    userId: string,
  ): Promise<Attachment> {
    if (target.fundTransactionId) {
      const fund = await this.prisma.fundTransaction.findUnique({ where: { id: target.fundTransactionId }, select: { direction: true } });
      if (!fund) throw new NotFoundException('资金单不存在');
      const permission = fund.direction === 'RECEIPT' ? 'settlement.receipt.register' : 'settlement.payment.execute';
      await this.accessControl.assertPermission(userId, permission);
      const authorized = await this.findFund(target.fundTransactionId, userId, permission);
      if (!this.transactional) return this.withContractLock(this.fundLockKey(authorized), service => service.createDocumentAttachment(target, data, userId));
    } else if (target.paymentRequestId) {
      const request = await this.findPaymentRequest(target.paymentRequestId, userId);
      const permission = request.status === 'BUSINESS_CONFIRMED' ? 'settlement.payment.submit' : 'settlement.payment.apply';
      await this.accessControl.assertPermission(userId, permission);
      await this.findPaymentRequest(target.paymentRequestId, userId, permission);
      if (!this.transactional) return this.withContractLock(this.paymentLockKey(request), service => service.createDocumentAttachment(target, data, userId));
      if (!['DRAFT', 'REJECTED', 'BUSINESS_CONFIRMED'].includes(request.status)) throw new BadRequestException('已进入审批或付款阶段，不能继续上传申请附件');
    } else {
      throw new BadRequestException('附件缺少关联单据');
    }
    return this.prisma.attachment.create({ data: { ...target, ...data, uploadedBy: userId, sourceType: 'WEB_UPLOAD' } });
  }

  async findDocumentAttachment(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('附件不存在或无权访问');
    if (attachment.fundTransactionId) await this.findFund(attachment.fundTransactionId, userId);
    if (attachment.paymentRequestId) await this.findPaymentRequest(attachment.paymentRequestId, userId);
    if (!attachment.fundTransactionId && !attachment.paymentRequestId) throw new NotFoundException('附件不存在或无权访问');
    return attachment;
  }

  async deleteDocumentAttachment(id: string, userId: string): Promise<Attachment> {
    const attachment = await this.findDocumentAttachment(id, userId);
    if (attachment.fundTransactionId) {
      const fund = await this.prisma.fundTransaction.findUnique({ where: { id: attachment.fundTransactionId }, select: { direction: true, status: true } });
      if (!fund || !['PENDING_CLAIM', 'PARTIALLY_CLAIMED', 'PENDING_CONFIRMATION'].includes(fund.status)) throw new BadRequestException('已确认资金单的附件不能删除');
      const authorized = await this.findFund(attachment.fundTransactionId, userId, fund.direction === 'RECEIPT' ? 'settlement.receipt.register' : 'settlement.payment.execute');
      if (!this.transactional) return this.withContractLock(this.fundLockKey(authorized), service => service.deleteDocumentAttachment(id, userId));
    } else if (attachment.paymentRequestId) {
      const request = await this.findPaymentRequest(attachment.paymentRequestId, userId);
      const permission = request.status === 'BUSINESS_CONFIRMED' ? 'settlement.payment.submit' : 'settlement.payment.apply';
      await this.accessControl.assertPermission(userId, permission);
      await this.findPaymentRequest(attachment.paymentRequestId, userId, permission);
      if (!this.transactional) return this.withContractLock(this.paymentLockKey(request), service => service.deleteDocumentAttachment(id, userId));
      if (!['DRAFT', 'REJECTED', 'BUSINESS_CONFIRMED'].includes(request.status)) throw new BadRequestException('已提交审批的付款申请附件不能删除');
    }
    await this.prisma.attachment.delete({ where: { id } });
    return attachment;
  }

  async findPaymentRequest(id: string, userId: string, permission = 'settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getPaymentRequestScope(userId, permission);
    const item = await this.prisma.paymentRequest.findFirst({ where: { id, AND: [scope] }, include: PAYMENT_REQUEST_INCLUDE });
    if (!item) throw new NotFoundException('付款申请不存在或无权访问');
    return item;
  }

  async recordPaymentRequestPrint(id: string, userId: string) {
    const item = await this.findPaymentRequest(id, userId);
    if (!['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(item.status)) {
      throw new BadRequestException('付款申请审批完成后才能打印存档');
    }
    return item;
  }

  private async saveLogisticsPayment(dto: CreatePaymentRequestDto, userId: string, id?: string): Promise<PaymentRequestResult> {
    if (!dto.logisticsSettlementId || dto.contractId || dto.settlementId || dto.orderId || dto.relatedTransactionId || dto.sourceLineIds?.length) throw new BadRequestException('物流付款只能选择物流结算单，不可关联货款合同、批次或原收款单');
    if (dto.basisType !== 'LOGISTICS_SETTLEMENT' || !['SETTLEMENT', 'FINAL'].includes(dto.paymentStage)) throw new BadRequestException('物流付款依据请选择物流结算单，款项类型请选择结算款或尾款');
    const context = await new LogisticsPaymentContext(this.prisma, this.accessControl).load(dto.logisticsSettlementId, userId, 'settlement.payment.apply', id);
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const data = {
      businessType: 'LOGISTICS', basisType: 'LOGISTICS_SETTLEMENT', logisticsSettlementId: context.id,
      contractId: null, orderId: null, settlementId: null, relatedTransactionId: null,
      businessUnitId: context.businessUnit.id, legalEntityPartnerId: context.legalEntity.id, counterpartyId: context.counterparty.id,
      paymentStage: dto.paymentStage, paymentMethod: dto.paymentMethod, amount: dto.amount,
      stageName: dto.stageName?.trim() || null, purpose: dto.purpose?.trim() || null, conditionText: dto.conditionText?.trim() || null,
      conditionTypes: dto.conditionTypes || [], sourceLineIds: [], evidenceSnapshot: Prisma.DbNull,
      requestedPayDate: dto.requestedPayDate ? new Date(dto.requestedPayDate) : null,
      ourBankAccount: dto.ourBankAccount?.trim() || null, ourBankAccountName: dto.ourBankAccountName?.trim() || null,
      ourBankName: dto.ourBankName?.trim() || null, ourBankCode: dto.ourBankCode?.trim() || null,
      counterpartyBankAccount: dto.counterpartyBankAccount?.trim() || null, counterpartyBankAccountName: dto.counterpartyBankAccountName?.trim() || null,
      counterpartyBankName: dto.counterpartyBankName?.trim() || null, counterpartyBankCode: dto.counterpartyBankCode?.trim() || null,
      actualPayeeName: dto.actualPayeeName?.trim() || context.counterparty.name, isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim() || null,
      remarks: dto.remarks?.trim() || null, status: 'DRAFT',
      businessConfirmedBy: null, businessConfirmedAt: null, submittedBy: null, submittedAt: null,
      approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null,
    };
    if (id) {
      await this.prisma.paymentRequestApproval.updateMany({ where: { paymentRequestId: id, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' } });
      return this.prisma.paymentRequest.update({ where: { id }, data, include: PAYMENT_REQUEST_INCLUDE });
    }
    return this.prisma.paymentRequest.create({ data: { ...data, requestNo: await this.nextNo('FKSQ', 'paymentRequest'), createdBy: userId, clientRequestId: dto.clientRequestId }, include: PAYMENT_REQUEST_INCLUDE });
  }

  async createPaymentRequest(dto: CreatePaymentRequestDto, userId: string): Promise<PaymentRequestResult> {
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(dto), service => service.createPaymentRequest(dto, userId));
    if (dto.clientRequestId) {
      const existing = await this.prisma.paymentRequest.findFirst({ where: { createdBy: userId, clientRequestId: dto.clientRequestId } });
      if (existing) return this.findPaymentRequest(existing.id, userId, 'settlement.payment.apply');
    }
    if (dto.businessType === 'LOGISTICS') return this.saveLogisticsPayment(dto, userId);
    if (!dto.contractId || dto.logisticsSettlementId || dto.basisType === 'LOGISTICS_SETTLEMENT') throw new BadRequestException('采购付款或客户退款请选择合同，不可混用物流结算依据');
    const reverse = REVERSE_STAGES.includes(dto.paymentStage);
    if (dto.businessType === 'PURCHASE' && reverse) throw new BadRequestException('供应商退款属于收款，应在收款管理中登记');
    if (dto.businessType === 'SALES' && !reverse) throw new BadRequestException('销售正常货款属于收款；只有客户退款或保证金退回需要付款申请');
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const settlementDirection = this.directionForBusinessType(dto.businessType);
    const contract = await this.accessibleContract(dto.contractId, settlementDirection, userId, 'settlement.payment.apply');
    if (!contract.signingPartnerId || !contract.businessUnitId) throw new BadRequestException('合同缺少我方签约主体或业务单元');
    const counterpartyId = this.counterpartyId(contract, settlementDirection);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方');
    let order: { id: string } | null = null;
    if (dto.orderId) {
      order = await this.prisma.order.findFirst({
        where: {
          id: dto.orderId, contractId: contract.id,
          type: dto.businessType, status: { not: 'CANCELLED' }, deletedAt: null,
        },
        select: { id: true },
      });
      if (!order) throw new BadRequestException('执行批次不存在、已取消或不属于当前合同');
    }
    let settlement: { id: string; totalAmount: Prisma.Decimal; settledAmount: Prisma.Decimal; status: string } | null = null;
    if (dto.settlementId) {
      if (dto.businessType !== 'PURCHASE') throw new BadRequestException('客户退款不关联采购结算单，请选择原收款单');
      settlement = await this.prisma.financialSettlement.findFirst({
        where: { id: dto.settlementId, contractId: contract.id, direction: 'PAYABLE', status: { in: ['CONFIRMED', 'PARTIALLY_SETTLED'] }, deletedAt: null },
        select: { id: true, totalAmount: true, settledAmount: true, status: true },
      });
      if (!settlement) throw new BadRequestException('采购结算单不存在、已结清或不属于当前合同');
      // 草稿不锁定额度；正式业务确认、审批和登记付款时统一校验余额。
    }
    let relatedTransaction: { id: string; amount: Prisma.Decimal; allocatedAmount: Prisma.Decimal; refundedAmount: Prisma.Decimal; paymentStage: string } | null = null;
    if (dto.businessType === 'SALES') {
      if (!dto.relatedTransactionId) throw new BadRequestException('客户退款或保证金退回必须选择原收款单');
      relatedTransaction = await this.prisma.fundTransaction.findFirst({
        where: {
          id: dto.relatedTransactionId, contractId: contract.id, businessType: 'SALES', direction: 'RECEIPT',
          status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'] },
        },
        select: { id: true, amount: true, allocatedAmount: true, refundedAmount: true, paymentStage: true },
      });
      if (!relatedTransaction) throw new BadRequestException('原收款单不存在、尚未确认或与当前合同不一致');
      if (dto.paymentStage === 'GUARANTEE_RETURN' && relatedTransaction.paymentStage !== 'GUARANTEE') throw new BadRequestException('保证金退回必须关联原保证金收款单');
      if (dto.paymentStage === 'REFUND' && relatedTransaction.paymentStage === 'GUARANTEE') throw new BadRequestException('退还保证金请使用保证金退回类型');
      const pending = await this.prisma.paymentRequest.aggregate({
        where: { relatedTransactionId: relatedTransaction.id, status: { in: ['DRAFT', 'BUSINESS_CONFIRMED', 'PENDING_APPROVAL', 'APPROVED'] } },
        _sum: { amount: true },
      });
      const refundable = money(Number(relatedTransaction.amount) - Number(relatedTransaction.allocatedAmount) - Number(relatedTransaction.refundedAmount) - Number(pending._sum.amount || 0));
      if (dto.amount > refundable) throw new BadRequestException(`退款申请金额超过原收款单可退余额 ${refundable.toFixed(2)} 元；已核销部分请先撤销核销`);
    }
    const counterparty = counterpartyId === contract.sellerId ? contract.seller : contract.buyer;
    const requestNo = await this.nextNo('FKSQ', 'paymentRequest');
    return this.prisma.paymentRequest.create({
      data: {
        requestNo, businessType: dto.businessType, paymentStage: dto.paymentStage, paymentMethod: dto.paymentMethod,
        basisType: dto.basisType || (dto.settlementId ? 'SETTLEMENT' : dto.orderId ? 'BATCH' : 'CONTRACT'),
        stageName: dto.stageName?.trim(), conditionText: dto.conditionText?.trim(), conditionTypes: dto.conditionTypes || [],
        sourceLineIds: dto.sourceLineIds || [], clientRequestId: dto.clientRequestId,
        contractId: contract.id, orderId: order?.id, settlementId: settlement?.id, relatedTransactionId: relatedTransaction?.id, businessUnitId: contract.businessUnitId,
        legalEntityPartnerId: contract.signingPartnerId, counterpartyId, amount: dto.amount,
        requestedPayDate: dto.requestedPayDate ? new Date(dto.requestedPayDate) : null,
        ourBankAccount: dto.ourBankAccount?.trim(), ourBankAccountName: dto.ourBankAccountName?.trim(),
        ourBankName: dto.ourBankName?.trim(), ourBankCode: dto.ourBankCode?.trim(),
        counterpartyBankAccount: dto.counterpartyBankAccount?.trim(), counterpartyBankAccountName: dto.counterpartyBankAccountName?.trim(),
        counterpartyBankName: dto.counterpartyBankName?.trim(), counterpartyBankCode: dto.counterpartyBankCode?.trim(),
        actualPayeeName: dto.actualPayeeName?.trim() || counterparty?.name,
        isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim(),
        purpose: dto.purpose?.trim(), remarks: dto.remarks?.trim(), createdBy: userId,
      },
      include: PAYMENT_REQUEST_INCLUDE,
    });
  }

  async updatePaymentRequest(id: string, dto: UpdatePaymentRequestDto, userId: string): Promise<PaymentRequestResult> {
    if (!this.transactional) {
      const existing = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
      if (existing.businessType !== dto.businessType || existing.contractId !== (dto.contractId || null) || (existing.logisticsSettlementId || null) !== (dto.logisticsSettlementId || null)) throw new BadRequestException('修改申请不能更换业务类型或关联依据，请另建草稿');
      return this.withContractLock(this.paymentLockKey(existing), service => service.updatePaymentRequest(id, dto, userId));
    }
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.apply');
    const current = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (!['DRAFT', 'REJECTED'].includes(current.status)) throw new BadRequestException('只有草稿或已驳回的付款申请可以修改');
    if (!access.isAdmin && current.createdBy !== userId) throw new ForbiddenException('只能修改本人创建的付款申请草稿');
    if (dto.businessType === 'LOGISTICS') return this.saveLogisticsPayment(dto, userId, id);
    if (!dto.contractId || dto.logisticsSettlementId || dto.basisType === 'LOGISTICS_SETTLEMENT') throw new BadRequestException('采购付款或客户退款请选择合同，不可混用物流结算依据');
    const reverse = REVERSE_STAGES.includes(dto.paymentStage);
    if (dto.businessType === 'PURCHASE' && reverse) throw new BadRequestException('供应商退款属于收款，应在收款管理中登记');
    if (dto.businessType === 'SALES' && !reverse) throw new BadRequestException('销售正常货款属于收款；只有客户退款或保证金退回需要付款申请');
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const direction = this.directionForBusinessType(dto.businessType);
    const contract = await this.accessibleContract(dto.contractId, direction, userId, 'settlement.payment.apply');
    if (!contract.signingPartnerId || !contract.businessUnitId) throw new BadRequestException('合同缺少我方签约主体或业务单元');
    const counterpartyId = this.counterpartyId(contract, direction);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方');
    let orderId: string | null = null;
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, contractId: contract.id, type: dto.businessType, status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      });
      if (!order) throw new BadRequestException('执行批次不存在、已取消或不属于当前合同');
      orderId = order.id;
    }
    let settlementId: string | null = null;
    if (dto.settlementId) {
      if (dto.businessType !== 'PURCHASE') throw new BadRequestException('客户退款不关联采购结算单，请选择原收款单');
      const settlement = await this.prisma.financialSettlement.findFirst({
        where: { id: dto.settlementId, contractId: contract.id, direction: 'PAYABLE', status: { in: ['CONFIRMED', 'PARTIALLY_SETTLED'] }, deletedAt: null },
        select: { id: true, totalAmount: true, settledAmount: true },
      });
      if (!settlement) throw new BadRequestException('采购结算单不存在、已结清或不属于当前合同');
      settlementId = settlement.id;
    }
    let relatedTransactionId: string | null = null;
    if (dto.businessType === 'SALES') {
      if (!dto.relatedTransactionId) throw new BadRequestException('客户退款或保证金退回必须选择原收款单');
      const related = await this.prisma.fundTransaction.findFirst({
        where: {
          id: dto.relatedTransactionId, contractId: contract.id, businessType: 'SALES', direction: 'RECEIPT',
          status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'] },
        },
        select: { id: true, amount: true, allocatedAmount: true, refundedAmount: true, paymentStage: true },
      });
      if (!related) throw new BadRequestException('原收款单不存在、尚未确认或与当前合同不一致');
      if (dto.paymentStage === 'GUARANTEE_RETURN' && related.paymentStage !== 'GUARANTEE') throw new BadRequestException('保证金退回必须关联原保证金收款单');
      if (dto.paymentStage === 'REFUND' && related.paymentStage === 'GUARANTEE') throw new BadRequestException('退还保证金请使用保证金退回类型');
      const pending = await this.prisma.paymentRequest.aggregate({
        where: { id: { not: id }, relatedTransactionId: related.id, status: { in: ['DRAFT', 'BUSINESS_CONFIRMED', 'PENDING_APPROVAL', 'APPROVED'] } },
        _sum: { amount: true },
      });
      const refundable = money(Number(related.amount) - Number(related.allocatedAmount) - Number(related.refundedAmount) - Number(pending._sum.amount || 0));
      if (dto.amount > refundable) throw new BadRequestException(`退款申请金额超过原收款单可退余额 ${refundable.toFixed(2)} 元；已核销部分请先撤销核销`);
      relatedTransactionId = related.id;
    }
    const counterparty = counterpartyId === contract.sellerId ? contract.seller : contract.buyer;
    await this.prisma.paymentRequestApproval.updateMany({
      where: { paymentRequestId: id, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' },
    });
    return this.prisma.paymentRequest.update({
      where: { id },
      data: {
        businessType: dto.businessType, paymentStage: dto.paymentStage, paymentMethod: dto.paymentMethod,
        basisType: dto.basisType || (dto.settlementId ? 'SETTLEMENT' : dto.orderId ? 'BATCH' : 'CONTRACT'),
        stageName: dto.stageName?.trim() || null, conditionText: dto.conditionText?.trim() || null,
        conditionTypes: dto.conditionTypes || [], sourceLineIds: dto.sourceLineIds || [], evidenceSnapshot: Prisma.DbNull,
        contractId: contract.id, orderId, settlementId, relatedTransactionId,
        businessUnitId: contract.businessUnitId, legalEntityPartnerId: contract.signingPartnerId, counterpartyId,
        amount: dto.amount, requestedPayDate: dto.requestedPayDate ? new Date(dto.requestedPayDate) : null,
        ourBankAccount: dto.ourBankAccount?.trim() || null, ourBankAccountName: dto.ourBankAccountName?.trim() || null,
        ourBankName: dto.ourBankName?.trim() || null, ourBankCode: dto.ourBankCode?.trim() || null,
        counterpartyBankAccount: dto.counterpartyBankAccount?.trim() || null,
        counterpartyBankAccountName: dto.counterpartyBankAccountName?.trim() || null,
        counterpartyBankName: dto.counterpartyBankName?.trim() || null, counterpartyBankCode: dto.counterpartyBankCode?.trim() || null,
        actualPayeeName: dto.actualPayeeName?.trim() || counterparty?.name,
        isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim() || null,
        purpose: dto.purpose?.trim() || null, remarks: dto.remarks?.trim() || null,
        status: 'DRAFT', businessConfirmedBy: null, businessConfirmedAt: null,
        submittedBy: null, submittedAt: null, approvedBy: null, approvedAt: null,
        rejectedBy: null, rejectedAt: null, rejectionReason: null,
      },
      include: PAYMENT_REQUEST_INCLUDE,
    });
  }

  async deletePaymentRequest(id: string, userId: string): Promise<void> {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.apply');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.deletePaymentRequest(id, userId));
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿付款申请可以删除');
    if (!access.isAdmin && item.createdBy !== userId) throw new ForbiddenException('只能删除本人创建的付款申请草稿');
    await this.prisma.paymentRequest.delete({ where: { id } });
  }

  async confirmPaymentRequestBusiness(id: string, userId: string): Promise<PaymentRequestResult> {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.apply');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.confirmPaymentRequestBusiness(id, userId));
    if (!['DRAFT', 'REJECTED'].includes(item.status)) throw new BadRequestException('只有草稿或已驳回的付款申请可以确认业务资料');
    if (!access.isAdmin && item.createdBy !== userId) throw new ForbiddenException('只能确认本人创建的付款申请');
    const context = await this.validatePayment({ ...item, evidenceSnapshot: null }, userId, 'settlement.payment.apply');
    return this.prisma.paymentRequest.update({
      where: { id },
      data: {
        status: 'BUSINESS_CONFIRMED', businessConfirmedBy: userId, businessConfirmedAt: new Date(),
        ...(context && 'evidence' in context ? { evidenceSnapshot: snapshotJson(context.evidence) } : {}),
        rejectedBy: null, rejectedAt: null, rejectionReason: null,
      },
      include: PAYMENT_REQUEST_INCLUDE,
    });
  }

  async returnPaymentRequestToBusiness(id: string, dto: RejectPaymentRequestDto, userId: string): Promise<PaymentRequestResult> {
    await this.accessControl.assertPermission(userId, 'settlement.payment.submit');
    if (!dto.reason.trim()) throw new BadRequestException('请填写退回原因');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.submit');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.returnPaymentRequestToBusiness(id, dto, userId));
    if (item.status !== 'BUSINESS_CONFIRMED') throw new BadRequestException('只有待财务提交的付款申请可以退回业务完善');
    return this.prisma.paymentRequest.update({
      where: { id },
      data: {
        status: 'DRAFT', businessConfirmedBy: null, businessConfirmedAt: null,
        rejectedBy: userId, rejectedAt: new Date(), rejectionReason: dto.reason.trim(),
      },
      include: PAYMENT_REQUEST_INCLUDE,
    });
  }

  private async resolvePaymentApprovalPlan(
    client: Prisma.TransactionClient | PrismaService,
    request: any,
    allowAdminFallback = false,
  ) {
    const flow = await client.approvalFlow.findUnique({
      where: { contractType: 'PAYMENT_REQUEST' },
      include: {
        nodes: {
          where: { enabled: true },
          include: {
            role: {
              include: {
                permissions: {
                  where: { permission: { code: 'settlement.payment.approve' } },
                  include: { permission: true },
                },
              },
            },
          },
          orderBy: { step: 'asc' },
        },
      },
    });
    if (!flow || flow.status !== 'ACTIVE') {
      throw new BadRequestException('付款申请审批流程未启用，请联系系统管理员配置');
    }
    const threshold = Number(flow.amountThreshold || 0);
    const nodes = flow.nodes.filter((node) => node.condition === 'ALWAYS'
      || (node.condition === 'AMOUNT_GTE_THRESHOLD' && Number(request.amount) >= threshold));
    if (!nodes.length) throw new BadRequestException(`审批流程“${flow.name}”没有符合当前金额条件的审批节点`);
    const invalidNodes = nodes.filter((node) => node.role.status !== 'ACTIVE' || !node.role.permissions.length);
    if (invalidNodes.length) {
      throw new BadRequestException(`付款审批存在无效节点角色：${invalidNodes.map((node) => node.nodeName).join('、')}`);
    }

    const companyId = request.contract?.companyId || request.logisticsSettlement?.payerCompanyId || request.logisticsSettlement?.preparer?.companyId || null;
    const departmentId = request.contract?.departmentId || request.logisticsSettlement?.preparer?.employee?.departmentId || null;
    const businessUnitId = request.businessUnitId || request.contract?.businessUnitId || null;
    const departments = nodes.some((node) => node.scopeType === 'DEPARTMENT')
      ? await client.department.findMany({ select: { id: true, parentId: true } })
      : [];
    const parents = new Map(departments.map((department) => [department.id, department.parentId]));
    const isDepartmentOrChild = (targetId: string, ancestorId: string) => {
      let currentId: string | null | undefined = targetId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        if (currentId === ancestorId) return true;
        visited.add(currentId);
        currentId = parents.get(currentId);
      }
      return false;
    };

    const resolved = [];
    for (const node of nodes) {
      if (node.scopeType === 'COMPANY' && !companyId) throw new BadRequestException(`审批节点“${node.nodeName}”需要单据所属企业`);
      if (node.scopeType === 'DEPARTMENT' && !departmentId) throw new BadRequestException(`审批节点“${node.nodeName}”需要合同业务部门`);
      if (node.scopeType === 'BUSINESS_UNIT' && !businessUnitId) throw new BadRequestException(`审批节点“${node.nodeName}”需要付款申请所属业务单元`);
      const now = new Date();
      const assignments = await client.userRoleAssignment.findMany({
        where: {
          roleId: node.roleId, status: 'ACTIVE', effectiveAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], user: { status: 'ACTIVE' },
        },
        include: {
          user: {
            select: {
              id: true, username: true, name: true, companyId: true,
              employee: { select: { departmentId: true } },
              businessUnits: {
                where: {
                  status: 'ACTIVE', effectiveAt: { lte: now },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  businessUnit: { status: 'ACTIVE' },
                },
                select: { businessUnitId: true },
              },
            },
          },
          scopes: true,
        },
      });
      const coversScope = (assignment: typeof assignments[number]) => {
        if (businessUnitId && !assignment.user.businessUnits.some((membership) => membership.businessUnitId === businessUnitId)) return false;
        if (assignment.scopeType === 'ALL') return true;
        const scoped = (type: string) => assignment.scopes.filter((scope) => scope.targetType === type).map((scope) => scope.targetId);
        const companyIds = scoped('COMPANY');
        const departmentIds = scoped('DEPARTMENT');
        const businessUnitIds = scoped('BUSINESS_UNIT');
        if (assignment.scopeType === 'COMPANY') return assignment.user.companyId === companyId || Boolean(companyId && companyIds.includes(companyId));
        if (assignment.scopeType === 'SPECIFIED_COMPANIES') return Boolean(companyId && companyIds.includes(companyId));
        if (assignment.scopeType === 'BUSINESS_UNIT') return Boolean(businessUnitId && businessUnitIds.includes(businessUnitId));
        if (assignment.scopeType === 'DEPARTMENT') return Boolean(departmentId && (assignment.user.employee?.departmentId === departmentId || departmentIds.includes(departmentId)));
        if (assignment.scopeType === 'DEPARTMENT_AND_CHILDREN' && departmentId) {
          const ancestors = departmentIds.length ? departmentIds : assignment.user.employee?.departmentId ? [assignment.user.employee.departmentId] : [];
          return ancestors.some((ancestorId) => isDepartmentOrChild(departmentId, ancestorId));
        }
        if (assignment.scopeType === 'SELF') return assignment.user.id === request.createdBy;
        return false;
      };
      let members = Array.from(new Map(assignments.filter(coversScope).map((assignment) => [assignment.user.id, {
        id: assignment.user.id, name: assignment.user.name, username: assignment.user.username,
      }])).values());
      if (!members.length && allowAdminFallback) {
        const admins = await client.userRoleAssignment.findMany({
          where: {
            status: 'ACTIVE', effectiveAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: { code: 'ADMIN', status: 'ACTIVE' }, user: { status: 'ACTIVE' },
          },
          select: { user: { select: { id: true, name: true, username: true } } },
        });
        members = Array.from(new Map(admins.map((assignment) => [assignment.user.id, assignment.user])).values());
      }
      if (!members.length) throw new BadRequestException(`审批节点“${node.nodeName}”在当前业务范围内没有有效的“${node.role.name}”人员`);
      resolved.push({
        nodeName: node.nodeName, approvalMode: node.approvalMode,
        role: { code: node.role.code, name: node.role.name }, members,
      });
    }
    return resolved;
  }

  private async assignPaymentApprovals(
    tx: Prisma.TransactionClient,
    paymentRequestId: string,
    nodes: Array<{ nodeName: string; approvalMode: string; role: { code: string; name: string }; members: Array<{ id: string }> }>,
  ) {
    await tx.paymentRequestApproval.updateMany({
      where: { paymentRequestId, status: { in: ['PENDING', 'WAITING'] } }, data: { status: 'CANCELLED' },
    });
    const latest = await tx.paymentRequestApproval.aggregate({ where: { paymentRequestId }, _max: { round: true } });
    const round = (latest._max.round || 0) + 1;
    await tx.paymentRequestApproval.createMany({
      data: nodes.flatMap((node, index) => node.members.map((member) => ({
        paymentRequestId, assigneeId: member.id, nodeName: node.nodeName,
        roleCode: node.role.code, roleName: node.role.name, approvalMode: node.approvalMode,
        step: index + 1, round, status: index === 0 ? 'PENDING' : 'WAITING',
      }))),
    });
  }

  private async currentPaymentApprovalTasks(tx: Prisma.TransactionClient, paymentRequestId: string) {
    const pending = await tx.paymentRequestApproval.findMany({
      where: { paymentRequestId, status: 'PENDING' }, orderBy: [{ round: 'desc' }, { step: 'asc' }],
    });
    if (!pending.length) throw new BadRequestException('当前没有待处理的付款审批节点');
    const round = pending[0].round;
    const step = pending.filter((task) => task.round === round).reduce((min, task) => Math.min(min, task.step), Number.MAX_SAFE_INTEGER);
    return pending.filter((task) => task.round === round && task.step === step);
  }

  async submitPaymentRequest(id: string, userId: string): Promise<PaymentRequestResult> {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.submit');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.submit');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.submitPaymentRequest(id, userId));
    if (item.status !== 'BUSINESS_CONFIRMED') throw new BadRequestException('业务人员确认资料后，财务才能提交审批');
    if (item.isThirdParty && !item.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const reviewed = await this.validatePayment(item, userId, 'settlement.payment.submit', true);
    const plan = await this.resolvePaymentApprovalPlan(this.prisma, item, access.isAdmin);
    return this.runTransaction(async (tx) => {
      await this.assignPaymentApprovals(tx, id, plan);
      return tx.paymentRequest.update({
        where: { id },
        data: {
          status: 'PENDING_APPROVAL', submittedBy: userId, submittedAt: new Date(),
          ...(reviewed && 'evidence' in reviewed ? { evidenceSnapshot: snapshotJson(reviewed.evidence) } : {}),
          approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null,
        },
        include: PAYMENT_REQUEST_INCLUDE,
      });
    });
  }

  async approvePaymentRequest(id: string, dto: ReviewPaymentRequestDto, userId: string): Promise<PaymentRequestResult | null> {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.approvePaymentRequest(id, dto, userId));
    if (item.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批付款申请可以批准');
    if (item.basisType && item.basisType !== 'LEGACY') await this.validatePayment(item, userId, 'settlement.payment.approve');
    return this.runTransaction(async (tx) => {
      const currentTasks = await this.currentPaymentApprovalTasks(tx, id);
      const assignedTask = currentTasks.find((task) => task.assigneeId === userId);
      if (!access.isAdmin && !assignedTask) throw new ForbiddenException('当前审批节点未分配给该用户');
      const taskToAct = assignedTask || currentTasks[0];
      const actedAt = new Date();
      const approvalMode = taskToAct.approvalMode || 'ALL';
      const acted = await tx.paymentRequestApproval.updateMany({
        where: access.isAdmin
          ? { paymentRequestId: id, round: taskToAct.round, step: taskToAct.step, status: 'PENDING' }
          : { id: taskToAct.id, status: 'PENDING' },
        data: { status: 'APPROVED', comment: dto.comment?.trim() || '同意', actedAt, actedById: userId },
      });
      if (acted.count < 1) throw new BadRequestException('当前审批节点已被处理，请刷新后重试');
      if (approvalMode === 'ANY' && !access.isAdmin) {
        await tx.paymentRequestApproval.updateMany({
          where: { paymentRequestId: id, round: taskToAct.round, step: taskToAct.step, status: 'PENDING' },
          data: { status: 'OTHERS_APPROVED' },
        });
      }
      const remaining = await tx.paymentRequestApproval.count({
        where: { paymentRequestId: id, round: taskToAct.round, step: taskToAct.step, status: 'PENDING' },
      });
      if (remaining === 0) {
        const next = await tx.paymentRequestApproval.findFirst({
          where: { paymentRequestId: id, round: taskToAct.round, status: 'WAITING' },
          orderBy: { step: 'asc' },
        });
        if (next) {
          await tx.paymentRequestApproval.updateMany({
            where: { paymentRequestId: id, round: taskToAct.round, step: next.step, status: 'WAITING' },
            data: { status: 'PENDING' },
          });
        } else {
          await tx.paymentRequest.update({
            where: { id }, data: { status: 'APPROVED', approvedBy: userId, approvedAt: actedAt },
          });
        }
      }
      return tx.paymentRequest.findUnique({ where: { id }, include: PAYMENT_REQUEST_INCLUDE });
    });
  }

  async rejectPaymentRequest(id: string, dto: RejectPaymentRequestDto, userId: string): Promise<PaymentRequestResult> {
    if (!dto.reason.trim()) throw new BadRequestException('请填写驳回原因');
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.rejectPaymentRequest(id, dto, userId));
    if (item.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批付款申请可以驳回');
    return this.runTransaction(async (tx) => {
      const currentTasks = await this.currentPaymentApprovalTasks(tx, id);
      const assignedTask = currentTasks.find((task) => task.assigneeId === userId);
      if (!access.isAdmin && !assignedTask) throw new ForbiddenException('当前审批节点未分配给该用户');
      const taskToAct = assignedTask || currentTasks[0];
      const actedAt = new Date();
      const acted = await tx.paymentRequestApproval.updateMany({
        where: { id: taskToAct.id, status: 'PENDING' },
        data: { status: 'REJECTED', comment: dto.reason.trim(), actedAt, actedById: userId },
      });
      if (acted.count < 1) throw new BadRequestException('当前审批节点已被处理，请刷新后重试');
      if (taskToAct.approvalMode === 'ANY') {
        await tx.paymentRequestApproval.updateMany({
          where: {
            paymentRequestId: id, round: taskToAct.round, step: taskToAct.step,
            id: { not: taskToAct.id }, status: 'PENDING',
          },
          data: { status: 'OTHERS_REJECTED' },
        });
      }
      await tx.paymentRequestApproval.updateMany({
        where: { paymentRequestId: id, round: taskToAct.round, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'CANCELLED' },
      });
      return tx.paymentRequest.update({
        where: { id },
        data: { status: 'REJECTED', rejectedBy: userId, rejectedAt: actedAt, rejectionReason: dto.reason.trim() },
        include: PAYMENT_REQUEST_INCLUDE,
      });
    });
  }

  async voidPaymentRequest(id: string, userId: string): Promise<PaymentRequestResult> {
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(item), service => service.voidPaymentRequest(id, userId));
    if (['PARTIALLY_PAID', 'PAID'].includes(item.status)) throw new BadRequestException('已经创建付款单的申请不能作废，请按资金冲销流程处理');
    if (item.status === 'VOIDED') throw new BadRequestException('付款申请已作废');
    return this.runTransaction(async (tx) => {
      await tx.paymentRequestApproval.updateMany({
        where: { paymentRequestId: id, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'CANCELLED' },
      });
      return tx.paymentRequest.update({ where: { id }, data: { status: 'VOIDED' }, include: PAYMENT_REQUEST_INCLUDE });
    });
  }

  async executePaymentRequest(
    id: string,
    dto: ExecutePaymentRequestDto,
    userId: string,
    voucher?: { fileName: string; originalName: string; mimeType: string; size: number },
  ): Promise<FundResult> {
    const request = await this.findPaymentRequest(id, userId, 'settlement.payment.execute');
    if (!this.transactional) return this.withContractLock(this.paymentLockKey(request), service => service.executePaymentRequest(id, dto, userId, voucher));
    if (!['APPROVED', 'PARTIALLY_PAID'].includes(request.status)) throw new BadRequestException('只有已批准且尚未付清的付款申请可以创建付款单');
    await this.validatePayment(request, userId, 'settlement.payment.execute', true);
    if (!voucher) throw new BadRequestException('请从付款单创建页面上传付款凭证后再提交');
    const paidAmount = money(request.fundTransactions.reduce((sum, item) => sum + Number(item.amount), 0));
    const remainingAmount = money(Number(request.amount) - paidAmount);
    if (remainingAmount <= 0) throw new BadRequestException('该付款申请已经全部创建付款单');
    const actualAmount = money(Number(dto.amount));
    if (!Number.isFinite(actualAmount) || actualAmount <= 0) throw new BadRequestException('请填写实际付款金额');
    if (actualAmount > remainingAmount) throw new BadRequestException(`实际付款金额超过申请剩余待付金额 ${remainingAmount.toFixed(2)} 元`);
    if (!dto.bankReference?.trim()) throw new BadRequestException('请填写银行电子回单号或交易流水号');
    if (!dto.ourBankAccount?.trim() || !dto.counterpartyBankAccount?.trim()) throw new BadRequestException('请填写付款账号和收款账号');
    if (!dto.ourBankAccountName?.trim() || !dto.counterpartyBankAccountName?.trim()) throw new BadRequestException('请填写付款户名和收款户名');
    if (!dto.ourBankName?.trim() || !dto.counterpartyBankName?.trim()) throw new BadRequestException('请填写付款开户行和收款开户行');
    if (!dto.purpose?.trim()) throw new BadRequestException('请填写付款用途');
    if (dto.isThirdParty !== undefined && dto.isThirdParty !== request.isThirdParty) throw new BadRequestException('实际收款方性质与审批内容不一致，请重新发起付款申请');
    const payerAccount = normalizedBankAccount(dto.ourBankAccount);
    const payeeAccount = normalizedBankAccount(dto.counterpartyBankAccount);
    const plannedPayerAccount = normalizedBankAccount(request.ourBankAccount);
    const plannedPayeeAccount = normalizedBankAccount(request.counterpartyBankAccount);
    const payerSameParty = request.legalEntity.bankAccounts.some(item => normalizedBankAccount(item.accountNo) === payerAccount);
    const payeeSameParty = request.counterparty.bankAccounts.some(item => normalizedBankAccount(item.accountNo) === payeeAccount);
    const payerDiffers = Boolean(plannedPayerAccount && payerAccount !== plannedPayerAccount);
    const payeeDiffers = Boolean(plannedPayeeAccount && payeeAccount !== plannedPayeeAccount);
    if ((payerDiffers || payeeDiffers) && !dto.bankAccountDifferenceReason?.trim()) {
      throw new BadRequestException('实际银行账户与付款申请不一致，请填写账户差异说明');
    }
    const unknownAccounts = [
      !payerSameParty ? { account: payerAccount, expectedPartnerId: request.legalEntityPartnerId, side: '付款' } : null,
      !payeeSameParty ? { account: payeeAccount, expectedPartnerId: request.counterpartyId, side: '收款' } : null,
    ].filter((item): item is { account: string; expectedPartnerId: string; side: string } => Boolean(item?.account));
    if (unknownAccounts.length) {
      const registeredAccounts = await this.prisma.bankAccount.findMany({
        where: { status: 'ACTIVE' }, select: { accountNo: true, partnerId: true, partner: { select: { name: true } } },
      });
      for (const unknown of unknownAccounts) {
        const owner = registeredAccounts.find(item => normalizedBankAccount(item.accountNo) === unknown.account);
        if (owner && owner.partnerId !== unknown.expectedPartnerId) {
          throw new BadRequestException(`${unknown.side}账号已登记在其他企业“${owner.partner.name}”名下，不能创建付款单`);
        }
      }
    }
    const payerNames = [request.legalEntity.name, ...request.legalEntity.bankAccounts.map(item => item.accountName)].map(normalizedPartyName);
    const payeeNames = [request.actualPayeeName || request.counterparty.name, request.counterparty.name, ...request.counterparty.bankAccounts.map(item => item.accountName)].map(normalizedPartyName);
    if (!payerSameParty && dto.actualPayerName?.trim() && !payerNames.includes(normalizedPartyName(dto.actualPayerName))) {
      throw new BadRequestException('凭证付款户名与我方付款主体不一致，请核对凭证');
    }
    if (!payeeSameParty && dto.actualPayeeName?.trim() && !payeeNames.includes(normalizedPartyName(dto.actualPayeeName))) {
      throw new BadRequestException('凭证收款户名与审批确认的收款方不一致，请重新发起付款申请');
    }
    await this.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-voucher:${dto.bankReference.trim()}`}, 0))::text`;
    const fingerprint = signature({ payerAccount, payeeAccount, amount: actualAmount, occurredAt: new Date(dto.occurredAt).toISOString() });
    await this.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-fingerprint:${fingerprint}`}, 0))::text`;
    const duplicate = await this.prisma.fundTransaction.findFirst({
      where: { direction: 'PAYMENT', bankReference: dto.bankReference.trim(), status: { not: 'VOIDED' } },
    });
    if (duplicate) throw new BadRequestException(`电子回单号或银行流水号重复，已存在 ${duplicate.transactionNo}`);
    const compositeDuplicate = await this.prisma.fundTransaction.findFirst({
      where: {
        direction: 'PAYMENT', amount: actualAmount, occurredAt: new Date(dto.occurredAt),
        ourBankAccount: dto.ourBankAccount.trim(), counterpartyBankAccount: dto.counterpartyBankAccount.trim(), status: { not: 'VOIDED' },
      },
    });
    if (compositeDuplicate) throw new BadRequestException(`付款账户、收款账户、金额和付款时间与 ${compositeDuplicate.transactionNo} 相同，请确认是否重复登记`);
    const transactionNo = await this.nextNo('FK', 'fund');
    return this.runTransaction(async (tx) => {
      const fund = await tx.fundTransaction.create({
        data: {
          transactionNo, direction: 'PAYMENT', category: request.paymentStage === 'ADVANCE' ? 'ADVANCE' : REVERSE_STAGES.includes(request.paymentStage) ? 'REFUND' : 'NORMAL',
          businessType: request.businessType, paymentStage: request.paymentStage, paymentMethod: request.paymentMethod,
          contractId: request.contractId, legalEntityPartnerId: request.legalEntityPartnerId, counterpartyId: request.counterpartyId,
          status: 'PENDING_CONFIRMATION', amount: actualAmount, occurredAt: new Date(dto.occurredAt),
          bankReference: dto.bankReference?.trim(), ourBankAccount: dto.ourBankAccount?.trim() || request.ourBankAccount,
          ourBankAccountName: dto.ourBankAccountName?.trim() || request.ourBankAccountName,
          ourBankName: dto.ourBankName?.trim() || request.ourBankName, ourBankCode: dto.ourBankCode?.trim() || request.ourBankCode,
          counterpartyBankAccount: dto.counterpartyBankAccount?.trim() || request.counterpartyBankAccount,
          counterpartyBankAccountName: dto.counterpartyBankAccountName?.trim() || request.counterpartyBankAccountName,
          counterpartyBankName: dto.counterpartyBankName?.trim() || request.counterpartyBankName,
          counterpartyBankCode: dto.counterpartyBankCode?.trim() || request.counterpartyBankCode,
          currency: dto.currency || 'CNY', paymentPurpose: dto.purpose?.trim(),
          actualPayerName: dto.actualPayerName?.trim() || request.legalEntity.name,
          actualPayeeName: dto.actualPayeeName?.trim() || request.actualPayeeName || request.counterparty.name,
          isThirdParty: request.isThirdParty, thirdPartyReason: request.thirdPartyReason,
          bankAccountDifferenceReason: dto.bankAccountDifferenceReason?.trim(),
          recognitionProvider: dto.recognitionProvider?.trim(), recognitionRawText: dto.recognitionRawText?.trim(),
          instrumentNo: dto.instrumentNo?.trim(), instrumentDueDate: dto.instrumentDueDate ? new Date(dto.instrumentDueDate) : null,
          relatedTransactionId: request.relatedTransactionId, paymentRequestId: request.id, remarks: dto.remarks?.trim(), createdBy: userId,
          attachments: { create: { ...voucher, category: 'BANK_RECEIPT', sourceType: 'WEB_UPLOAD', uploadedBy: userId } },
        },
        include: FUND_INCLUDE,
      });
      await tx.paymentRequest.update({
        where: { id },
        data: { status: actualAmount >= remainingAmount ? 'PAID' : 'PARTIALLY_PAID' },
      });
      return fund;
    });
  }

  async createFund(dto: CreateFundTransactionDto, userId: string) {
    const settlementDirection = this.directionForBusinessType(dto.businessType);
    const reverse = REVERSE_STAGES.includes(dto.paymentStage);
    const baseDirection = dto.businessType === 'PURCHASE' ? 'PAYMENT' : 'RECEIPT';
    const direction = reverse ? (baseDirection === 'PAYMENT' ? 'RECEIPT' : 'PAYMENT') : baseDirection;
    if (direction === 'PAYMENT') throw new BadRequestException('实际付款必须从已审批的付款申请执行');
    await this.accessControl.assertPermission(userId, 'settlement.receipt.register');
    const contract = dto.contractId
      ? await this.accessibleContract(dto.contractId, settlementDirection, userId, 'settlement.receipt.register')
      : null;
    if (reverse && !contract) throw new BadRequestException('退款或保证金退回必须先选择原合同和资金流水');
    const legalEntityPartnerId = contract?.signingPartnerId || dto.legalEntityPartnerId;
    if (!legalEntityPartnerId) throw new BadRequestException('请选择实际到账的我方收款主体');
    const legalEntity = await this.prisma.partner.findFirst({
      where: { id: legalEntityPartnerId, isInternal: true, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true },
    });
    if (!legalEntity) throw new BadRequestException('我方收款主体不存在或已停用');
    const counterpartyId = contract ? this.counterpartyId(contract, settlementDirection) : null;
    if (contract && !counterpartyId) throw new BadRequestException('合同缺少交易对手方，不能登记资金');
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收付款必须填写原因');
    if (!contract && !dto.actualPayerName?.trim()) throw new BadRequestException('未关联合同时必须填写银行流水中的实际付款方');
    if (dto.bankReference?.trim()) {
      const duplicate = await this.prisma.fundTransaction.findFirst({
        where: {
          direction, bankReference: dto.bankReference.trim(), amount: dto.amount,
          ourBankAccount: dto.ourBankAccount?.trim() || null, status: { not: 'VOIDED' },
        },
      });
      if (duplicate) throw new BadRequestException(`银行流水可能重复，已存在 ${duplicate.transactionNo}`);
    }
    let original: { id: string; amount: Prisma.Decimal; allocatedAmount: Prisma.Decimal; refundedAmount: Prisma.Decimal; paymentStage: string } | null = null;
    if (reverse) {
      if (!dto.relatedTransactionId) throw new BadRequestException('退款或保证金退回必须选择原资金流水');
      original = await this.prisma.fundTransaction.findFirst({
        where: { id: dto.relatedTransactionId, contractId: contract!.id, businessType: dto.businessType, direction: baseDirection, status: { not: 'VOIDED' } },
        select: { id: true, amount: true, allocatedAmount: true, refundedAmount: true, paymentStage: true },
      });
      if (!original) throw new BadRequestException('原资金流水不存在或与当前合同不一致');
      if (dto.paymentStage === 'GUARANTEE_RETURN' && original.paymentStage !== 'GUARANTEE') throw new BadRequestException('保证金退回必须关联原保证金流水');
      if (dto.paymentStage === 'REFUND' && original.paymentStage === 'GUARANTEE') throw new BadRequestException('保证金请使用保证金退回类型');
      const refundable = money(Number(original.amount) - Number(original.allocatedAmount) - Number(original.refundedAmount));
      if (dto.amount > refundable) throw new BadRequestException(`退款金额超过原流水可退余额 ${refundable.toFixed(2)} 元；已核销部分请先撤销核销`);
    }
    const transactionNo = await this.nextNo(direction === 'RECEIPT' ? 'SK' : 'FK', 'fund');
    const category = dto.paymentStage === 'ADVANCE' ? 'ADVANCE' : reverse ? 'REFUND' : 'NORMAL';
    const counterparty = contract && counterpartyId === contract.sellerId ? contract.seller : contract?.buyer;
    return this.prisma.fundTransaction.create({
      data: {
        transactionNo, direction, category, businessType: dto.businessType, paymentStage: dto.paymentStage,
        paymentMethod: dto.paymentMethod, contractId: contract?.id, legalEntityPartnerId, counterpartyId,
        status: 'PENDING_CLAIM', amount: dto.amount, occurredAt: new Date(dto.occurredAt), relatedTransactionId: original?.id,
        bankReference: dto.bankReference?.trim(), ourBankAccount: dto.ourBankAccount?.trim(),
        ourBankAccountName: dto.ourBankAccountName?.trim(), ourBankName: dto.ourBankName?.trim(), ourBankCode: dto.ourBankCode?.trim(),
        counterpartyBankAccount: dto.counterpartyBankAccount?.trim(), counterpartyBankAccountName: dto.counterpartyBankAccountName?.trim(),
        counterpartyBankName: dto.counterpartyBankName?.trim(), counterpartyBankCode: dto.counterpartyBankCode?.trim(),
        instrumentNo: dto.instrumentNo?.trim(),
        instrumentDueDate: dto.instrumentDueDate ? new Date(dto.instrumentDueDate) : null,
        actualPayerName: dto.actualPayerName?.trim() || counterparty?.name,
        actualPayeeName: dto.actualPayeeName?.trim() || legalEntity.name,
        isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim(),
        remarks: dto.remarks?.trim(), createdBy: userId,
      },
      include: FUND_INCLUDE,
    });
  }

  async claimFund(id: string, dto: ClaimFundDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.receipt.claim');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.receipt.claim');
    const fund = await this.prisma.fundTransaction.findFirst({
      where: { id, direction: 'RECEIPT', status: { in: ['PENDING_CLAIM', 'PARTIALLY_CLAIMED'] } },
      include: { claims: { where: { status: { not: 'REVERSED' } } } },
    });
    if (!fund) throw new NotFoundException('待认领收款不存在或不在当前数据权限范围内');
    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null, type: { in: ['SALES', 'BILATERAL'] }, AND: [scope] },
      include: { seller: true, buyer: true, signingPartner: true },
    });
    if (!contract || !contract.signingPartnerId) throw new BadRequestException('销售合同不存在、未生效或不在当前数据权限范围内');
    if (contract.signingPartnerId !== fund.legalEntityPartnerId) throw new BadRequestException('合同的我方签约主体与实际收款账户主体不一致');
    const counterpartyId = this.counterpartyId(contract, 'RECEIVABLE');
    if (!counterpartyId) throw new BadRequestException('合同缺少客户信息');
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, contractId: contract.id, type: 'SALES', status: { not: 'CANCELLED' }, deletedAt: null } });
      if (!order) throw new BadRequestException('执行批次不存在、已取消或不属于当前合同');
    }
    const claimedAmount = money(fund.claims.reduce((sum, claim) => sum + Number(claim.amount), 0));
    const available = money(Number(fund.amount) - claimedAmount);
    if (dto.amount > available) throw new BadRequestException(`本次认领金额超过待认领余额 ${available.toFixed(2)} 元`);
    const after = money(claimedAmount + dto.amount);
    return this.runTransaction(async (tx) => {
      await tx.fundClaim.create({
        data: {
          fundTransactionId: id, contractId: contract.id, orderId: dto.orderId,
          businessUnitId: contract.businessUnitId, counterpartyId, paymentStage: dto.paymentStage,
          amount: dto.amount, remarks: dto.remarks?.trim(), createdBy: userId,
        },
      });
      return tx.fundTransaction.update({
        where: { id },
        data: {
          status: after >= Number(fund.amount) ? 'PENDING_CONFIRMATION' : 'PARTIALLY_CLAIMED',
          claimedBy: userId, claimedAt: new Date(),
        },
        include: FUND_INCLUDE,
      });
    });
  }

  async confirmFund(id: string, userId: string): Promise<FundResult> {
    const accessible = await this.findFund(id, userId, 'settlement.fund.confirm');
    if (!this.transactional) return this.withContractLock(this.fundLockKey(accessible), service => service.confirmFund(id, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${id} FOR UPDATE`;
    const fund = await this.prisma.fundTransaction.findFirst({
      where: { id, status: 'PENDING_CONFIRMATION' },
      include: { relatedTransaction: true, attachments: { select: { id: true } }, claims: { where: { status: { not: 'REVERSED' } } } },
    });
    if (!fund) throw new NotFoundException('待确认资金单不存在或不在当前数据权限范围内');
    if (!fund.attachments.length) throw new BadRequestException('财务确认前请先上传银行回单或资金凭证');
    if (fund.direction === 'RECEIPT') {
      const claimed = money(fund.claims.reduce((sum, claim) => sum + Number(claim.amount), 0));
      if (claimed !== money(Number(fund.amount))) throw new BadRequestException('收款金额尚未全部认领，不能进行财务确认');
    }
    return this.runTransaction(async (tx) => {
      if (fund.relatedTransaction) {
        const consumed = money(Number(fund.relatedTransaction.allocatedAmount) + Number(fund.relatedTransaction.refundedAmount) + Number(fund.amount));
        if (consumed > Number(fund.relatedTransaction.amount)) throw new BadRequestException('退款金额超过原资金流水可退余额');
        await tx.fundTransaction.update({
          where: { id: fund.relatedTransaction.id },
          data: {
            refundedAmount: { increment: fund.amount },
            status: consumed >= Number(fund.relatedTransaction.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
          },
        });
      }
      if (fund.direction === 'RECEIPT') {
        await tx.fundClaim.updateMany({
          where: { fundTransactionId: id, status: 'PENDING_CONFIRMATION' },
          data: { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() },
        });
      }
      return tx.fundTransaction.update({
        where: { id }, data: { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() }, include: FUND_INCLUDE,
      });
    });
  }

  async allocateLogisticsFund(id: string, dto: AllocateFundDto, userId: string): Promise<FundResult> {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new BadRequestException('核销金额必须大于零');
    const fund = await this.findFund(id, userId, 'settlement.allocate');
    const settlementId = fund.paymentRequest?.logisticsSettlementId;
    if (fund.businessType !== 'LOGISTICS' || !settlementId || dto.fundTransactionId !== id) throw new BadRequestException('只能核销到物流付款申请关联的原物流结算单');
    if (!this.transactional) return this.withContractLock(`logistics:${settlementId}`, service => service.allocateLogisticsFund(id, dto, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${id} FOR UPDATE`;
    const current = await this.findFund(id, userId, 'settlement.allocate');
    if (!['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(current.status)) throw new BadRequestException('请先财务确认付款单，且资金须有未核销余额');
    const context = await new LogisticsPaymentContext(this.prisma, this.accessControl).load(settlementId, userId, 'settlement.allocate');
    if (current.legalEntityPartnerId !== context.legalEntity.id || current.counterpartyId !== context.counterparty.id) throw new BadRequestException('付款双方与物流结算不一致，不能核销');
    const available = money(Number(current.amount) - Number(current.allocatedAmount) - Number(current.refundedAmount));
    if (dto.amount > available || dto.amount > money(context.totalAmount - context.allocatedAmount)) throw new BadRequestException('核销金额超过付款单可用余额或物流结算未结金额');
    const allocated = money(Number(current.allocatedAmount) + dto.amount);
    await this.prisma.logisticsPaymentAllocation.create({ data: { logisticsSettlementId: settlementId, fundTransactionId: id, amount: dto.amount, createdBy: userId } });
    await this.prisma.fundTransaction.update({ where: { id }, data: { allocatedAmount: allocated, status: allocated + Number(current.refundedAmount) >= Number(current.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED' } });
    return this.findFund(id, userId, 'settlement.allocate');
  }

  async reverseLogisticsAllocation(id: string, dto: ReverseAllocationDto, userId: string, fundId: string): Promise<FundResult> {
    if (!dto.reason.trim()) throw new BadRequestException('请填写撤销核销原因');
    await this.accessControl.assertPermission(userId, 'settlement.reverse');
    const scope = await this.accessControl.getLogisticsPaymentScope(userId, 'settlement.reverse');
    const row = await this.prisma.logisticsPaymentAllocation.findFirst({ where: { id, settlement: scope } });
    if (!row || row.fundTransactionId !== fundId) throw new NotFoundException('物流核销记录不存在或无权访问');
    await this.findFund(row.fundTransactionId, userId, 'settlement.reverse');
    if (!this.transactional) return this.withContractLock(`logistics:${row.logisticsSettlementId}`, service => service.reverseLogisticsAllocation(id, dto, userId, fundId));
    if (row.reversedAt) throw new BadRequestException('该核销记录已撤销');
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${row.fundTransactionId} FOR UPDATE`;
    const fund = await this.findFund(row.fundTransactionId, userId, 'settlement.reverse');
    const allocated = money(Number(fund.allocatedAmount) - Number(row.amount));
    await this.prisma.logisticsPaymentAllocation.update({ where: { id }, data: { reversedAt: new Date(), reversedBy: userId, reversalReason: dto.reason.trim() } });
    await this.prisma.fundTransaction.update({ where: { id: fund.id }, data: { allocatedAmount: allocated, status: allocated <= 0 ? 'CONFIRMED' : 'PARTIALLY_ALLOCATED' } });
    return this.findFund(fund.id, userId, 'settlement.reverse');
  }

  async allocate(id: string, dto: AllocateFundDto, userId: string): Promise<SettlementResult> {
    const settlement = await this.findOne(id, userId, 'settlement.allocate');
    if (!this.transactional) return this.withContractLock(settlement.contractId, service => service.allocate(id, dto, userId));
    if (!['CONFIRMED', 'PARTIALLY_SETTLED'].includes(settlement.status)) throw new BadRequestException('只有已确认且未结清的结算单可以核销');
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${dto.fundTransactionId} FOR UPDATE`;
    const access = await this.accessControl.assertPermission(userId, 'settlement.allocate');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.allocate');
    const fund = await this.prisma.fundTransaction.findFirst({
      where: {
        id: dto.fundTransactionId, status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED'] },
        ...(access.isAdmin ? {} : {
          OR: [
            { contract: { is: contractScope } },
            { claims: { some: { contract: contractScope, status: 'CONFIRMED' } } },
          ],
        }),
      },
      include: {
        earmarks: { where: { releasedAt: null } },
        paymentRequest: true,
        claims: { where: { status: 'CONFIRMED' } },
        allocations: { where: { reversedAt: null }, include: { settlement: { select: { contractId: true } } } },
      },
    });
    if (!fund) throw new NotFoundException('资金流水不存在或无权访问');
    if (!ALLOCATABLE_STAGES.includes(fund.paymentStage)) throw new BadRequestException('退款、保证金及保证金退回不能核销贸易结算单');
    const expectedDirection = settlement.direction === 'RECEIVABLE' ? 'RECEIPT' : 'PAYMENT';
    if (fund.direction !== expectedDirection) throw new BadRequestException('资金收付方向与结算单不一致');
    if (fund.legalEntityPartnerId !== settlement.legalEntityPartnerId) throw new BadRequestException('资金流水的法律主体与结算单不一致');
    if (fund.direction === 'PAYMENT') {
      if (fund.contractId !== settlement.contractId || fund.counterpartyId !== settlement.counterpartyId) throw new BadRequestException('付款单的合同或交易对手与结算单不一致');
    } else {
      const claimedForContract = money(fund.claims.filter((claim) => claim.contractId === settlement.contractId && claim.counterpartyId === settlement.counterpartyId).reduce((sum, claim) => sum + Number(claim.amount), 0));
      const allocatedForContract = money(fund.allocations.filter((entry) => entry.settlement.contractId === settlement.contractId).reduce((sum, entry) => sum + Number(entry.amount), 0));
      if (claimedForContract <= 0) throw new BadRequestException('该收款单尚未认领到当前合同');
      if (dto.amount > money(claimedForContract - allocatedForContract)) throw new BadRequestException('核销金额超过当前合同已确认的收款认领金额');
    }
    const remainingSettlement = money(Number(settlement.totalAmount) - Number(settlement.settledAmount));
    const remainingFund = money(Number(fund.amount) - Number(fund.allocatedAmount) - Number(fund.refundedAmount));
    const orderIds = new Set(settlement.lines.map(l => l.orderId));
    const reservedElsewhere = fund.earmarks.filter(e => e.settlementId !== id && !(e.orderId && orderIds.has(e.orderId)))
      .reduce((sum, e) => sum + Number(e.amount) - Number(e.consumedAmount), 0);
    if (dto.amount > money(remainingFund - reservedElsewhere)) throw new BadRequestException('资金已指定用于其他结算或批次，请先解除相应用途');
    if (fund.direction === 'PAYMENT' && fund.paymentRequest?.settlementId && fund.paymentRequest.settlementId !== id) throw new BadRequestException('付款申请指定了其他采购结算，不得跨结算核销');
    if (dto.amount > remainingSettlement || dto.amount > remainingFund) throw new BadRequestException('核销金额超过结算单未结金额或资金可用余额');
    let consume = dto.amount;
    const consumptions: Array<{ id: string; amount: number }> = [];
    for (const mark of fund.earmarks.filter(e => e.settlementId === id || Boolean(e.orderId && orderIds.has(e.orderId)))) {
      const amount = money(Math.min(consume, Number(mark.amount) - Number(mark.consumedAmount)));
      if (amount > 0) {
        await this.prisma.fundEarmark.update({ where: { id: mark.id }, data: { consumedAmount: { increment: amount } } });
        consumptions.push({ id: mark.id, amount }); consume = money(consume - amount);
      }
    }
    const newSettled = money(Number(settlement.settledAmount) + dto.amount);
    const newAllocated = money(Number(fund.allocatedAmount) + dto.amount);
    await Promise.all([
      this.prisma.settlementAllocation.create({ data: { settlementId: id, fundTransactionId: fund.id, amount: dto.amount, createdBy: userId, earmarkConsumptions: consumptions } }),
      this.prisma.financialSettlement.update({ where: { id }, data: { settledAmount: newSettled, status: newSettled >= Number(settlement.totalAmount) ? 'SETTLED' : 'PARTIALLY_SETTLED' } }),
      this.prisma.fundTransaction.update({ where: { id: fund.id }, data: { allocatedAmount: newAllocated, status: newAllocated + Number(fund.refundedAmount) >= Number(fund.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED' } }),
    ]);
    return this.findOne(id, userId, 'settlement.allocate');
  }

  async reverseAllocation(allocationId: string, dto: ReverseAllocationDto, userId: string): Promise<SettlementResult> {
    await this.accessControl.assertPermission(userId, 'settlement.reverse');
    if (!dto.reason.trim()) throw new BadRequestException('请填写撤销核销原因');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.reverse');
    let allocation = await this.prisma.settlementAllocation.findFirst({
      where: { id: allocationId, settlement: { contract: scope } }, include: { settlement: true, fundTransaction: true },
    });
    if (!allocation) throw new NotFoundException('核销记录不存在或无权访问');
    if (!this.transactional) return this.withContractLock(allocation.settlement.contractId, service => service.reverseAllocation(allocationId, dto, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${allocation.fundTransactionId} FOR UPDATE`;
    allocation = await this.prisma.settlementAllocation.findFirst({ where: { id: allocationId, settlement: { contract: scope } }, include: { settlement: true, fundTransaction: true } });
    if (!allocation) throw new NotFoundException('核销记录不存在或无权访问');
    if (allocation.reversedAt) throw new BadRequestException('该核销记录已经撤销');
    if (Array.isArray(allocation.earmarkConsumptions)) for (const value of allocation.earmarkConsumptions) {
      const mark = value as { id: string; amount: number };
      await this.prisma.fundEarmark.update({ where: { id: mark.id }, data: { consumedAmount: { decrement: mark.amount } } });
    }
    const amount = Number(allocation.amount);
    const settlementAmount = money(Math.max(0, Number(allocation.settlement.settledAmount) - amount));
    const fundAmount = money(Math.max(0, Number(allocation.fundTransaction.allocatedAmount) - amount));
    await Promise.all([
      this.prisma.settlementAllocation.update({ where: { id: allocation.id }, data: { reversedAt: new Date(), reversedBy: userId, reversalReason: dto.reason.trim() } }),
      this.prisma.financialSettlement.update({
        where: { id: allocation.settlementId },
        data: { settledAmount: settlementAmount, status: settlementAmount <= 0 ? 'CONFIRMED' : settlementAmount >= Number(allocation.settlement.totalAmount) ? 'SETTLED' : 'PARTIALLY_SETTLED' },
      }),
      this.prisma.fundTransaction.update({
        where: { id: allocation.fundTransactionId },
        data: { allocatedAmount: fundAmount, status: fundAmount <= 0 ? 'CONFIRMED' : fundAmount + Number(allocation.fundTransaction.refundedAmount) >= Number(allocation.fundTransaction.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED' },
      }),
    ]);
    return this.findOne(allocation.settlementId, userId, 'settlement.reverse');
  }

  async voidFund(id: string, userId: string): Promise<FundResult | null> {
    const accessible = await this.findFund(id, userId, 'settlement.reverse');
    if (!this.transactional) return this.withContractLock(this.fundLockKey(accessible), service => service.voidFund(id, userId));
    await this.prisma.$queryRaw`SELECT "id" FROM "fund_transactions" WHERE "id" = ${id} FOR UPDATE`;
    const fund = await this.prisma.fundTransaction.findUnique({ where: { id }, include: { allocations: true, reverseTransactions: true, claims: true } });
    if (!fund) throw new NotFoundException('资金流水不存在或无权访问');
    if (fund.status === 'VOIDED') throw new BadRequestException('资金流水已作废');
    if (fund.allocations.some((entry) => !entry.reversedAt) || Number(fund.allocatedAmount) > 0) throw new BadRequestException('资金流水已有有效核销记录，不能直接作废');
    if (fund.reverseTransactions.some((entry) => entry.status !== 'VOIDED') || Number(fund.refundedAmount) > 0) throw new BadRequestException('资金流水已有退款或退回记录，不能直接作废');
    if (fund.claims.some((entry) => entry.status === 'CONFIRMED')) throw new BadRequestException('收款单已有财务确认的认领明细，不能直接作废');
    await this.prisma.fundEarmark.updateMany({ where: { fundTransactionId: id, releasedAt: null }, data: { releasedAt: new Date() } });
    if (fund.relatedTransactionId && fund.confirmedAt) {
      const original = await this.prisma.fundTransaction.findUnique({ where: { id: fund.relatedTransactionId } });
      if (!original) throw new BadRequestException('原资金流水不存在，不能作废退回流水');
      const refundedAfter = money(Math.max(0, Number(original.refundedAmount) - Number(fund.amount)));
      const consumedAfter = money(Number(original.allocatedAmount) + refundedAfter);
      await Promise.all([
        this.prisma.fundTransaction.update({
          where: { id: fund.relatedTransactionId },
          data: {
            refundedAmount: refundedAfter,
            status: consumedAfter <= 0 ? 'CONFIRMED' : consumedAfter >= Number(original.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
          },
        }),
        this.prisma.fundTransaction.update({ where: { id }, data: { status: 'VOIDED' } }),
      ]);
      if (fund.paymentRequestId) await this.refreshPaymentRequestPaymentStatus(fund.paymentRequestId);
      return this.prisma.fundTransaction.findUnique({ where: { id }, include: FUND_INCLUDE });
    }
    await this.prisma.fundTransaction.update({ where: { id }, data: { status: 'VOIDED' } });
    if (fund.paymentRequestId) await this.refreshPaymentRequestPaymentStatus(fund.paymentRequestId);
    return this.prisma.fundTransaction.findUnique({ where: { id }, include: FUND_INCLUDE });
  }

  private async refreshPaymentRequestPaymentStatus(paymentRequestId: string) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: paymentRequestId },
      select: {
        amount: true,
        fundTransactions: { where: { status: { not: 'VOIDED' } }, select: { amount: true } },
      },
    });
    if (!request) return;
    const paid = money(request.fundTransactions.reduce((sum, item) => sum + Number(item.amount), 0));
    await this.prisma.paymentRequest.update({
      where: { id: paymentRequestId },
      data: { status: paid <= 0 ? 'APPROVED' : paid >= Number(request.amount) ? 'PAID' : 'PARTIALLY_PAID' },
    });
  }
}
