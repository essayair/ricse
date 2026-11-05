import { Prisma } from '@prisma/client';
import { decimalMoney } from './payment-balance';

export const GRADE_TIER_FORMULA = '所选磅单净重按合同口径折算 × CaF₂实测百分点 × 档位不含税元/度单价 × (1 + 合同税率)；'
  + '合同约定回收率条款时，另扣 实测品位 × 回收率差额百分点 × 每点扣价（元/度）× 吨数，按同一税率计税后列为扣款';

/**
 * 品位分档货款：档位原价与回收率扣价分列，税额按扣价后的不含税货款计算。
 * grossAmount − qualityDeductionAmount 恰等于 amountExTax + taxAmount，避免分别取整产生差额。
 */
export function gradeTierAmounts(qty: Prisma.Decimal.Value, unitPriceExTax: Prisma.Decimal.Value,
  recoveryDeductionPerTonExTax: Prisma.Decimal.Value | null | undefined, taxRatePct: Prisma.Decimal.Value, adjustment: Prisma.Decimal.Value = 0) {
  const quantity = new Prisma.Decimal(qty).toDecimalPlaces(3);
  const rate = new Prisma.Decimal(taxRatePct).div(100);
  const grossExTax = quantity.mul(unitPriceExTax).toDecimalPlaces(2);
  const deductionExTax = quantity.mul(recoveryDeductionPerTonExTax || 0).toDecimalPlaces(2);
  const amountExTax = grossExTax.minus(deductionExTax);
  const taxAmount = amountExTax.mul(rate).toDecimalPlaces(2);
  const goods = amountExTax.plus(taxAmount);
  const qualityDeductionAmount = deductionExTax.mul(rate.plus(1)).toDecimalPlaces(2);
  return {
    quantity: quantity.toNumber(), grossAmount: goods.plus(qualityDeductionAmount).toNumber(),
    qualityDeductionAmount: qualityDeductionAmount.toNumber(), adjustmentAmount: decimalMoney(adjustment),
    totalAmount: goods.plus(adjustment).toDecimalPlaces(2).toNumber(),
    taxAmount: taxAmount.toNumber(), amountExTax: amountExTax.toNumber(),
    grossAmountExTax: grossExTax.toNumber(), recoveryDeductionExTax: deductionExTax.toNumber(),
  };
}

type PricingSource = {
  pricingQuantityBasis?: string | null;
  recoveryDeductionPerTon?: number | null;
  measuredMoisturePct?: number | null;
  gradePrice?: {
    status?: string; gradePct?: number | null; moisturePct?: number | null; recoveryPct?: number | null;
    band?: { lower: number; upper: number } | null; rate?: number | null;
  } | null;
};

/** 结算行上的可查询计价事实；仅记录本次实际采用的值，不替代合同条款快照。 */
export function settlementPricingFacts(source: PricingSource, amounts: { quantity: number; amountExTax?: number; taxAmount?: number },
  gradeTier: boolean, taxRatePct: number | string | null | undefined) {
  const grade = gradeTier && source.gradePrice?.status === 'READY' ? source.gradePrice : null;
  return {
    pricingMethod: gradeTier ? 'GRADE_TIER' : 'FIXED',
    pricingQuantityBasis: source.pricingQuantityBasis || null,
    measuredGradePct: grade?.gradePct ?? null,
    measuredMoisturePct: grade?.moisturePct ?? source.measuredMoisturePct ?? null,
    measuredRecoveryPct: grade?.recoveryPct ?? null,
    gradeBandLower: grade?.band?.lower ?? null,
    gradeBandUpper: grade?.band?.upper ?? null,
    gradeRateExTax: grade?.rate ?? null,
    recoveryDeductionPerTonExTax: grade && grade.recoveryPct != null ? source.recoveryDeductionPerTon ?? 0 : null,
    taxRatePct: gradeTier && taxRatePct != null ? Number(taxRatePct) : null,
    amountExTax: gradeTier ? amounts.amountExTax ?? null : null,
    taxAmount: gradeTier ? amounts.taxAmount ?? null : null,
  };
}
