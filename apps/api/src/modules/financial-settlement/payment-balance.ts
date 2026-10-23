import { Prisma } from '@prisma/client';

export const ACTIVE_PAYMENT_REQUEST_STATUSES = ['BUSINESS_CONFIRMED', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID'];
export const TRADE_PAYMENT_STAGES = ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'OTHER'];
export const decimalMoney = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(2).toNumber();

type Payment = { amount: Prisma.Decimal.Value; status: string; refundedAmount?: Prisma.Decimal.Value };
type Request = { amount: Prisma.Decimal.Value; status: string; fundTransactions: Payment[] };

/** 申请的已登记和未执行两部分只占用一次；银行付款待财务确认也占额度。 */
export function requestCommitment(request: Request) {
  if (!ACTIVE_PAYMENT_REQUEST_STATUSES.includes(request.status)) return 0;
  const registered = request.fundTransactions.filter(fund => fund.status !== 'VOIDED')
    .reduce((sum, fund) => sum.plus(fund.amount), new Prisma.Decimal(0));
  return decimalMoney(Prisma.Decimal.max(0, new Prisma.Decimal(request.amount).minus(registered)));
}

export function goodsAmounts(qty: Prisma.Decimal.Value, price: Prisma.Decimal.Value, deductionPerTon: Prisma.Decimal.Value, adjustment: Prisma.Decimal.Value = 0) {
  const quantity = new Prisma.Decimal(qty).toDecimalPlaces(3);
  const grossAmount = quantity.mul(price).toDecimalPlaces(2);
  const qualityDeductionAmount = quantity.mul(deductionPerTon).toDecimalPlaces(2);
  return { quantity: quantity.toNumber(), grossAmount: grossAmount.toNumber(), qualityDeductionAmount: qualityDeductionAmount.toNumber(),
    adjustmentAmount: decimalMoney(adjustment), totalAmount: grossAmount.minus(qualityDeductionAmount).plus(adjustment).toDecimalPlaces(2).toNumber() };
}
