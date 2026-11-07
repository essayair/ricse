import { Prisma } from '@prisma/client';

/** 发票与结算依据的核对状态。 */
export type InvoiceMatchState = 'NONE' | 'PARTIAL' | 'OVER' | 'QUANTITY_MISMATCH' | 'MATCHED';

export const INVOICE_MATCH_LABEL: Record<InvoiceMatchState, string> = {
  NONE: '未到票',
  PARTIAL: '部分到票',
  OVER: '发票超额',
  QUANTITY_MISMATCH: '数量不符',
  MATCHED: '已匹配',
};

type Numeric = Prisma.Decimal | string | number;

export interface InvoiceMatchInput {
  /** 结算数量；为空或不比较数量时只核对金额。 */
  settlementQuantity: Numeric | null;
  settlementAmount: Numeric;
  /** 已收付金额（核销），用于计算票款差。 */
  paidAmount?: Numeric | null;
  /** 仅传入未撤销的分摊；数量选填，任一分摊填写数量时才核对数量。 */
  allocations: Array<{ quantity: Numeric | null; amount: Numeric }>;
  /** 运费发票的计量单位不统一，只核对金额。 */
  compareQuantity: boolean;
}

/**
 * 按发票分摊汇总已到票数量和含税金额，并与结算依据比较；发票总额应与最终的全部结算单对应。
 * 金额优先：金额不足为部分到票、超出为发票超额；金额一致但数量不同为数量不符。
 * 票款差 = 已到票 − 已收付：为正表示票多于款，为负表示已付款未到票。
 */
export function matchInvoices(input: InvoiceMatchInput) {
  const zero = new Prisma.Decimal(0);
  const quantityGiven = input.allocations.some(item => item.quantity != null);
  const invoiceQuantity = input.allocations.reduce((sum, item) => sum.plus(item.quantity ?? 0), zero);
  const invoiceAmount = input.allocations.reduce((sum, item) => sum.plus(item.amount), zero);
  const settlementAmount = new Prisma.Decimal(input.settlementAmount);
  const paidAmount = new Prisma.Decimal(input.paidAmount ?? 0);
  const settlementQuantity = input.compareQuantity && quantityGiven && input.settlementQuantity != null ? new Prisma.Decimal(input.settlementQuantity) : null;
  const quantityDifference = settlementQuantity == null ? null : invoiceQuantity.minus(settlementQuantity);
  const amountDifference = invoiceAmount.minus(settlementAmount);

  const warnings: string[] = [];
  let state: InvoiceMatchState;
  if (!input.allocations.length) {
    state = 'NONE';
    warnings.push('尚未登记发票');
  } else {
    if (quantityDifference && !quantityDifference.eq(0)) warnings.push(`发票数量与结算数量相差 ${quantityDifference.toFixed(3)} 吨`);
    if (!amountDifference.eq(0)) warnings.push(`发票含税金额与结算金额相差 ${amountDifference.toFixed(2)} 元`);
    if (amountDifference.lt(0)) state = 'PARTIAL';
    else if (amountDifference.gt(0)) state = 'OVER';
    else if (quantityDifference && !quantityDifference.eq(0)) state = 'QUANTITY_MISMATCH';
    else state = 'MATCHED';
  }

  return {
    state,
    stateLabel: INVOICE_MATCH_LABEL[state],
    matched: state === 'MATCHED',
    warnings,
    invoiceCount: input.allocations.length,
    settlementQuantity: input.compareQuantity && input.settlementQuantity != null ? new Prisma.Decimal(input.settlementQuantity).toFixed(3) : null,
    invoiceQuantity: quantityGiven ? invoiceQuantity.toFixed(3) : null,
    quantityDifference: quantityDifference?.toFixed(3) ?? null,
    settlementAmount: settlementAmount.toFixed(2),
    invoiceAmount: invoiceAmount.toFixed(2),
    amountDifference: amountDifference.toFixed(2),
    remainingAmount: settlementAmount.minus(invoiceAmount).toFixed(2),
    paidAmount: paidAmount.toFixed(2),
    invoicePaymentGap: invoiceAmount.minus(paidAmount).toFixed(2),
  };
}

/** 发票自身的分摊状态。 */
export type InvoiceAllocationState = 'UNALLOCATED' | 'PARTIAL' | 'ALLOCATED';
export const INVOICE_ALLOCATION_LABEL: Record<InvoiceAllocationState, string> = { UNALLOCATED: '待分摊', PARTIAL: '部分分摊', ALLOCATED: '已分摊' };

export function allocationState(invoiceAmount: Numeric, allocated: Numeric): InvoiceAllocationState {
  const total = new Prisma.Decimal(invoiceAmount);
  const used = new Prisma.Decimal(allocated);
  if (used.lte(0)) return 'UNALLOCATED';
  return used.gte(total) ? 'ALLOCATED' : 'PARTIAL';
}
