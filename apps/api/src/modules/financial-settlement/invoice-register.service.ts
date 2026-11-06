import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { CreateInvoiceRecordDto } from './dto/invoice-record.dto';
import { InvoiceMatchState, matchInvoices } from './invoice-matching';

type Direction = 'INPUT' | 'OUTPUT';
type FreightAccess = 'view' | 'create' | 'reverse';

/** 结算单确认后才形成正式应收应付，才能登记发票。 */
const CONFIRMED_SETTLEMENT = ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'];
const ACTIVE_INVOICE = { status: 'ACTIVE' } as const;
const RECORD_INCLUDE = { creator: { select: { id: true, name: true } } } as const;

export interface InvoiceLedgerQuery {
  direction?: string; sourceType?: string; status?: string; search?: string;
  from?: string; to?: string; businessUnitId?: string;
}

/**
 * 发票登记：
 * - 货款发票挂采购/销售结算单（采购为进项、销售为销项）；
 * - 运费发票挂物流结算单，固定为进项，开票方为承运方；
 * - 发票台账跨结算单查询，并汇总待到票/待开票的结算依据。
 * 仅做数量、金额核对，不生成会计凭证或税务申报数据。
 */
@Injectable()
export class InvoiceRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlements: FinancialSettlementService,
    private readonly accessControl: AccessControlService,
  ) {}

  // ───────────── 货款发票（采购/销售结算单） ─────────────

  async list(settlementId: string, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.view');
    const records = await this.prisma.invoiceRecord.findMany({ where: { settlementId }, include: RECORD_INCLUDE, orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }] });
    const summary = matchInvoices({
      settlementQuantity: settlement.quantity, settlementAmount: settlement.totalAmount, compareQuantity: true,
      invoices: records.filter(record => record.status === 'ACTIVE'),
    });
    return { records, summary: { direction: settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT', ...summary } };
  }

  async create(settlementId: string, dto: CreateInvoiceRecordDto, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.create');
    if (!CONFIRMED_SETTLEMENT.includes(settlement.status)) throw new BadRequestException('结算单确认后才能登记发票');
    const direction: Direction = settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT';
    const sellerPartnerId = direction === 'INPUT' ? settlement.counterpartyId : settlement.legalEntityPartnerId;
    const buyerPartnerId = direction === 'INPUT' ? settlement.legalEntityPartnerId : settlement.counterpartyId;
    const data = await this.recordData(dto, direction, sellerPartnerId, buyerPartnerId, userId);
    return this.prisma.invoiceRecord.create({ data: { ...data, sourceType: 'GOODS', settlementId, contractId: settlement.contractId } });
  }

  async void(settlementId: string, invoiceId: string, reason: string, userId: string) {
    await this.settlements.findOne(settlementId, userId, 'settlement.reverse');
    return this.voidRecord({ id: invoiceId, settlementId }, reason, userId);
  }

  // ───────────── 运费发票（物流结算单） ─────────────

  async listFreight(logisticsSettlementId: string, userId: string) {
    const settlement = await this.findFreight(logisticsSettlementId, userId, 'view');
    const records = await this.prisma.invoiceRecord.findMany({ where: { logisticsSettlementId }, include: RECORD_INCLUDE, orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }] });
    const summary = matchInvoices({
      settlementQuantity: null, settlementAmount: settlement.totalAmount, compareQuantity: false,
      invoices: records.filter(record => record.status === 'ACTIVE'),
    });
    return { records, summary: { direction: 'INPUT' as const, ...summary } };
  }

  async createFreight(logisticsSettlementId: string, dto: CreateInvoiceRecordDto, userId: string) {
    const settlement = await this.findFreight(logisticsSettlementId, userId, 'create');
    if (settlement.status !== 'REVIEWED') throw new BadRequestException('物流结算单复核后才能登记运费发票');
    if (!settlement.carrierPartnerId) throw new BadRequestException('物流结算单未记录承运方，不能确定开票方，请先补齐承运方');
    if (!settlement.payerPartnerId) throw new BadRequestException('物流结算单未记录付款主体，不能确定收票方，请先补齐付款主体');
    const data = await this.recordData(dto, 'INPUT', settlement.carrierPartnerId, settlement.payerPartnerId, userId);
    return this.prisma.invoiceRecord.create({ data: { ...data, sourceType: 'FREIGHT', logisticsSettlementId } });
  }

  async voidFreight(logisticsSettlementId: string, invoiceId: string, reason: string, userId: string) {
    await this.findFreight(logisticsSettlementId, userId, 'reverse');
    return this.voidRecord({ id: invoiceId, logisticsSettlementId }, reason, userId);
  }

  // ───────────── 发票台账 ─────────────

  async ledger(query: InvoiceLedgerQuery, userId: string) {
    const direction = this.direction(query.direction);
    const scope = await this.ledgerScope(direction, userId);
    const search = query.search?.trim();
    const and: Prisma.InvoiceRecordWhereInput[] = [scope, { direction }];
    if (query.sourceType) and.push({ sourceType: query.sourceType });
    if (query.status) and.push({ status: query.status });
    if (query.from || query.to) and.push({ issuedAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000+08:00`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999+08:00`) } : {}) } });
    if (query.businessUnitId) and.push({ OR: [{ settlement: { is: { businessUnitId: query.businessUnitId } } }, { logisticsSettlement: { is: { businessUnitId: query.businessUnitId } } }] });
    if (search) and.push({ OR: [
      { invoiceNo: { contains: search, mode: 'insensitive' } },
      { invoiceCode: { contains: search, mode: 'insensitive' } },
      { materialName: { contains: search, mode: 'insensitive' } },
      { seller: { name: { contains: search, mode: 'insensitive' } } },
      { buyer: { name: { contains: search, mode: 'insensitive' } } },
      { contract: { is: { contractNo: { contains: search, mode: 'insensitive' } } } },
      { settlement: { is: { settlementNo: { contains: search, mode: 'insensitive' } } } },
      { logisticsSettlement: { is: { settlementNo: { contains: search, mode: 'insensitive' } } } },
    ] });

    const rows = await this.prisma.invoiceRecord.findMany({
      where: { AND: and },
      include: {
        ...RECORD_INCLUDE,
        seller: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true } },
        contract: { select: { id: true, contractNo: true, title: true } },
        settlement: { select: { id: true, settlementNo: true, businessUnit: { select: { id: true, name: true } } } },
        logisticsSettlement: { select: { id: true, settlementNo: true, businessUnitId: true } },
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const units = await this.businessUnitNames(rows.map(row => row.logisticsSettlement?.businessUnitId));
    return rows.map(({ logisticsSettlement, settlement, ...row }) => ({
      ...row,
      source: settlement
        ? { kind: 'SETTLEMENT' as const, id: settlement.id, no: settlement.settlementNo }
        : { kind: 'LOGISTICS_SETTLEMENT' as const, id: logisticsSettlement!.id, no: logisticsSettlement!.settlementNo },
      businessUnit: settlement?.businessUnit || (logisticsSettlement?.businessUnitId ? units.get(logisticsSettlement.businessUnitId) || null : null),
    }));
  }

  /** 已确认（复核）但发票未登记全或存在差异的结算依据；含已匹配行，由页面按需过滤。 */
  async pending(query: { direction?: string }, userId: string) {
    const direction = this.direction(query.direction);
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const goods = await this.prisma.financialSettlement.findMany({
      where: { deletedAt: null, direction: direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE', status: { in: CONFIRMED_SETTLEMENT }, contract: contractScope },
      select: {
        id: true, settlementNo: true, quantity: true, totalAmount: true, confirmedAt: true,
        contract: { select: { id: true, contractNo: true, title: true } },
        counterparty: { select: { id: true, name: true } }, legalEntity: { select: { id: true, name: true } },
        businessUnit: { select: { id: true, name: true } },
        invoiceRecords: { where: ACTIVE_INVOICE, select: { quantity: true, taxInclusiveAmount: true } },
      },
      orderBy: { confirmedAt: 'desc' },
    });
    const rows: Array<Record<string, unknown> & { state: InvoiceMatchState; sortAt: Date | null }> = goods.map(item => ({
      sourceType: 'GOODS', source: { kind: 'SETTLEMENT', id: item.id, no: item.settlementNo },
      contract: item.contract, businessUnit: item.businessUnit,
      seller: direction === 'INPUT' ? item.counterparty : item.legalEntity,
      buyer: direction === 'INPUT' ? item.legalEntity : item.counterparty,
      confirmedAt: item.confirmedAt, sortAt: item.confirmedAt,
      ...matchInvoices({ settlementQuantity: item.quantity, settlementAmount: item.totalAmount, invoices: item.invoiceRecords, compareQuantity: true }),
    }));

    if (direction === 'INPUT') {
      const freightScope = await this.accessControl.getLogisticsPaymentScope(userId, 'settlement.view');
      const freight = await this.prisma.logisticsSettlement.findMany({
        where: { AND: [freightScope, { status: 'REVIEWED' }] },
        select: {
          id: true, settlementNo: true, totalAmount: true, reviewedAt: true, carrierPartnerId: true, payerPartnerId: true, businessUnitId: true,
          invoiceRecords: { where: ACTIVE_INVOICE, select: { quantity: true, taxInclusiveAmount: true } },
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
        ...matchInvoices({ settlementQuantity: null, settlementAmount: item.totalAmount, invoices: item.invoiceRecords, compareQuantity: false }),
      });
    }
    return rows
      .sort((a, b) => (b.sortAt?.getTime() || 0) - (a.sortAt?.getTime() || 0))
      .map(({ sortAt, ...row }) => row);
  }

  // ───────────── 内部 ─────────────

  private direction(value?: string): Direction {
    if (value !== 'INPUT' && value !== 'OUTPUT') throw new BadRequestException('请指定发票方向：INPUT 进项或 OUTPUT 销项');
    return value;
  }

  private async ledgerScope(direction: Direction, userId: string): Promise<Prisma.InvoiceRecordWhereInput> {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const goods: Prisma.InvoiceRecordWhereInput = { sourceType: 'GOODS', settlement: { is: { deletedAt: null, contract: contractScope } } };
    if (direction === 'OUTPUT') return goods;
    const freightScope = await this.accessControl.getLogisticsPaymentScope(userId, 'settlement.view');
    return { OR: [goods, { sourceType: 'FREIGHT', logisticsSettlement: { is: freightScope } }] };
  }

  /** 物流结算人员按物流权限、财务人员按资金结算权限均可处理运费发票，数据范围分别继承各自口径。 */
  private async findFreight(id: string, userId: string, access: FreightAccess) {
    const logisticsPermission = access === 'view' ? 'logistics.settlement.view' : 'logistics.settlement.manage';
    const financePermission = access === 'view' ? 'settlement.view' : access === 'create' ? 'settlement.create' : 'settlement.reverse';
    const scopes: Prisma.LogisticsSettlementWhereInput[] = [];
    if (await this.can(userId, logisticsPermission)) scopes.push(await this.accessControl.getLogisticsSettlementScope(userId, logisticsPermission));
    if (await this.can(userId, financePermission)) scopes.push(await this.accessControl.getLogisticsPaymentScope(userId, financePermission));
    if (!scopes.length) throw new ForbiddenException(`缺少权限：${logisticsPermission} 或 ${financePermission}`);
    const item = await this.prisma.logisticsSettlement.findFirst({ where: { AND: [{ id, deletedAt: null }, { OR: scopes }] } });
    if (!item) throw new NotFoundException('物流结算单不存在或无权访问');
    return item;
  }

  private async can(userId: string, permission: string) {
    try { await this.accessControl.assertPermission(userId, permission); return true; } catch { return false; }
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

  private async voidRecord(where: Prisma.InvoiceRecordWhereInput & { id: string }, reason: string, userId: string) {
    if (!reason.trim()) throw new BadRequestException('请填写发票作废原因');
    const updated = await this.prisma.invoiceRecord.updateMany({
      where: { ...where, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() },
    });
    if (!updated.count) throw new NotFoundException('有效发票记录不存在');
    return this.prisma.invoiceRecord.findUniqueOrThrow({ where: { id: where.id } });
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
