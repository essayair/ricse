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
  /** 仅传入有效（未作废）发票。 */
  invoices: Array<{ quantity: Numeric | null; taxInclusiveAmount: Numeric }>;
  /** 运费发票的计量单位不统一，只核对金额。 */
  compareQuantity: boolean;
}

/**
 * 按有效发票汇总数量和含税金额，并与结算依据比较。
 * 金额优先：金额不足为部分到票、超出为发票超额；金额一致但数量不同为数量不符。
 */
export function matchInvoices(input: InvoiceMatchInput) {
  const zero = new Prisma.Decimal(0);
  const invoiceQuantity = input.invoices.reduce((sum, item) => sum.plus(item.quantity ?? 0), zero);
  const invoiceAmount = input.invoices.reduce((sum, item) => sum.plus(item.taxInclusiveAmount), zero);
  const settlementAmount = new Prisma.Decimal(input.settlementAmount);
  const settlementQuantity = input.compareQuantity && input.settlementQuantity != null ? new Prisma.Decimal(input.settlementQuantity) : null;
  const quantityDifference = settlementQuantity == null ? null : invoiceQuantity.minus(settlementQuantity);
  const amountDifference = invoiceAmount.minus(settlementAmount);

  const warnings: string[] = [];
  let state: InvoiceMatchState;
  if (!input.invoices.length) {
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
    invoiceCount: input.invoices.length,
    settlementQuantity: settlementQuantity?.toFixed(3) ?? null,
    invoiceQuantity: invoiceQuantity.toFixed(3),
    quantityDifference: quantityDifference?.toFixed(3) ?? null,
    settlementAmount: settlementAmount.toFixed(2),
    invoiceAmount: invoiceAmount.toFixed(2),
    amountDifference: amountDifference.toFixed(2),
  };
}
