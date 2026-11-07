import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { CreateInvoiceRecordDto, CreateSettlementInvoiceDto, InvoiceAllocationItemDto, RegisterInvoiceDto } from './dto/invoice-record.dto';
import { INVOICE_ALLOCATION_LABEL, InvoiceAllocationState, InvoiceMatchState, allocationState, matchInvoices } from './invoice-matching';

type Direction = 'INPUT' | 'OUTPUT';
type SourceType = 'GOODS' | 'FREIGHT';
type Access = 'view' | 'create' | 'reverse';
type Db = PrismaService | Prisma.TransactionClient;

/** 结算单确认后才形成正式应收应付，才能接收发票分摊。 */
const CONFIRMED_SETTLEMENT = ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'];
const EFFECTIVE_CONTRACT = ['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED', 'TERMINATED'];
const ACTIVE_ALLOCATION = { reversedAt: null } as const;
const FINANCE_PERMISSION: Record<Access, string> = { view: 'settlement.view', create: 'settlement.create', reverse: 'settlement.reverse' };
const LOGISTICS_PERMISSION: Record<Access, string> = { view: 'logistics.settlement.view', create: 'logistics.settlement.manage', reverse: 'logistics.settlement.manage' };
const ZERO = new Prisma.Decimal(0);
const dec = (value: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(value ?? 0);

/** 结算依据：采购/销售结算单或物流结算单，统一为开票方、收票方和金额。 */
interface Target {
  kind: 'SETTLEMENT' | 'LOGISTICS_SETTLEMENT';
  id: string; no: string; sourceType: SourceType; direction: Direction;
  sellerPartnerId: string | null; buyerPartnerId: string | null;
  amount: Prisma.Decimal; quantity: Prisma.Decimal | null; contractId: string | null; ready: boolean;
}

export interface InvoiceLedgerQuery {
  direction?: string; sourceType?: string; status?: string; allocation?: string; search?: string;
  from?: string; to?: string; businessUnitId?: string; contractId?: string;
}

/**
 * 发票登记与分摊：
 * - 发票可先登记、暂不对应结算单（货款发票归属合同，运费发票归属承运方与事业部）；
 * - 一张发票可分摊到多张结算单，一张结算单可接收多张发票；分摊合计不超过发票金额，也不超过结算金额；
 * - 结算单的到票核对与票款差按有效分摊计算；
 * - 只做票、款、结算核对，不生成会计凭证或税务申报数据。
 */
@Injectable()
export class InvoiceRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlements: FinancialSettlementService,
    private readonly accessControl: AccessControlService,
  ) {}

  // ───────────── 结算单 / 物流结算单详情 ─────────────

  async list(settlementId: string, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.view');
    const allocations = await this.allocationsOf({ settlementId });
    const summary = matchInvoices({
      settlementQuantity: settlement.quantity, settlementAmount: settlement.totalAmount, paidAmount: settlement.settledAmount,
      compareQuantity: true, allocations: allocations.filter(item => !item.reversedAt),
    });
    return { allocations, summary: { direction: settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT', registrable: CONFIRMED_SETTLEMENT.includes(settlement.status), ...summary } };
  }

  async listFreight(logisticsSettlementId: string, userId: string) {
    const settlement = await this.findFreight(logisticsSettlementId, userId, 'view');
    const allocations = await this.allocationsOf({ logisticsSettlementId });
    const summary = matchInvoices({
      settlementQuantity: null, settlementAmount: settlement.totalAmount, paidAmount: await this.freightPaid(logisticsSettlementId),
      compareQuantity: false, allocations: allocations.filter(item => !item.reversedAt),
    });
    return { allocations, summary: { direction: 'INPUT' as const, registrable: settlement.status === 'REVIEWED', ...summary } };
  }

  /** 在结算单上登记发票并分摊到本单。 */
  async create(settlementId: string, dto: CreateSettlementInvoiceDto, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.create');
    if (!CONFIRMED_SETTLEMENT.includes(settlement.status)) throw new BadRequestException('结算单确认后才能登记发票；票先到时请在发票台账中登记，结算单确认后再分摊');
    const direction: Direction = settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT';
    const seller = direction === 'INPUT' ? settlement.counterpartyId : settlement.legalEntityPartnerId;
    const buyer = direction === 'INPUT' ? settlement.legalEntityPartnerId : settlement.counterpartyId;
    const data = await this.recordData(dto, direction, seller, buyer, userId);
    return this.prisma.$transaction(async tx => {
      const invoice = await tx.invoiceRecord.create({ data: { ...data, sourceType: 'GOODS', contractId: settlement.contractId, businessUnitId: settlement.businessUnitId } });
      await this.allocateInTx(tx, [{ invoiceId: invoice.id, settlementId, amount: dto.allocationAmount ?? 0, quantity: dto.allocationQuantity }], userId, true);
      return invoice;
    });
  }

  /** 在物流结算单上登记运费发票并分摊到本单。 */
  async createFreight(logisticsSettlementId: string, dto: CreateSettlementInvoiceDto, userId: string) {
    const settlement = await this.findFreight(logisticsSettlementId, userId, 'create');
    if (settlement.status !== 'REVIEWED') throw new BadRequestException('物流结算单复核后才能登记运费发票；票先到时请在进项发票中登记，复核后再分摊');
    if (!settlement.carrierPartnerId) throw new BadRequestException('物流结算单未记录承运方，不能确定开票方，请先补齐承运方');
    if (!settlement.payerPartnerId) throw new BadRequestException('物流结算单未记录付款主体，不能确定收票方，请先补齐付款主体');
    const data = await this.recordData(dto, 'INPUT', settlement.carrierPartnerId, settlement.payerPartnerId, userId);
    return this.prisma.$transaction(async tx => {
      const invoice = await tx.invoiceRecord.create({ data: { ...data, sourceType: 'FREIGHT', businessUnitId: settlement.businessUnitId } });
      await this.allocateInTx(tx, [{ invoiceId: invoice.id, logisticsSettlementId, amount: dto.allocationAmount ?? 0, quantity: dto.allocationQuantity }], userId, true);
      return invoice;
    });
  }

  // ───────────── 先登记、后分摊 ─────────────

  /** 发票先登记、暂不对应结算单：货款发票归属合同，运费发票归属承运方、付款主体和事业部。 */
  async register(dto: RegisterInvoiceDto, userId: string) {
    if (dto.sourceType === 'FREIGHT') {
      if (dto.direction !== 'INPUT') throw new BadRequestException('运费发票只能登记为进项发票');
      if (!dto.carrierPartnerId || !dto.payerPartnerId || !dto.businessUnitId) throw new BadRequestException('运费发票请选择承运方（开票方）、付款主体（收票方）和事业部');
      const allowed = await this.businessUnitFilter(userId, 'create', 'FREIGHT');
      if (allowed.businessUnitId && !allowed.businessUnitId.in.includes(dto.businessUnitId)) throw new ForbiddenException('无权为该事业部登记运费发票');
      const [carrier, payer, unit] = await Promise.all([
        this.prisma.partner.findFirst({ where: { id: dto.carrierPartnerId, deletedAt: null }, select: { id: true } }),
        this.prisma.partner.findFirst({ where: { id: dto.payerPartnerId, deletedAt: null }, select: { id: true, isInternal: true } }),
        this.prisma.businessUnit.findUnique({ where: { id: dto.businessUnitId }, select: { id: true } }),
      ]);
      if (!carrier || !payer || !unit) throw new BadRequestException('承运方、付款主体或事业部不存在');
      if (!payer.isInternal) throw new BadRequestException('收票方须为我方签约主体');
      const data = await this.recordData(dto, 'INPUT', carrier.id, payer.id, userId);
      return this.prisma.invoiceRecord.create({ data: { ...data, sourceType: 'FREIGHT', businessUnitId: unit.id } });
    }

    if (!dto.contractId) throw new BadRequestException('货款发票请选择所属合同');
    await this.accessControl.assertPermission(userId, 'settlement.create');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.create');
    const contract = await this.prisma.contract.findFirst({ where: { id: dto.contractId, deletedAt: null, AND: [scope] } });
    if (!contract) throw new NotFoundException('合同不存在或无权访问');
    if (!EFFECTIVE_CONTRACT.includes(contract.status)) throw new BadRequestException('合同生效后才能登记发票');
    const types = dto.direction === 'INPUT' ? ['PURCHASE', 'BILATERAL'] : ['SALES', 'BILATERAL'];
    if (!types.includes(contract.type)) throw new BadRequestException(dto.direction === 'INPUT' ? '进项发票须选择采购或双边合同' : '销项发票须选择销售或双边合同');
    const counterparty = this.counterpartyOf(contract, dto.direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE');
    if (!contract.signingPartnerId || !counterparty) throw new BadRequestException('合同缺少我方签约主体或交易对手方，不能确定开票方和收票方');
    const seller = dto.direction === 'INPUT' ? counterparty : contract.signingPartnerId;
    const buyer = dto.direction === 'INPUT' ? contract.signingPartnerId : counterparty;
    const data = await this.recordData(dto, dto.direction, seller, buyer, userId);
    return this.prisma.invoiceRecord.create({ data: { ...data, sourceType: 'GOODS', contractId: contract.id, businessUnitId: contract.businessUnitId } });
  }

  /** 一次提交多条分摊；在同一事务内锁定发票与结算依据，避免并发超额分摊。 */
  async allocate(items: InvoiceAllocationItemDto[], userId: string) {
    for (const item of items) {
      if (Boolean(item.settlementId) === Boolean(item.logisticsSettlementId)) throw new BadRequestException('每条分摊须且只能指定一张结算单或物流结算单');
      await this.findInvoice(item.invoiceId, userId, 'create');
      if (item.settlementId) await this.settlements.findOne(item.settlementId, userId, 'settlement.create');
      else await this.findFreight(item.logisticsSettlementId!, userId, 'create');
    }
    return this.prisma.$transaction(tx => this.allocateInTx(tx, items, userId, false));
  }

  async reverseAllocation(allocationId: string, reason: string, userId: string) {
    if (!reason.trim()) throw new BadRequestException('请填写撤销分摊的原因');
    const allocation = await this.prisma.invoiceAllocation.findUnique({ where: { id: allocationId } });
    if (!allocation || allocation.reversedAt) throw new NotFoundException('有效分摊记录不存在');
    if (allocation.settlementId) await this.settlements.findOne(allocation.settlementId, userId, 'settlement.reverse');
    else await this.findFreight(allocation.logisticsSettlementId!, userId, 'reverse');
    const updated = await this.prisma.invoiceAllocation.updateMany({
      where: { id: allocationId, reversedAt: null },
      data: { reversedAt: new Date(), reversedBy: userId, reversalReason: reason.trim() },
    });
    if (!updated.count) throw new NotFoundException('有效分摊记录不存在');
    return this.prisma.invoiceAllocation.findUniqueOrThrow({ where: { id: allocationId } });
  }

  async voidInvoice(invoiceId: string, reason: string, userId: string) {
    if (!reason.trim()) throw new BadRequestException('请填写发票作废原因');
    await this.findInvoice(invoiceId, userId, 'reverse');
    const active = await this.prisma.invoiceAllocation.count({ where: { invoiceId, reversedAt: null } });
    if (active) throw new BadRequestException('发票仍有有效分摊，请先撤销全部分摊再作废');
    const updated = await this.prisma.invoiceRecord.updateMany({
      where: { id: invoiceId, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() },
    });
    if (!updated.count) throw new NotFoundException('有效发票记录不存在');
    return this.prisma.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceId } });
  }

  async detail(invoiceId: string, userId: string) {
    await this.findInvoice(invoiceId, userId, 'view');
    const invoice = await this.prisma.invoiceRecord.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } },
        contract: { select: { id: true, contractNo: true, title: true } }, businessUnit: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    const allocations = await this.allocationsOf({ invoiceId });
    return { ...invoice, ...this.allocationSummary(invoice.taxInclusiveAmount, allocations), allocations };
  }

  /** 可接收该发票分摊的结算依据：同一开票方、收票方，已确认（复核）且仍有未到票金额；同合同优先。 */
  async targetCandidates(invoiceId: string, userId: string) {
    await this.findInvoice(invoiceId, userId, 'create');
    const invoice = await this.prisma.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceId } });
    const rows: Array<Record<string, unknown> & { remainingAmount: string; sameContract: boolean }> = [];
    if (invoice.sourceType === 'GOODS') {
      const scope = await this.accessControl.getContractScope(userId, 'settlement.create');
      const settlementDirection = invoice.direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE';
      const items = await this.prisma.financialSettlement.findMany({
        where: {
          deletedAt: null, direction: settlementDirection, status: { in: CONFIRMED_SETTLEMENT }, contract: scope,
          counterpartyId: invoice.direction === 'INPUT' ? invoice.sellerPartnerId : invoice.buyerPartnerId,
          legalEntityPartnerId: invoice.direction === 'INPUT' ? invoice.buyerPartnerId : invoice.sellerPartnerId,
        },
        select: { id: true, settlementNo: true, totalAmount: true, quantity: true, confirmedAt: true, contract: { select: { id: true, contractNo: true, title: true } }, invoiceAllocations: { where: ACTIVE_ALLOCATION, select: { amount: true } } },
        orderBy: { confirmedAt: 'desc' },
      });
      for (const item of items) {
        const remaining = dec(item.totalAmount).minus(item.invoiceAllocations.reduce((sum, a) => sum.plus(a.amount), ZERO));
        if (remaining.gt(0)) rows.push({ kind: 'SETTLEMENT', id: item.id, no: item.settlementNo, contract: item.contract, confirmedAt: item.confirmedAt, settlementAmount: dec(item.totalAmount).toFixed(2), settlementQuantity: item.quantity == null ? null : dec(item.quantity).toFixed(3), remainingAmount: remaining.toFixed(2), sameContract: item.contract.id === invoice.contractId });
      }
    } else {
      const scope = await this.freightScope(userId, 'create');
      const items = await this.prisma.logisticsSettlement.findMany({
        where: { AND: [scope, { status: 'REVIEWED', carrierPartnerId: invoice.sellerPartnerId, payerPartnerId: invoice.buyerPartnerId }] },
        select: { id: true, settlementNo: true, totalAmount: true, reviewedAt: true, periodStart: true, periodEnd: true, invoiceAllocations: { where: ACTIVE_ALLOCATION, select: { amount: true } } },
        orderBy: { reviewedAt: 'desc' },
      });
      for (const item of items) {
        const remaining = dec(item.totalAmount).minus(item.invoiceAllocations.reduce((sum, a) => sum.plus(a.amount), ZERO));
        if (remaining.gt(0)) rows.push({ kind: 'LOGISTICS_SETTLEMENT', id: item.id, no: item.settlementNo, contract: null, confirmedAt: item.reviewedAt, periodStart: item.periodStart, periodEnd: item.periodEnd, settlementAmount: dec(item.totalAmount).toFixed(2), settlementQuantity: null, remainingAmount: remaining.toFixed(2), sameContract: false });
      }
    }
    return rows.sort((a, b) => Number(b.sameContract) - Number(a.sameContract));
  }

  /** 可分摊到该结算依据的已登记发票：同一开票方、收票方，仍有未分摊余额；同合同优先。 */
  async invoiceCandidates(target: { settlementId?: string; logisticsSettlementId?: string }, userId: string) {
    if (Boolean(target.settlementId) === Boolean(target.logisticsSettlementId)) throw new BadRequestException('请指定一张结算单或物流结算单');
    if (target.settlementId) await this.settlements.findOne(target.settlementId, userId, 'settlement.create');
    else await this.findFreight(target.logisticsSettlementId!, userId, 'create');
    const resolved = await this.resolveTarget(this.prisma, target);
    if (!resolved.sellerPartnerId || !resolved.buyerPartnerId) return [];
    const scope = await this.invoiceScope(userId, 'create');
    const invoices = await this.prisma.invoiceRecord.findMany({
      where: { AND: [scope, { status: 'ACTIVE', sourceType: resolved.sourceType, direction: resolved.direction, sellerPartnerId: resolved.sellerPartnerId, buyerPartnerId: resolved.buyerPartnerId }] },
      include: { contract: { select: { id: true, contractNo: true, title: true } }, allocations: { where: ACTIVE_ALLOCATION, select: { amount: true, quantity: true } } },
      orderBy: [{ issuedAt: 'desc' }],
    });
    return invoices
      .map(({ allocations, ...invoice }) => {
        const allocated = allocations.reduce((sum, a) => sum.plus(a.amount), ZERO);
        return { ...invoice, allocatedAmount: allocated.toFixed(2), remainingAmount: dec(invoice.taxInclusiveAmount).minus(allocated).toFixed(2), sameContract: Boolean(resolved.contractId && invoice.contractId === resolved.contractId) };
      })
      .filter(item => Number(item.remainingAmount) > 0)
      .sort((a, b) => Number(b.sameContract) - Number(a.sameContract));
  }

  // ───────────── 发票台账 ─────────────

  async ledger(query: InvoiceLedgerQuery, userId: string) {
    const direction = this.direction(query.direction);
    const scope = await this.invoiceScope(userId, 'view');
    const search = query.search?.trim();
    const and: Prisma.InvoiceRecordWhereInput[] = [scope, { direction }];
    if (query.sourceType) and.push({ sourceType: query.sourceType });
    if (query.status) and.push({ status: query.status });
    if (query.contractId) and.push({ contractId: query.contractId });
    if (query.businessUnitId) and.push({ businessUnitId: query.businessUnitId });
    if (query.from || query.to) and.push({ issuedAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000+08:00`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999+08:00`) } : {}) } });
    if (search) and.push({ OR: [
      { invoiceNo: { contains: search, mode: 'insensitive' } },
      { invoiceCode: { contains: search, mode: 'insensitive' } },
      { materialName: { contains: search, mode: 'insensitive' } },
      { seller: { name: { contains: search, mode: 'insensitive' } } },
      { buyer: { name: { contains: search, mode: 'insensitive' } } },
      { contract: { is: { contractNo: { contains: search, mode: 'insensitive' } } } },
      { allocations: { some: { reversedAt: null, OR: [
        { settlement: { is: { settlementNo: { contains: search, mode: 'insensitive' } } } },
        { logisticsSettlement: { is: { settlementNo: { contains: search, mode: 'insensitive' } } } },
      ] } } },
    ] });

    const rows = await this.prisma.invoiceRecord.findMany({
      where: { AND: and },
      include: {
        creator: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } },
        contract: { select: { id: true, contractNo: true, title: true } }, businessUnit: { select: { id: true, name: true } },
        allocations: {
          where: ACTIVE_ALLOCATION,
          select: { id: true, amount: true, quantity: true, settlement: { select: { id: true, settlementNo: true } }, logisticsSettlement: { select: { id: true, settlementNo: true } } },
        },
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const result = rows.map(({ allocations, ...row }) => ({
      ...row,
      ...this.allocationSummary(row.taxInclusiveAmount, allocations, row.status),
      targets: allocations.map(a => a.settlement
        ? { kind: 'SETTLEMENT' as const, id: a.settlement.id, no: a.settlement.settlementNo, amount: dec(a.amount).toFixed(2) }
        : { kind: 'LOGISTICS_SETTLEMENT' as const, id: a.logisticsSettlement!.id, no: a.logisticsSettlement!.settlementNo, amount: dec(a.amount).toFixed(2) }),
    }));
    return query.allocation ? result.filter(row => row.status === 'ACTIVE' && row.allocationState === query.allocation) : result;
  }

  /** 已确认（复核）结算依据的到票核对与票款差；含已匹配行，由页面按需过滤。 */
  async pending(query: { direction?: string }, userId: string) {
    const direction = this.direction(query.direction);
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const goods = await this.prisma.financialSettlement.findMany({
      where: { deletedAt: null, direction: direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE', status: { in: CONFIRMED_SETTLEMENT }, contract: contractScope },
      select: {
        id: true, settlementNo: true, quantity: true, totalAmount: true, settledAmount: true, confirmedAt: true,
        contract: { select: { id: true, contractNo: true, title: true } },
        counterparty: { select: { id: true, name: true } }, legalEntity: { select: { id: true, name: true } },
        businessUnit: { select: { id: true, name: true } },
        invoiceAllocations: { where: ACTIVE_ALLOCATION, select: { quantity: true, amount: true } },
      },
      orderBy: { confirmedAt: 'desc' },
    });
    const rows: Array<Record<string, unknown> & { state: InvoiceMatchState; sortAt: Date | null }> = goods.map(item => ({
      sourceType: 'GOODS', source: { kind: 'SETTLEMENT', id: item.id, no: item.settlementNo },
      contract: item.contract, businessUnit: item.businessUnit,
      seller: direction === 'INPUT' ? item.counterparty : item.legalEntity,
      buyer: direction === 'INPUT' ? item.legalEntity : item.counterparty,
      confirmedAt: item.confirmedAt, sortAt: item.confirmedAt,
      ...matchInvoices({ settlementQuantity: item.quantity, settlementAmount: item.totalAmount, paidAmount: item.settledAmount, allocations: item.invoiceAllocations, compareQuantity: true }),
    }));

    if (direction === 'INPUT') {
      const freightScope = await this.accessControl.getLogisticsPaymentScope(userId, 'settlement.view');
      const freight = await this.prisma.logisticsSettlement.findMany({
        where: { AND: [freightScope, { status: 'REVIEWED' }] },
        select: {
          id: true, settlementNo: true, totalAmount: true, reviewedAt: true, carrierPartnerId: true, payerPartnerId: true, businessUnitId: true,
          invoiceAllocations: { where: ACTIVE_ALLOCATION, select: { quantity: true, amount: true } },
          paymentAllocations: { where: { reversedAt: null }, select: { amount: true } },
        },
      });
      const partners = await this.partnerNames(freight.flatMap(item => [item.carrierPartnerId, item.payerPartnerId]));
      const units = await this.businessUnitNames(freight.map(item => item.businessUnitId));
      for (const item of freight) rows.push({
        sourceType: 'FREIGHT', source: { kind: 'LOGISTICS_SETTLEMENT', id: item.id, no: item.settlementNo },
        contract: null, businessUnit: item.businessUnitId ? units.get(item.businessUnitId) || null : null,
        seller: item.carrierPartnerId ? partners.get(item.carrierPartnerId) || null : null,
        buyer: item.payerPartnerId ? partners.get(item.payerPartnerId) || null : null,
        confirmedAt: item.reviewedAt, sortAt: item.reviewedAt,
        ...matchInvoices({
          settlementQuantity: null, settlementAmount: item.totalAmount, compareQuantity: false, allocations: item.invoiceAllocations,
          paidAmount: item.paymentAllocations.reduce((sum, a) => sum.plus(a.amount), ZERO),
        }),
      });
    }
    return rows
      .sort((a, b) => (b.sortAt?.getTime() || 0) - (a.sortAt?.getTime() || 0))
      .map(({ sortAt, ...row }) => row);
  }

  /**
   * 合同维度的到票汇总，供应付/应收台账展示：
   * allocatedAmount = 已分摊到本合同结算单的发票金额；unallocatedAmount = 归属本合同、尚未分摊的发票余额。
   */
  async contractSummary(query: { direction?: string }, userId: string) {
    const direction = this.direction(query.direction);
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const [allocations, invoices] = await Promise.all([
      this.prisma.invoiceAllocation.findMany({
        where: { reversedAt: null, invoice: { direction, sourceType: 'GOODS' }, settlement: { is: { deletedAt: null, contract: scope } } },
        select: { amount: true, settlement: { select: { contractId: true } } },
      }),
      this.prisma.invoiceRecord.findMany({
        where: { direction, sourceType: 'GOODS', status: 'ACTIVE', contract: { is: scope } },
        select: { contractId: true, taxInclusiveAmount: true, allocations: { where: ACTIVE_ALLOCATION, select: { amount: true } } },
      }),
    ]);
    const map = new Map<string, { allocated: Prisma.Decimal; unallocated: Prisma.Decimal }>();
    const entry = (id: string) => { if (!map.has(id)) map.set(id, { allocated: ZERO, unallocated: ZERO }); return map.get(id)!; };
    for (const a of allocations) { const e = entry(a.settlement!.contractId); e.allocated = e.allocated.plus(a.amount); }
    for (const invoice of invoices) {
      const remaining = dec(invoice.taxInclusiveAmount).minus(invoice.allocations.reduce((sum, a) => sum.plus(a.amount), ZERO));
      if (remaining.gt(0)) { const e = entry(invoice.contractId!); e.unallocated = e.unallocated.plus(remaining); }
    }
    return [...map.entries()].map(([contractId, value]) => ({ contractId, allocatedAmount: value.allocated.toFixed(2), unallocatedAmount: value.unallocated.toFixed(2) }));
  }

  /** 登记发票时的选项：可选合同；运费发票可选的承运方、付款主体和事业部。 */
  async options(query: { direction?: string }, userId: string) {
    const direction = this.direction(query.direction);
    const result: { contracts: unknown[]; carriers: unknown[]; payers: unknown[]; businessUnits: unknown[] } = { contracts: [], carriers: [], payers: [], businessUnits: [] };
    if (await this.can(userId, 'settlement.create')) {
      const scope = await this.accessControl.getContractScope(userId, 'settlement.create');
      const contracts = await this.prisma.contract.findMany({
        where: { deletedAt: null, status: { in: EFFECTIVE_CONTRACT }, type: { in: direction === 'INPUT' ? ['PURCHASE', 'BILATERAL'] : ['SALES', 'BILATERAL'] }, AND: [scope] },
        select: { id: true, contractNo: true, title: true, type: true, sellerId: true, buyerId: true, signingPartnerId: true, seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } }, signingPartner: { select: { id: true, name: true } }, businessUnit: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      result.contracts = contracts.map(({ seller, buyer, signingPartner, sellerId, buyerId, signingPartnerId, ...contract }) => {
        const counterpartyId = this.counterpartyOf({ sellerId, buyerId, signingPartnerId }, direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE');
        const counterparty = [seller, buyer].find(partner => partner?.id === counterpartyId) || null;
        return { ...contract, ourEntity: signingPartner, counterparty, seller: direction === 'INPUT' ? counterparty : signingPartner, buyer: direction === 'INPUT' ? signingPartner : counterparty };
      });
    }
    if (direction === 'INPUT') {
      const scope = await this.freightScope(userId, 'create').catch(() => null);
      if (scope) {
        const settlements = await this.prisma.logisticsSettlement.findMany({ where: { AND: [scope, { status: { not: 'VOIDED' } }] }, select: { carrierPartnerId: true, payerPartnerId: true, businessUnitId: true } });
        const partners = await this.partnerNames(settlements.flatMap(item => [item.carrierPartnerId, item.payerPartnerId]));
        const pick = (ids: Array<string | null>) => [...new Set(ids.filter((id): id is string => Boolean(id)))].map(id => partners.get(id)).filter(Boolean);
        result.carriers = pick(settlements.map(item => item.carrierPartnerId));
        result.payers = pick(settlements.map(item => item.payerPartnerId));
        const allowed = await this.businessUnitFilter(userId, 'create', 'FREIGHT');
        result.businessUnits = await this.prisma.businessUnit.findMany({ where: { status: 'ACTIVE', ...(allowed.businessUnitId ? { id: allowed.businessUnitId } : {}) }, select: { id: true, name: true }, orderBy: { code: 'asc' } });
      }
    }
    return result;
  }

  // ───────────── 内部 ─────────────

  private direction(value?: string): Direction {
    if (value !== 'INPUT' && value !== 'OUTPUT') throw new BadRequestException('请指定发票方向：INPUT 进项或 OUTPUT 销项');
    return value;
  }

  private counterpartyOf(contract: { sellerId: string | null; buyerId: string | null; signingPartnerId: string | null }, settlementDirection: 'PAYABLE' | 'RECEIVABLE') {
    if (!contract.signingPartnerId) return null;
    if (settlementDirection === 'PAYABLE') return contract.sellerId && contract.sellerId !== contract.signingPartnerId ? contract.sellerId : contract.buyerId;
    return contract.buyerId && contract.buyerId !== contract.signingPartnerId ? contract.buyerId : contract.sellerId;
  }

  private async can(userId: string, permission: string) {
    try { await this.accessControl.assertPermission(userId, permission); return true; } catch { return false; }
  }

  /** 运费发票按事业部控制数据范围；管理员不受限。 */
  private async businessUnitFilter(userId: string, access: Access, _source: 'FREIGHT'): Promise<{ businessUnitId?: { in: string[] } }> {
    const permissions = [FINANCE_PERMISSION[access], LOGISTICS_PERMISSION[access]];
    const ids = new Set<string>();
    let granted = false;
    for (const permission of permissions) {
      if (!(await this.can(userId, permission))) continue;
      granted = true;
      const scope = await this.accessControl.getContractScope(userId, permission).catch(() => null);
      if (scope && Object.keys(scope).length === 0) return {}; // 管理员
      for (const unit of await this.accessControl.getBusinessUnitOptions(userId, permission)) ids.add(unit.id);
    }
    if (!granted) throw new ForbiddenException(`缺少权限：${permissions.join(' 或 ')}`);
    return { businessUnitId: { in: [...ids] } };
  }

  /** 发票的数据范围：货款发票随归属合同；运费发票随事业部。 */
  private async invoiceScope(userId: string, access: Access): Promise<Prisma.InvoiceRecordWhereInput> {
    const ors: Prisma.InvoiceRecordWhereInput[] = [];
    const financePermission = FINANCE_PERMISSION[access];
    if (await this.can(userId, financePermission)) {
      ors.push({ sourceType: 'GOODS', contract: { is: await this.accessControl.getContractScope(userId, financePermission) } });
    }
    const freight = await this.businessUnitFilter(userId, access, 'FREIGHT').catch(() => null);
    if (freight) ors.push({ sourceType: 'FREIGHT', ...freight });
    if (!ors.length) throw new ForbiddenException(`缺少权限：${financePermission}`);
    return { OR: ors };
  }

  private async findInvoice(id: string, userId: string, access: Access) {
    const invoice = await this.prisma.invoiceRecord.findFirst({ where: { AND: [{ id }, await this.invoiceScope(userId, access)] } });
    if (!invoice) throw new NotFoundException('发票不存在或无权访问');
    return invoice;
  }

  /** 物流结算单：物流结算人员按物流权限、财务人员按资金结算权限访问，数据范围分别继承各自口径。 */
  private async freightScope(userId: string, access: Access): Promise<Prisma.LogisticsSettlementWhereInput> {
    const scopes: Prisma.LogisticsSettlementWhereInput[] = [];
    if (await this.can(userId, LOGISTICS_PERMISSION[access])) scopes.push(await this.accessControl.getLogisticsSettlementScope(userId, LOGISTICS_PERMISSION[access]));
    if (await this.can(userId, FINANCE_PERMISSION[access])) scopes.push(await this.accessControl.getLogisticsPaymentScope(userId, FINANCE_PERMISSION[access]));
    if (!scopes.length) throw new ForbiddenException(`缺少权限：${LOGISTICS_PERMISSION[access]} 或 ${FINANCE_PERMISSION[access]}`);
    return { OR: scopes };
  }

  private async findFreight(id: string, userId: string, access: Access) {
    const item = await this.prisma.logisticsSettlement.findFirst({ where: { AND: [{ id, deletedAt: null }, await this.freightScope(userId, access)] } });
    if (!item) throw new NotFoundException('物流结算单不存在或无权访问');
    return item;
  }

  private async freightPaid(logisticsSettlementId: string) {
    const rows = await this.prisma.logisticsPaymentAllocation.findMany({ where: { logisticsSettlementId, reversedAt: null }, select: { amount: true } });
    return rows.reduce((sum, row) => sum.plus(row.amount), ZERO);
  }

  private async resolveTarget(db: Db, target: { settlementId?: string; logisticsSettlementId?: string }): Promise<Target> {
    if (target.settlementId) {
      const s = await db.financialSettlement.findFirst({ where: { id: target.settlementId, deletedAt: null } });
      if (!s) throw new NotFoundException('结算单不存在');
      const direction: Direction = s.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT';
      return {
        kind: 'SETTLEMENT', id: s.id, no: s.settlementNo, sourceType: 'GOODS', direction,
        sellerPartnerId: direction === 'INPUT' ? s.counterpartyId : s.legalEntityPartnerId,
        buyerPartnerId: direction === 'INPUT' ? s.legalEntityPartnerId : s.counterpartyId,
        amount: dec(s.totalAmount), quantity: s.quantity == null ? null : dec(s.quantity), contractId: s.contractId,
        ready: CONFIRMED_SETTLEMENT.includes(s.status),
      };
    }
    const l = await db.logisticsSettlement.findFirst({ where: { id: target.logisticsSettlementId, deletedAt: null } });
    if (!l) throw new NotFoundException('物流结算单不存在');
    return {
      kind: 'LOGISTICS_SETTLEMENT', id: l.id, no: l.settlementNo, sourceType: 'FREIGHT', direction: 'INPUT',
      sellerPartnerId: l.carrierPartnerId, buyerPartnerId: l.payerPartnerId,
      amount: dec(l.totalAmount), quantity: null, contractId: null, ready: l.status === 'REVIEWED',
    };
  }

  /**
   * 事务内分摊：锁定发票与结算依据行后重新计算余额。
   * `fillRemaining` 用于结算单上登记发票：分摊金额缺省（0）时取发票金额与本单未到票金额的较小者。
   */
  private async allocateInTx(tx: Prisma.TransactionClient, items: InvoiceAllocationItemDto[], userId: string, fillRemaining: boolean) {
    const invoiceIds = [...new Set(items.map(item => item.invoiceId))].sort();
    const settlementIds = [...new Set(items.map(item => item.settlementId).filter((id): id is string => Boolean(id)))].sort();
    const logisticsIds = [...new Set(items.map(item => item.logisticsSettlementId).filter((id): id is string => Boolean(id)))].sort();
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "invoice_records" WHERE id IN (${Prisma.join(invoiceIds)}) ORDER BY id FOR UPDATE`);
    if (settlementIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "financial_settlements" WHERE id IN (${Prisma.join(settlementIds)}) ORDER BY id FOR UPDATE`);
    if (logisticsIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "logistics_settlements" WHERE id IN (${Prisma.join(logisticsIds)}) ORDER BY id FOR UPDATE`);

    const invoices = new Map((await tx.invoiceRecord.findMany({ where: { id: { in: invoiceIds } }, include: { allocations: { where: ACTIVE_ALLOCATION, select: { amount: true, quantity: true } } } })).map(invoice => [invoice.id, {
      invoice,
      usedAmount: invoice.allocations.reduce((sum, a) => sum.plus(a.amount), ZERO),
      usedQuantity: invoice.allocations.reduce((sum, a) => sum.plus(a.quantity ?? 0), ZERO),
    }]));
    const targets = new Map<string, { target: Target; usedAmount: Prisma.Decimal }>();
    for (const item of items) {
      const key = item.settlementId ? `S:${item.settlementId}` : `L:${item.logisticsSettlementId}`;
      if (targets.has(key)) continue;
      const target = await this.resolveTarget(tx, item);
      const used = await tx.invoiceAllocation.findMany({ where: { reversedAt: null, ...(item.settlementId ? { settlementId: item.settlementId } : { logisticsSettlementId: item.logisticsSettlementId }) }, select: { amount: true } });
      targets.set(key, { target, usedAmount: used.reduce((sum, a) => sum.plus(a.amount), ZERO) });
    }

    const created = [];
    for (const item of items) {
      const entry = invoices.get(item.invoiceId);
      if (!entry) throw new NotFoundException('发票不存在');
      const { invoice } = entry;
      const slot = targets.get(item.settlementId ? `S:${item.settlementId}` : `L:${item.logisticsSettlementId}`)!;
      const { target } = slot;
      const label = `${target.kind === 'SETTLEMENT' ? '结算单' : '物流结算单'} ${target.no}`;
      if (invoice.status !== 'ACTIVE') throw new BadRequestException(`发票 ${invoice.invoiceNo} 已作废，不能分摊`);
      if (!target.ready) throw new BadRequestException(`${label} 尚未${target.kind === 'SETTLEMENT' ? '确认' : '复核'}，不能接收发票分摊`);
      if (invoice.sourceType !== target.sourceType) throw new BadRequestException(`发票 ${invoice.invoiceNo} 为${invoice.sourceType === 'FREIGHT' ? '运费' : '货款'}发票，不能分摊到${label}`);
      if (invoice.direction !== target.direction) throw new BadRequestException(`发票 ${invoice.invoiceNo} 的进销项方向与${label}不一致`);
      if (invoice.sellerPartnerId !== target.sellerPartnerId || invoice.buyerPartnerId !== target.buyerPartnerId) throw new BadRequestException(`发票 ${invoice.invoiceNo} 的开票方、收票方与${label}不一致`);

      const invoiceRemaining = dec(invoice.taxInclusiveAmount).minus(entry.usedAmount);
      const targetRemaining = target.amount.minus(slot.usedAmount);
      let amount = dec(item.amount);
      if (fillRemaining && amount.lte(0)) amount = Prisma.Decimal.min(invoiceRemaining, targetRemaining);
      if (amount.lte(0)) throw new BadRequestException(targetRemaining.lte(0) ? `${label} 已全额到票，不能再分摊；如为多张结算单合开的发票，请在发票台账登记后分摊` : '分摊金额必须大于零');
      if (amount.gt(invoiceRemaining)) throw new BadRequestException(`发票 ${invoice.invoiceNo} 可分摊余额为 ${invoiceRemaining.toFixed(2)} 元，本次 ${amount.toFixed(2)} 元超出`);
      if (amount.gt(targetRemaining)) throw new BadRequestException(`${label} 未到票金额为 ${targetRemaining.toFixed(2)} 元，本次 ${amount.toFixed(2)} 元超出`);
      const quantity = item.quantity != null ? dec(item.quantity) : null;
      if (quantity && invoice.quantity != null && entry.usedQuantity.plus(quantity).gt(invoice.quantity)) {
        throw new BadRequestException(`发票 ${invoice.invoiceNo} 可分摊数量为 ${dec(invoice.quantity).minus(entry.usedQuantity).toFixed(3)}，本次数量超出`);
      }

      created.push(await tx.invoiceAllocation.create({ data: {
        invoiceId: invoice.id, settlementId: item.settlementId || null, logisticsSettlementId: item.logisticsSettlementId || null,
        amount, quantity, createdBy: userId,
      } }));
      entry.usedAmount = entry.usedAmount.plus(amount);
      if (quantity) entry.usedQuantity = entry.usedQuantity.plus(quantity);
      slot.usedAmount = slot.usedAmount.plus(amount);
    }
    return created;
  }

  private async allocationsOf(where: Prisma.InvoiceAllocationWhereInput) {
    const rows = await this.prisma.invoiceAllocation.findMany({
      where,
      include: {
        invoice: { select: { id: true, invoiceNo: true, invoiceCode: true, issuedAt: true, materialName: true, taxRate: true, taxInclusiveAmount: true, quantity: true, status: true, contract: { select: { id: true, contractNo: true } } } },
        settlement: { select: { id: true, settlementNo: true, direction: true, contract: { select: { id: true, contractNo: true } } } },
        logisticsSettlement: { select: { id: true, settlementNo: true } },
        creator: { select: { id: true, name: true } },
        reverser: { select: { id: true, name: true } },
      },
      orderBy: [{ reversedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return rows;
  }

  private allocationSummary(invoiceAmount: Prisma.Decimal | string | number, allocations: Array<{ amount: Prisma.Decimal | string | number; reversedAt?: Date | null }>, status = 'ACTIVE') {
    const allocated = allocations.filter(a => !a.reversedAt).reduce((sum, a) => sum.plus(a.amount), ZERO);
    const state: InvoiceAllocationState = allocationState(invoiceAmount, allocated);
    return {
      allocatedAmount: allocated.toFixed(2),
      remainingAmount: dec(invoiceAmount).minus(allocated).toFixed(2),
      allocationState: state,
      allocationStateLabel: status === 'VOIDED' ? '已作废' : INVOICE_ALLOCATION_LABEL[state],
    };
  }

  private async recordData(dto: CreateInvoiceRecordDto, direction: Direction, sellerPartnerId: string, buyerPartnerId: string, userId: string) {
    const invoiceNo = dto.invoiceNo.trim();
    const materialName = dto.materialName.trim();
    if (!invoiceNo || !materialName) throw new BadRequestException('请填写发票号码和品名规格');
    if (dto.quantity != null && dto.quantity <= 0) throw new BadRequestException('发票数量必须大于零');
    const duplicate = await this.prisma.invoiceRecord.findUnique({ where: { direction_sellerPartnerId_invoiceNo: { direction, sellerPartnerId, invoiceNo } } });
    if (duplicate) throw new BadRequestException('同一开票方的该发票号码已登记，请勿重复录入');
    return {
      direction, invoiceNo, invoiceCode: dto.invoiceCode?.trim() || null, issuedAt: new Date(dto.issuedAt),
      sellerPartnerId, buyerPartnerId, materialName,
      quantity: dto.quantity ?? null, unitPrice: dto.unitPrice ?? null, taxRate: dto.taxRate ?? null,
      taxAmount: dto.taxAmount ?? null, taxInclusiveAmount: dto.taxInclusiveAmount,
      remarks: dto.remarks?.trim() || null, createdBy: userId,
    };
  }

  private async partnerNames(ids: Array<string | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const rows = unique.length ? await this.prisma.partner.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } }) : [];
    return new Map(rows.map(row => [row.id, row]));
  }

  private async businessUnitNames(ids: Array<string | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const rows = unique.length ? await this.prisma.businessUnit.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } }) : [];
    return new Map(rows.map(row => [row.id, row]));
  }
}
