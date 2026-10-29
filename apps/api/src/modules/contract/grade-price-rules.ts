import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type GradePriceBand = { lower: number; upper: number; rates: { FRAGMENT: number; RUN_OF_MINE: number } };
export type GradePriceRules = {
  version: 1;
  method: 'CAF2_GRADE_TIER';
  gradeUnit: 'PERCENT_POINTS';
  rateUnit: 'CNY_PER_DEGREE_EX_TAX';
  moistureMaxPct: number;
  bands: GradePriceBand[];
  exceptionHandling: 'MANUAL_REVIEW';
  selectedSpec: 'FRAGMENT' | 'RUN_OF_MINE';
  formulaConfirmed: true;
};

export const DEFAULT_FLUORITE_ORE_BANDS: GradePriceBand[] = [
  [10, 15, 14.8], [15, 20, 18.5], [20, 25, 20.5], [25, 30, 22],
  [30, 35, 22.7], [35, 40, 23.2], [40, 45, 23.5], [45, 50, 23.8],
].map(([lower, upper, rate]) => ({ lower, upper, rates: { FRAGMENT: rate, RUN_OF_MINE: rate } }));

export function parseGradePriceRules(value: unknown): GradePriceRules {
  const rules = value as Partial<GradePriceRules> | null;
  if (!rules || rules.version !== 1 || rules.method !== 'CAF2_GRADE_TIER'
    || rules.gradeUnit !== 'PERCENT_POINTS' || rules.rateUnit !== 'CNY_PER_DEGREE_EX_TAX'
    || rules.exceptionHandling !== 'MANUAL_REVIEW' || !['FRAGMENT', 'RUN_OF_MINE'].includes(rules.selectedSpec || '')
    || rules.formulaConfirmed !== true || !Array.isArray(rules.bands) || !rules.bands.length) {
    throw new BadRequestException('请确认品位分档价格规则、元/度口径与人工例外处理');
  }
  if (!Number.isFinite(rules.moistureMaxPct) || Number(rules.moistureMaxPct) < 0 || Number(rules.moistureMaxPct) > 100) {
    throw new BadRequestException('水分上限必须为0至100之间的百分比');
  }
  let previousUpper: number | null = null;
  for (const band of rules.bands) {
    if (!Number.isFinite(band.lower) || !Number.isFinite(band.upper) || band.lower >= band.upper
      || (previousUpper !== null && band.lower !== previousUpper)
      || !Number.isFinite(band.rates?.FRAGMENT) || band.rates.FRAGMENT <= 0
      || !Number.isFinite(band.rates?.RUN_OF_MINE) || band.rates.RUN_OF_MINE <= 0) {
      throw new BadRequestException('品位区间必须连续、不重叠且两种规格均有正数报价');
    }
    previousUpper = band.upper;
  }
  return rules as GradePriceRules;
}

export function readMeasuredPct(indicators: Array<{ code?: string; name?: string; unit?: string | null; measuredValue?: unknown }>, kind: 'GRADE' | 'MOISTURE'): number | null {
  const item = indicators.find(indicator => {
    const text = `${indicator.code || ''} ${indicator.name || ''}`.toUpperCase().replace(/\s/g, '');
    return kind === 'GRADE' ? /CAF2|CAF₂|氟化钙|品位/.test(text) : /MOISTURE|水分/.test(text);
  });
  if (!item || item.measuredValue == null || (item.unit && item.unit !== '%')) return null;
  const measured = Number(item.measuredValue);
  return Number.isFinite(measured) && measured >= 0 && measured <= 100 ? measured : null;
}

/** 仅计算税前价；缺报告、品位越档或水分超限均转人工，不推测合同外规则。 */
export function evaluateGradePrice(rulesValue: unknown, spec: 'FRAGMENT' | 'RUN_OF_MINE', quantity: number,
  indicators: Array<{ code?: string; name?: string; unit?: string | null; measuredValue?: unknown }>) {
  const rules = parseGradePriceRules(rulesValue);
  const gradePct = readMeasuredPct(indicators, 'GRADE');
  const moisturePct = readMeasuredPct(indicators, 'MOISTURE');
  const reasons: string[] = [];
  if (gradePct === null) reasons.push('缺少有效的 CaF₂ 实测品位');
  if (moisturePct === null) reasons.push('缺少有效的水分实测值');
  if (moisturePct !== null && moisturePct > rules.moistureMaxPct) reasons.push(`水分 ${moisturePct}% 超过合同上限 ${rules.moistureMaxPct}%，须人工确认处理方式`);
  const band = gradePct === null ? null : rules.bands.find(row => gradePct >= row.lower && gradePct < row.upper) || null;
  if (gradePct !== null && !band) reasons.push(`CaF₂ ${gradePct}% 不在合同价格表区间内`);
  if (!Number.isFinite(quantity) || quantity <= 0) reasons.push('结算数量必须大于0');
  if (reasons.length || !band || gradePct === null) return { status: 'REVIEW_REQUIRED' as const, reasons, gradePct, moisturePct, band: band || null };
  const rate = band.rates[spec];
  const unitPrice = new Prisma.Decimal(gradePct).mul(rate).toDecimalPlaces(4).toNumber();
  const amountExTax = new Prisma.Decimal(quantity).mul(unitPrice).toDecimalPlaces(2).toNumber();
  return { status: 'READY' as const, reasons: [], gradePct, moisturePct,
    band: { lower: band.lower, upper: band.upper }, spec, rate, unitPrice, amountExTax };
}
