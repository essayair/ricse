import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type GradePriceBand = { lower: number; upper: number; rates: { FRAGMENT: number | null; RUN_OF_MINE: number | null } };
/**
 * 选矿回收率扣价（合同价格条款的一部分，只扣不奖）。
 * 实测回收率低于基准时，每低 1 个百分点按 deductionPerPointPerDegree 元/度（不含税）扣减；
 * PROPORTIONAL 按实际差额线性计算，FULL_POINT 只按差额的整数百分点计算。
 */
export type RecoveryAdjustmentRule = {
  baselinePct: number;
  deductionPerPointPerDegree: number;
  stepMode: 'PROPORTIONAL' | 'FULL_POINT';
  note?: string;
};
export type GradePriceRules = {
  version: 1;
  method: 'CAF2_GRADE_TIER';
  quantityBasis?: 'PHYSICAL' | 'DRY_MATTER';
  gradeUnit: 'PERCENT_POINTS';
  rateUnit: 'CNY_PER_DEGREE_EX_TAX';
  moistureMaxPct: number;
  bands: GradePriceBand[];
  exceptionHandling: 'MANUAL_REVIEW';
  selectedSpec: 'FRAGMENT' | 'RUN_OF_MINE';
  formulaConfirmed: true;
  recoveryAdjustment?: RecoveryAdjustmentRule | null;
};
type Indicator = { code?: string; name?: string; unit?: string | null; measuredValue?: unknown };

export const DEFAULT_FLUORITE_ORE_BANDS: GradePriceBand[] = [
  [10, 15, 14.8], [15, 20, 18.5], [20, 25, 20.5], [25, 30, 22],
  [30, 35, 22.7], [35, 40, 23.2], [40, 45, 23.5], [45, 50, 23.8],
].map(([lower, upper, rate]) => ({ lower, upper, rates: { FRAGMENT: rate, RUN_OF_MINE: rate } }));

