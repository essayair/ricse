import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  AllocateFundDto, CreateFinancialSettlementDto, CreateFundTransactionDto, CreatePaymentRequestDto,
  ExecutePaymentRequestDto, RejectPaymentRequestDto, ReviewPaymentRequestDto, ReverseAllocationDto,
} from './dto/financial-settlement.dto';

const SETTLEMENT_INCLUDE = {
  contract: { select: { id: true, contractNo: true, title: true, type: true, totalAmount: true } },
  businessUnit: { select: { id: true, code: true, name: true } },
  legalEntity: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true, username: true } },
  confirmer: { select: { id: true, name: true, username: true } },
  lines: { orderBy: { createdAt: 'asc' as const } },
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
  paymentRequest: { select: { id: true, requestNo: true, status: true } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  relatedTransaction: { select: { id: true, transactionNo: true, paymentStage: true, amount: true } },
  allocations: {
    include: { settlement: { select: { id: true, settlementNo: true, direction: true, totalAmount: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

const PAYMENT_REQUEST_INCLUDE = {
  contract: { select: { id: true, contractNo: true, title: true, type: true, companyId: true, departmentId: true, businessUnitId: true } },
  settlement: { select: { id: true, settlementNo: true, totalAmount: true, settledAmount: true, status: true } },
  relatedTransaction: { select: { id: true, transactionNo: true, paymentStage: true, amount: true, allocatedAmount: true, refundedAmount: true } },
  businessUnit: { select: { id: true, code: true, name: true } },
  legalEntity: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true } },
  creator: { select: { id: true, name: true, username: true } },
  submitter: { select: { id: true, name: true, username: true } },
  approver: { select: { id: true, name: true, username: true } },
  rejecter: { select: { id: true, name: true, username: true } },
  fundTransaction: { select: { id: true, transactionNo: true, status: true, occurredAt: true, bankReference: true } },
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
const REVERSE_STAGES = ['REFUND', 'GUARANTEE_RETURN'];

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

@Injectable()
export class FinancialSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private async nextNo(prefix: string, table: 'settlement' | 'fund' | 'paymentRequest') {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = table === 'settlement'
      ? await this.prisma.financialSettlement.count({ where: { createdAt: { gte: start } } })
      : table === 'fund'
        ? await this.prisma.fundTransaction.count({ where: { createdAt: { gte: start } } })
        : await this.prisma.paymentRequest.count({ where: { createdAt: { gte: start } } });
    return `${prefix}${date}${String(count + 1).padStart(4, '0')}`;
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
        seller: { select: { id: true, code: true, name: true } },
        buyer: { select: { id: true, code: true, name: true } },
        signingPartner: { select: { id: true, code: true, name: true } },
        businessUnit: { select: { id: true, code: true, name: true } },
        lineItems: { select: { quantity: true, unit: true, totalPrice: true, salesTotalPrice: true } },
      },
    });
    if (!contract) throw new NotFoundException('合同不存在或不在当前数据权限范围内');
    this.assertDirection(contract.type, direction);
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
        seller: { select: { id: true, code: true, name: true } },
        buyer: { select: { id: true, code: true, name: true } },
        signingPartner: { select: { id: true, code: true, name: true } },
        businessUnit: { select: { id: true, code: true, name: true } },
        lineItems: { select: { quantity: true, unit: true, totalPrice: true, salesTotalPrice: true } },
        financialSettlements: { where: { direction, status: { not: 'VOIDED' }, deletedAt: null }, select: { totalAmount: true } },
        fundTransactions: {
          where: { businessType: direction === 'PAYABLE' ? 'PURCHASE' : 'SALES', status: { not: 'VOIDED' } },
          select: { paymentStage: true, direction: true, amount: true, allocatedAmount: true, refundedAmount: true },
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
      return {
        id: contract.id, contractNo: contract.contractNo, title: contract.title, type: contract.type,
        amount, settledTotal, remainingSettleable: money(Math.max(0, amount - settledTotal)), advanceBalance: money(advances),
        quantity: contract.lineItems.reduce((sum, line) => sum + Number(line.quantity), 0),
        unit: units.length === 1 ? units[0] : undefined,
        signingPartner: contract.signingPartner, counterparty, businessUnit: contract.businessUnit,
      };
    }).filter((item) => item.signingPartner && item.counterparty && item.businessUnit);
  }

  async orderOptions(contractId: string, direction: string, userId: string) {
    const contract = await this.accessibleContract(contractId, direction, userId);
    const type = direction === 'PAYABLE' ? 'PURCHASE' : 'SALES';
    const orders = await this.prisma.order.findMany({
      where: { contractId: contract.id, type, status: 'COMPLETED', deletedAt: null },
      include: {
        lineItems: { select: { quantity: true, unit: true, unitPrice: true, totalPrice: true } },
        settlementLines: { where: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } }, select: { quantity: true, totalAmount: true } },
      },
      orderBy: { completedAt: 'desc' },
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

  async create(dto: CreateFinancialSettlementDto, userId: string) {
    const contract = await this.accessibleContract(dto.contractId, dto.direction, userId, 'settlement.create');
    if (!contract.signingPartnerId || !contract.businessUnitId) throw new BadRequestException('合同缺少我方签约主体或业务单元，不能生成结算单');
    const counterpartyId = this.counterpartyId(contract, dto.direction);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方，不能生成结算单');
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
      if (!dto.lines?.length) throw new BadRequestException('按执行批次结算时至少选择一个已完成批次');
      const ids = [...new Set(dto.lines.map((line) => line.orderId))];
      if (ids.length !== dto.lines.length) throw new BadRequestException('同一个执行批次不能重复选择');
      const orders = await this.prisma.order.findMany({
        where: { id: { in: ids }, contractId: contract.id, type: dto.direction === 'PAYABLE' ? 'PURCHASE' : 'SALES', status: 'COMPLETED', deletedAt: null },
        include: {
          lineItems: true,
          settlementLines: { where: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } }, select: { quantity: true, totalAmount: true } },
        },
      });
      if (orders.length !== ids.length) throw new BadRequestException('存在不属于本合同或尚未完成的执行批次');
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

  async confirm(id: string, userId: string) {
    const item = await this.findOne(id, userId, 'settlement.confirm');
    if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的结算单可以确认');
    return this.prisma.financialSettlement.update({ where: { id }, data: { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() }, include: SETTLEMENT_INCLUDE });
  }

  async recordPrint(id: string, userId: string) {
    const item = await this.findOne(id, userId);
    if (item.status === 'DRAFT') throw new BadRequestException('结算单尚未确认，不能作为正式单据打印存档');
    if (item.status === 'VOIDED') throw new BadRequestException('已作废结算单不能打印存档');
    return item;
  }

  async voidSettlement(id: string, userId: string) {
    const item = await this.findOne(id, userId, 'settlement.reverse');
    if (item.status === 'VOIDED') throw new BadRequestException('结算单已作废');
    if (Number(item.settledAmount) > 0 || item.allocations.some((entry) => !entry.reversedAt)) throw new BadRequestException('已有有效核销记录，必须先撤销核销后才能作废');
    return this.prisma.financialSettlement.update({ where: { id }, data: { status: 'VOIDED' }, include: SETTLEMENT_INCLUDE });
  }

  async listFunds(query: { businessType?: string; direction?: string; contractId?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.view');
    return this.prisma.fundTransaction.findMany({
      where: { contract: contractScope, ...(query.businessType ? { businessType: query.businessType } : {}), ...(query.direction ? { direction: query.direction } : {}), ...(query.contractId ? { contractId: query.contractId } : {}) },
      include: FUND_INCLUDE, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findFund(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const item = await this.prisma.fundTransaction.findFirst({ where: { id, contract: scope }, include: FUND_INCLUDE });
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
    const scope = await this.accessControl.getContractScope(userId, 'settlement.view');
    return this.prisma.paymentRequest.findMany({
      where: {
        contract: scope,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { OR: [
          { requestNo: { contains: query.search, mode: 'insensitive' } },
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
  ) {
    if (target.fundTransactionId) {
      const fund = await this.prisma.fundTransaction.findUnique({ where: { id: target.fundTransactionId }, select: { direction: true } });
      if (!fund) throw new NotFoundException('资金单不存在');
      const permission = fund.direction === 'RECEIPT' ? 'settlement.receipt.register' : 'settlement.payment.execute';
      await this.accessControl.assertPermission(userId, permission);
      const scope = await this.accessControl.getContractScope(userId, permission);
      const accessible = await this.prisma.fundTransaction.findFirst({ where: { id: target.fundTransactionId, contract: scope }, select: { id: true } });
      if (!accessible) throw new NotFoundException('资金单不存在或无权访问');
    } else if (target.paymentRequestId) {
      await this.findPaymentRequest(target.paymentRequestId, userId, 'settlement.payment.apply');
    } else {
      throw new BadRequestException('附件缺少关联单据');
    }
    return this.prisma.attachment.create({ data: { ...target, ...data, uploadedBy: userId, sourceType: 'WEB_UPLOAD' } });
  }

  async findDocumentAttachment(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.view');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.view');
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, OR: [{ fundTransaction: { contract: scope } }, { paymentRequest: { contract: scope } }] },
    });
    if (!attachment) throw new NotFoundException('附件不存在或无权访问');
    return attachment;
  }

  async deleteDocumentAttachment(id: string, userId: string) {
    const attachment = await this.findDocumentAttachment(id, userId);
    if (attachment.fundTransactionId) {
      const fund = await this.prisma.fundTransaction.findUnique({ where: { id: attachment.fundTransactionId }, select: { direction: true, status: true } });
      if (!fund || !['PENDING_CLAIM', 'PENDING_CONFIRMATION'].includes(fund.status)) throw new BadRequestException('已确认资金单的附件不能删除');
      await this.accessControl.assertPermission(userId, fund.direction === 'RECEIPT' ? 'settlement.receipt.register' : 'settlement.payment.execute');
    } else if (attachment.paymentRequestId) {
      const request = await this.findPaymentRequest(attachment.paymentRequestId, userId, 'settlement.payment.apply');
      if (!['DRAFT', 'REJECTED'].includes(request.status)) throw new BadRequestException('已提交付款申请的附件不能删除');
    }
    await this.prisma.attachment.delete({ where: { id } });
    return attachment;
  }

  async findPaymentRequest(id: string, userId: string, permission = 'settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getContractScope(userId, permission);
    const item = await this.prisma.paymentRequest.findFirst({ where: { id, contract: scope }, include: PAYMENT_REQUEST_INCLUDE });
    if (!item) throw new NotFoundException('付款申请不存在或无权访问');
    return item;
  }

  async createPaymentRequest(dto: CreatePaymentRequestDto, userId: string) {
    const reverse = REVERSE_STAGES.includes(dto.paymentStage);
    if (dto.businessType === 'PURCHASE' && reverse) throw new BadRequestException('供应商退款属于收款，应在收款管理中登记');
    if (dto.businessType === 'SALES' && !reverse) throw new BadRequestException('销售正常货款属于收款；只有客户退款或保证金退回需要付款申请');
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const settlementDirection = this.directionForBusinessType(dto.businessType);
    const contract = await this.accessibleContract(dto.contractId, settlementDirection, userId, 'settlement.payment.apply');
    if (!contract.signingPartnerId || !contract.businessUnitId) throw new BadRequestException('合同缺少我方签约主体或业务单元');
    const counterpartyId = this.counterpartyId(contract, settlementDirection);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方');
    let settlement: { id: string; totalAmount: Prisma.Decimal; settledAmount: Prisma.Decimal; status: string } | null = null;
    if (dto.settlementId) {
      if (dto.businessType !== 'PURCHASE') throw new BadRequestException('客户退款不关联应付结算单，请选择原收款单');
      settlement = await this.prisma.financialSettlement.findFirst({
        where: { id: dto.settlementId, contractId: contract.id, direction: 'PAYABLE', status: { in: ['CONFIRMED', 'PARTIALLY_SETTLED'] }, deletedAt: null },
        select: { id: true, totalAmount: true, settledAmount: true, status: true },
      });
      if (!settlement) throw new BadRequestException('应付结算单不存在、已结清或不属于当前合同');
      const active = await this.prisma.paymentRequest.aggregate({
        where: { settlementId: settlement.id, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } }, _sum: { amount: true },
      });
      const available = money(Number(settlement.totalAmount) - Number(settlement.settledAmount) - Number(active._sum.amount || 0));
      if (dto.amount > available) throw new BadRequestException(`付款申请金额超过应付结算单可申请余额 ${available.toFixed(2)} 元`);
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
        where: { relatedTransactionId: relatedTransaction.id, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } },
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
        contractId: contract.id, settlementId: settlement?.id, relatedTransactionId: relatedTransaction?.id, businessUnitId: contract.businessUnitId,
        legalEntityPartnerId: contract.signingPartnerId, counterpartyId, amount: dto.amount,
        requestedPayDate: dto.requestedPayDate ? new Date(dto.requestedPayDate) : null,
        ourBankAccount: dto.ourBankAccount?.trim(), counterpartyBankAccount: dto.counterpartyBankAccount?.trim(),
        actualPayeeName: dto.actualPayeeName?.trim() || counterparty?.name,
        isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim(),
        purpose: dto.purpose?.trim(), remarks: dto.remarks?.trim(), createdBy: userId,
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

    const companyId = request.contract?.companyId || null;
    const departmentId = request.contract?.departmentId || null;
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

  async submitPaymentRequest(id: string, userId: string) {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.apply');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (!['DRAFT', 'REJECTED'].includes(item.status)) throw new BadRequestException('只有草稿或已驳回的付款申请可以提交');
    if (item.isThirdParty && !item.thirdPartyReason?.trim()) throw new BadRequestException('第三方收款必须填写原因');
    const plan = await this.resolvePaymentApprovalPlan(this.prisma, item, access.isAdmin);
    return this.prisma.$transaction(async (tx) => {
      await this.assignPaymentApprovals(tx, id, plan);
      return tx.paymentRequest.update({
        where: { id },
        data: {
          status: 'PENDING_APPROVAL', submittedBy: userId, submittedAt: new Date(),
          approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null,
        },
        include: PAYMENT_REQUEST_INCLUDE,
      });
    });
  }

  async approvePaymentRequest(id: string, dto: ReviewPaymentRequestDto, userId: string) {
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    if (item.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批付款申请可以批准');
    return this.prisma.$transaction(async (tx) => {
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

  async rejectPaymentRequest(id: string, dto: RejectPaymentRequestDto, userId: string) {
    if (!dto.reason.trim()) throw new BadRequestException('请填写驳回原因');
    const access = await this.accessControl.assertPermission(userId, 'settlement.payment.approve');
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.approve');
    if (item.status !== 'PENDING_APPROVAL') throw new BadRequestException('只有待审批付款申请可以驳回');
    return this.prisma.$transaction(async (tx) => {
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

  async voidPaymentRequest(id: string, userId: string) {
    const item = await this.findPaymentRequest(id, userId, 'settlement.payment.apply');
    if (item.status === 'PAID') throw new BadRequestException('已经创建付款单的申请不能作废，请按资金冲销流程处理');
    if (item.status === 'VOIDED') throw new BadRequestException('付款申请已作废');
    return this.prisma.$transaction(async (tx) => {
      await tx.paymentRequestApproval.updateMany({
        where: { paymentRequestId: id, status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'CANCELLED' },
      });
      return tx.paymentRequest.update({ where: { id }, data: { status: 'VOIDED' }, include: PAYMENT_REQUEST_INCLUDE });
    });
  }

  async executePaymentRequest(id: string, dto: ExecutePaymentRequestDto, userId: string) {
    const request = await this.findPaymentRequest(id, userId, 'settlement.payment.execute');
    if (request.status !== 'APPROVED') throw new BadRequestException('只有已批准付款申请可以创建付款单');
    if (request.fundTransaction) throw new BadRequestException('该付款申请已经生成付款单');
    if (dto.isThirdParty !== undefined && dto.isThirdParty !== request.isThirdParty) throw new BadRequestException('实际收款方性质与审批内容不一致，请重新发起付款申请');
    if (dto.actualPayeeName?.trim() && dto.actualPayeeName.trim() !== request.actualPayeeName) throw new BadRequestException('实际收款方与审批内容不一致，请重新发起付款申请');
    if (dto.bankReference?.trim()) {
      const duplicate = await this.prisma.fundTransaction.findFirst({
        where: { direction: 'PAYMENT', bankReference: dto.bankReference.trim(), amount: request.amount, status: { not: 'VOIDED' } },
      });
      if (duplicate) throw new BadRequestException(`银行流水可能重复，已存在 ${duplicate.transactionNo}`);
    }
    const transactionNo = await this.nextNo('FK', 'fund');
    return this.prisma.$transaction(async (tx) => {
      const fund = await tx.fundTransaction.create({
        data: {
          transactionNo, direction: 'PAYMENT', category: request.paymentStage === 'ADVANCE' ? 'ADVANCE' : REVERSE_STAGES.includes(request.paymentStage) ? 'REFUND' : 'NORMAL',
          businessType: request.businessType, paymentStage: request.paymentStage, paymentMethod: request.paymentMethod,
          contractId: request.contractId, legalEntityPartnerId: request.legalEntityPartnerId, counterpartyId: request.counterpartyId,
          status: 'PENDING_CONFIRMATION', amount: request.amount, occurredAt: new Date(dto.occurredAt),
          bankReference: dto.bankReference?.trim(), ourBankAccount: dto.ourBankAccount?.trim() || request.ourBankAccount,
          counterpartyBankAccount: dto.counterpartyBankAccount?.trim() || request.counterpartyBankAccount,
          actualPayerName: request.legalEntity.name, actualPayeeName: request.actualPayeeName || request.counterparty.name,
          isThirdParty: request.isThirdParty, thirdPartyReason: request.thirdPartyReason,
          instrumentNo: dto.instrumentNo?.trim(), instrumentDueDate: dto.instrumentDueDate ? new Date(dto.instrumentDueDate) : null,
          relatedTransactionId: request.relatedTransactionId, paymentRequestId: request.id, remarks: dto.remarks?.trim(), createdBy: userId,
        },
        include: FUND_INCLUDE,
      });
      await tx.paymentRequest.update({ where: { id }, data: { status: 'PAID' } });
      return fund;
    });
  }

  async createFund(dto: CreateFundTransactionDto, userId: string) {
    const settlementDirection = this.directionForBusinessType(dto.businessType);
    const reverse = REVERSE_STAGES.includes(dto.paymentStage);
    const baseDirection = dto.businessType === 'PURCHASE' ? 'PAYMENT' : 'RECEIPT';
    const direction = reverse ? (baseDirection === 'PAYMENT' ? 'RECEIPT' : 'PAYMENT') : baseDirection;
    if (direction === 'PAYMENT') throw new BadRequestException('实际付款必须从已审批的付款申请执行');
    const contract = await this.accessibleContract(dto.contractId, settlementDirection, userId, 'settlement.receipt.register');
    if (!contract.signingPartnerId) throw new BadRequestException('合同缺少我方签约主体，不能登记资金');
    const counterpartyId = this.counterpartyId(contract, settlementDirection);
    if (!counterpartyId) throw new BadRequestException('合同缺少交易对手方，不能登记资金');
    if (dto.isThirdParty && !dto.thirdPartyReason?.trim()) throw new BadRequestException('第三方收付款必须填写原因');
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
        where: { id: dto.relatedTransactionId, contractId: contract.id, businessType: dto.businessType, direction: baseDirection, status: { not: 'VOIDED' } },
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
    const legalEntityName = contract.signingPartner?.name || '';
    const counterparty = counterpartyId === contract.sellerId ? contract.seller : contract.buyer;
    return this.prisma.fundTransaction.create({
      data: {
        transactionNo, direction, category, businessType: dto.businessType, paymentStage: dto.paymentStage,
        paymentMethod: dto.paymentMethod, contractId: contract.id, legalEntityPartnerId: contract.signingPartnerId, counterpartyId,
        status: 'PENDING_CLAIM', amount: dto.amount, occurredAt: new Date(dto.occurredAt), relatedTransactionId: original?.id,
        bankReference: dto.bankReference?.trim(), ourBankAccount: dto.ourBankAccount?.trim(),
        counterpartyBankAccount: dto.counterpartyBankAccount?.trim(), instrumentNo: dto.instrumentNo?.trim(),
        instrumentDueDate: dto.instrumentDueDate ? new Date(dto.instrumentDueDate) : null,
        actualPayerName: dto.actualPayerName?.trim() || counterparty?.name,
        actualPayeeName: dto.actualPayeeName?.trim() || legalEntityName,
        isThirdParty: !!dto.isThirdParty, thirdPartyReason: dto.thirdPartyReason?.trim(),
        remarks: dto.remarks?.trim(), createdBy: userId,
      },
      include: FUND_INCLUDE,
    });
  }

  async claimFund(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.receipt.claim');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.receipt.claim');
    const fund = await this.prisma.fundTransaction.findFirst({ where: { id, direction: 'RECEIPT', status: 'PENDING_CLAIM', contract: scope } });
    if (!fund) throw new NotFoundException('待认领收款不存在或不在当前数据权限范围内');
    return this.prisma.fundTransaction.update({
      where: { id }, data: { status: 'PENDING_CONFIRMATION', claimedBy: userId, claimedAt: new Date() }, include: FUND_INCLUDE,
    });
  }

  async confirmFund(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.fund.confirm');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.fund.confirm');
    const fund = await this.prisma.fundTransaction.findFirst({
      where: { id, status: 'PENDING_CONFIRMATION', contract: scope }, include: { relatedTransaction: true, attachments: { select: { id: true } } },
    });
    if (!fund) throw new NotFoundException('待确认资金单不存在或不在当前数据权限范围内');
    if (!fund.attachments.length) throw new BadRequestException('财务确认前请先上传银行回单或资金凭证');
    return this.prisma.$transaction(async (tx) => {
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
      return tx.fundTransaction.update({
        where: { id }, data: { status: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() }, include: FUND_INCLUDE,
      });
    });
  }

  async allocate(id: string, dto: AllocateFundDto, userId: string) {
    const settlement = await this.findOne(id, userId, 'settlement.allocate');
    if (!['CONFIRMED', 'PARTIALLY_SETTLED'].includes(settlement.status)) throw new BadRequestException('只有已确认且未结清的结算单可以核销');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.allocate');
    const fund = await this.prisma.fundTransaction.findFirst({ where: { id: dto.fundTransactionId, status: { in: ['CONFIRMED', 'PARTIALLY_ALLOCATED'] }, contract: contractScope } });
    if (!fund) throw new NotFoundException('资金流水不存在或无权访问');
    if (!ALLOCATABLE_STAGES.includes(fund.paymentStage)) throw new BadRequestException('退款、保证金及保证金退回不能核销贸易结算单');
    const expectedDirection = settlement.direction === 'RECEIVABLE' ? 'RECEIPT' : 'PAYMENT';
    if (fund.direction !== expectedDirection) throw new BadRequestException('资金收付方向与结算单不一致');
    if (fund.contractId !== settlement.contractId || fund.legalEntityPartnerId !== settlement.legalEntityPartnerId || fund.counterpartyId !== settlement.counterpartyId) throw new BadRequestException('资金流水的合同、法律主体或交易对手与结算单不一致');
    const remainingSettlement = money(Number(settlement.totalAmount) - Number(settlement.settledAmount));
    const remainingFund = money(Number(fund.amount) - Number(fund.allocatedAmount) - Number(fund.refundedAmount));
    if (dto.amount > remainingSettlement || dto.amount > remainingFund) throw new BadRequestException('核销金额超过结算单未结金额或资金可用余额');
    const newSettled = money(Number(settlement.settledAmount) + dto.amount);
    const newAllocated = money(Number(fund.allocatedAmount) + dto.amount);
    await this.prisma.$transaction([
      this.prisma.settlementAllocation.create({ data: { settlementId: id, fundTransactionId: fund.id, amount: dto.amount, createdBy: userId } }),
      this.prisma.financialSettlement.update({ where: { id }, data: { settledAmount: newSettled, status: newSettled >= Number(settlement.totalAmount) ? 'SETTLED' : 'PARTIALLY_SETTLED' } }),
      this.prisma.fundTransaction.update({ where: { id: fund.id }, data: { allocatedAmount: newAllocated, status: newAllocated + Number(fund.refundedAmount) >= Number(fund.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED' } }),
    ]);
    return this.findOne(id, userId, 'settlement.allocate');
  }

  async reverseAllocation(allocationId: string, dto: ReverseAllocationDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.reverse');
    if (!dto.reason.trim()) throw new BadRequestException('请填写撤销核销原因');
    const scope = await this.accessControl.getContractScope(userId, 'settlement.reverse');
    const allocation = await this.prisma.settlementAllocation.findFirst({
      where: { id: allocationId, settlement: { contract: scope } }, include: { settlement: true, fundTransaction: true },
    });
    if (!allocation) throw new NotFoundException('核销记录不存在或无权访问');
    if (allocation.reversedAt) throw new BadRequestException('该核销记录已经撤销');
    const amount = Number(allocation.amount);
    const settlementAmount = money(Math.max(0, Number(allocation.settlement.settledAmount) - amount));
    const fundAmount = money(Math.max(0, Number(allocation.fundTransaction.allocatedAmount) - amount));
    await this.prisma.$transaction([
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

  async voidFund(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'settlement.reverse');
    const contractScope = await this.accessControl.getContractScope(userId, 'settlement.reverse');
    const fund = await this.prisma.fundTransaction.findFirst({ where: { id, contract: contractScope }, include: { allocations: true, reverseTransactions: true } });
    if (!fund) throw new NotFoundException('资金流水不存在或无权访问');
    if (fund.status === 'VOIDED') throw new BadRequestException('资金流水已作废');
    if (fund.allocations.some((entry) => !entry.reversedAt) || Number(fund.allocatedAmount) > 0) throw new BadRequestException('资金流水已有有效核销记录，不能直接作废');
    if (fund.reverseTransactions.some((entry) => entry.status !== 'VOIDED') || Number(fund.refundedAmount) > 0) throw new BadRequestException('资金流水已有退款或退回记录，不能直接作废');
    if (fund.relatedTransactionId && fund.confirmedAt) {
      const original = await this.prisma.fundTransaction.findUnique({ where: { id: fund.relatedTransactionId } });
      if (!original) throw new BadRequestException('原资金流水不存在，不能作废退回流水');
      const refundedAfter = money(Math.max(0, Number(original.refundedAmount) - Number(fund.amount)));
      const consumedAfter = money(Number(original.allocatedAmount) + refundedAfter);
      await this.prisma.$transaction([
        this.prisma.fundTransaction.update({
          where: { id: fund.relatedTransactionId },
          data: {
            refundedAmount: refundedAfter,
            status: consumedAfter <= 0 ? 'CONFIRMED' : consumedAfter >= Number(original.amount) ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
          },
        }),
        this.prisma.fundTransaction.update({ where: { id }, data: { status: 'VOIDED' } }),
      ]);
      return this.prisma.fundTransaction.findUnique({ where: { id }, include: FUND_INCLUDE });
    }
    return this.prisma.fundTransaction.update({ where: { id }, data: { status: 'VOIDED' }, include: FUND_INCLUDE });
  }
}