export function parseGradePriceRules(value: unknown, options: { requireQuantityBasis?: boolean } = {}): GradePriceRules {
  const rules = value as Partial<GradePriceRules> | null;
  if (!rules || rules.version !== 1 || rules.method !== 'CAF2_GRADE_TIER') {
    throw new BadRequestException('请填写并保存品位分档价格规则');
  }
  if (!['FRAGMENT', 'RUN_OF_MINE'].includes(rules.selectedSpec || '')) {
    throw new BadRequestException('请选择本行货物规格（碎屑或统矿）');
  }
  if ((options.requireQuantityBasis || rules.quantityBasis != null) && !['PHYSICAL', 'DRY_MATTER'].includes(rules.quantityBasis || '')) {
    throw new BadRequestException('请选择计价重量：所选磅单净重折干或所选磅单净重');
  }
  if (rules.moistureMaxPct == null) {
    throw new BadRequestException('请填写水分上限（%）');
  }
  if (!Number.isFinite(rules.moistureMaxPct) || Number(rules.moistureMaxPct) < 0 || Number(rules.moistureMaxPct) > 100) {
    throw new BadRequestException('水分上限必须为0至100之间的百分比');
  }
  if (!Array.isArray(rules.bands) || !rules.bands.length) {
    throw new BadRequestException('请至少填写一个品位区间及对应的元/度单价');
  }
  if (rules.gradeUnit !== 'PERCENT_POINTS' || rules.rateUnit !== 'CNY_PER_DEGREE_EX_TAX') {
    throw new BadRequestException('品位计价单位不正确，请重新保存价格条款：品位按百分点、单价按不含税元/度');
  }
  if (rules.exceptionHandling !== 'MANUAL_REVIEW') {
    throw new BadRequestException('人工例外处理规则缺失，请重新保存品位价格条款');
  }
  if (rules.formulaConfirmed !== true) {
    throw new BadRequestException('请勾选确认品位分档规则、元/度口径及人工例外处理');
  }
  let previousUpper: number | null = null;
  for (const [index, band] of rules.bands.entries()) {
    const selectedRate = band?.rates?.[rules.selectedSpec as 'FRAGMENT' | 'RUN_OF_MINE'];
    const otherRate = band?.rates?.[rules.selectedSpec === 'FRAGMENT' ? 'RUN_OF_MINE' : 'FRAGMENT'];
    if (!Number.isFinite(band?.lower) || !Number.isFinite(band?.upper) || band.lower < 0 || band.upper > 100 || band.lower >= band.upper) {
      throw new BadRequestException(`第${index + 1}档品位上下限须在0至100%内，且下限小于上限`);
    }
    if (previousUpper !== null && band.lower !== previousUpper) {
      throw new BadRequestException(`第${index + 1}档品位下限须等于上一档上限，区间必须连续、不重叠`);
    }
    if (!Number.isFinite(selectedRate) || Number(selectedRate) <= 0) {
      throw new BadRequestException(`请填写第${index + 1}档${rules.selectedSpec === 'FRAGMENT' ? '碎屑' : '统矿'}单价（元/度，须大于0）`);
    }
    if (otherRate != null && (!Number.isFinite(otherRate) || otherRate <= 0)) {
      throw new BadRequestException(`第${index + 1}档另一规格的单价须大于0，不适用时请留空`);
    }
    previousUpper = band.upper;
  }
  const recovery = rules.recoveryAdjustment;
  if (recovery != null) {
    if (!Number.isFinite(recovery.baselinePct) || recovery.baselinePct <= 0 || recovery.baselinePct > 100) {
      throw new BadRequestException('选矿回收率基准须为0至100之间的百分比');
    }
    if (!Number.isFinite(recovery.deductionPerPointPerDegree) || recovery.deductionPerPointPerDegree <= 0) {
      throw new BadRequestException('选矿回收率每低1个百分点的扣价须为正数（元/度，不含税）');
    }
    if (!['PROPORTIONAL', 'FULL_POINT'].includes(recovery.stepMode)) {
      throw new BadRequestException('请选择回收率差额按实际差额还是按整百分点计算');
    }
  }
  return rules as GradePriceRules;
}

export function readMeasuredPct(indicators: Indicator[], kind: 'GRADE' | 'MOISTURE' | 'RECOVERY'): number | null {
  const item = indicators.find(indicator => {
    const text = `${indicator.code || ''} ${indicator.name || ''}`.toUpperCase().replace(/\s/g, '');
    const isRecovery = /RECOVERY|回收率/.test(text);
    if (kind === 'RECOVERY') return isRecovery;
    // “CaF₂回收率”等指标不能被误读为品位。
    return !isRecovery && (kind === 'GRADE' ? /CAF2|CAF₂|氟化钙|品位/.test(text) : /MOISTURE|水分/.test(text));
  });
  if (!item || item.measuredValue == null || (item.unit && item.unit !== '%')) return null;
  const measured = Number(item.measuredValue);
  return Number.isFinite(measured) && measured >= 0 && measured <= 100 ? measured : null;
}

/** 按合同回收率条款计算每吨扣价（不含税）；未约定条款时返回 null。 */
export function evaluateRecoveryAdjustment(rule: RecoveryAdjustmentRule | null | undefined, gradePct: number, recoveryPct: number | null) {
  if (!rule) return null;
  if (recoveryPct === null) return { status: 'MISSING' as const };
  const rawShortfall = Prisma.Decimal.max(0, new Prisma.Decimal(rule.baselinePct).minus(recoveryPct));
  const shortfallPoints = (rule.stepMode === 'FULL_POINT' ? rawShortfall.floor() : rawShortfall).toDecimalPlaces(4);
  const deductionPerDegree = shortfallPoints.mul(rule.deductionPerPointPerDegree).toDecimalPlaces(4);
  const deductionPerTon = deductionPerDegree.mul(gradePct).toDecimalPlaces(4);
  return { status: 'APPLIED' as const, measuredPct: recoveryPct, baselinePct: rule.baselinePct,
    deductionPerPointPerDegree: rule.deductionPerPointPerDegree, stepMode: rule.stepMode,
    shortfallPoints: shortfallPoints.toNumber(), deductionPerDegree: deductionPerDegree.toNumber(), deductionPerTon: deductionPerTon.toNumber() };
}

/**
 * 仅计算税前价；缺报告、品位越档或水分超限均转人工，不推测合同外规则。
 * unitPrice 为档位原价（实测度数 × 元/度），回收率扣价单列在 recovery.deductionPerTon，不改写原单价。
 */
export function evaluateGradePrice(rulesValue: unknown, spec: 'FRAGMENT' | 'RUN_OF_MINE', quantity: number, indicators: Indicator[]) {
  const rules = parseGradePriceRules(rulesValue);
  const gradePct = readMeasuredPct(indicators, 'GRADE');
  const moisturePct = readMeasuredPct(indicators, 'MOISTURE');
  const hasRecoveryRule = Boolean(rules.recoveryAdjustment);
  const recoveryPct = hasRecoveryRule ? readMeasuredPct(indicators, 'RECOVERY') : null;
  // 未约定回收率条款时不输出新增字段，保证存量结算依据签名不变。
  const recoveryFacts = hasRecoveryRule ? { recoveryPct } : {};
  const reasons: string[] = [];
  if (gradePct === null) reasons.push('缺少有效的 CaF₂ 实测品位');
  if (moisturePct === null) reasons.push('缺少有效的水分实测值');
  if (moisturePct !== null && moisturePct > rules.moistureMaxPct) reasons.push(`水分 ${moisturePct}% 超过合同上限 ${rules.moistureMaxPct}%，须人工确认处理方式`);
  if (rules.recoveryAdjustment && recoveryPct === null) reasons.push('合同约定选矿回收率扣价，所选检测报告缺少有效的“选矿回收率”实测值');
  const band = gradePct === null ? null : rules.bands.find(row => gradePct >= row.lower && gradePct < row.upper) || null;
  if (gradePct !== null && !band) reasons.push(`CaF₂ ${gradePct}% 不在合同价格表区间内`);
  if (!Number.isFinite(quantity) || quantity <= 0) reasons.push('结算数量必须大于0');
  if (reasons.length || !band || gradePct === null) return { status: 'REVIEW_REQUIRED' as const, reasons, gradePct, moisturePct, ...recoveryFacts, band: band || null };
  const rate = band.rates[spec];
  if (rate == null || rate <= 0) return { status: 'REVIEW_REQUIRED' as const, reasons: ['该规格未配置品位分档单价'], gradePct, moisturePct, ...recoveryFacts, band: { lower: band.lower, upper: band.upper } };
  const unitPrice = new Prisma.Decimal(gradePct).mul(rate).toDecimalPlaces(4).toNumber();
  const recovery = evaluateRecoveryAdjustment(rules.recoveryAdjustment, gradePct, recoveryPct);
  const applied = recovery?.status === 'APPLIED' ? recovery : null;
  const deductionPerTon = applied?.deductionPerTon || 0;
  if (deductionPerTon >= unitPrice) {
    return { status: 'REVIEW_REQUIRED' as const, reasons: ['回收率扣价不低于档位单价，须人工确认合同处理方式'], gradePct, moisturePct, ...recoveryFacts, band: { lower: band.lower, upper: band.upper } };
  }
  const netUnitPrice = new Prisma.Decimal(unitPrice).minus(deductionPerTon).toDecimalPlaces(4).toNumber();
  const amountExTax = new Prisma.Decimal(quantity).mul(netUnitPrice).toDecimalPlaces(2).toNumber();
  return { status: 'READY' as const, reasons: [], gradePct, moisturePct, ...recoveryFacts,
    band: { lower: band.lower, upper: band.upper }, spec, rate, unitPrice,
    ...(hasRecoveryRule ? { recovery: applied, netUnitPrice } : {}), amountExTax };
}
