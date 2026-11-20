import type { GradePriceSnapshot } from '../components/contracts/grade-price-rules-editor';
import type { FieldErrors } from './form-validation';
import { deductibleMoisturePct } from '@ricse/shared-types/moisture-pricing';
import { applicableGradeSpecs } from '@ricse/shared-types/grade-price-spec';

/** 提交审批前的字段级校验；保存草稿不调用阻断。 */
export function gradePriceRuleErrors(rule: GradePriceSnapshot | null | undefined): FieldErrors {
  const errors: FieldErrors = {};
  const specs = applicableGradeSpecs(rule);
  if (!specs.length || (rule?.specPricingMode != null && (!Array.isArray(rule.applicableSpecs) || specs.length !== rule.applicableSpecs.length))) errors.selectedSpec = rule?.specPricingMode == null ? '请选择本行货物规格（碎屑或统矿）' : '请至少选择一种合同适用规格，且不可重复';
  if (rule?.specPricingMode != null && !['UNIFIED', 'BY_SPEC'].includes(rule.specPricingMode)) errors.specPricingMode = '请选择有效的规格计价方式';
  if (!rule?.quantityBasis || !['DRY_MATTER', 'PHYSICAL'].includes(rule.quantityBasis)) errors.quantityBasis = '请选择计价重量：按合同扣水后的净重或净重';
  if (rule?.moistureDeductionMode && !['ACTUAL', 'EXCESS'].includes(rule.moistureDeductionMode)) errors.moistureDeductionMode = '请选择有效的扣水方式';
  if (rule?.moistureDeductionMode === 'EXCESS' && rule.quantityBasis !== 'PHYSICAL' && deductibleMoisturePct(0, rule) == null) errors.moistureBasePct = '请填写基准水分，须大于等于0且小于100%';
  if (!rule?.moistureDeductionMode && rule?.moistureMaxPct == null) errors.moistureMaxPct = '请填写水分上限（%）';
  else if (rule?.moistureMaxPct != null && (!Number.isFinite(rule.moistureMaxPct) || rule.moistureMaxPct < 0 || rule.moistureMaxPct > 100)) errors.moistureMaxPct = '水分上限须在0至100%之间';
  if (!rule?.bands?.length) errors.bands = '请至少填写一个品位区间及对应的元/度单价';
  rule?.bands?.forEach((band, index) => {
    const key = `bands.${index}`;
    if (band.lower == null || band.upper == null || !Number.isFinite(band.lower) || !Number.isFinite(band.upper)
      || band.lower < 0 || band.upper > 100 || band.lower >= band.upper) errors[`${key}.range`] = `第${index + 1}档上下限须在0至100%内，且下限小于上限`;
    else if (index > 0 && band.lower !== rule.bands[index - 1].upper) errors[`${key}.range`] = `第${index + 1}档下限须等于上一档上限，区间须连续、不重叠`;
    for (const spec of ['FRAGMENT', 'RUN_OF_MINE'] as const) {
      const rate = band.rates[spec];
      if ((specs.includes(spec) || rate != null) && (rate == null || !Number.isFinite(rate) || rate <= 0)) {
        errors[`${key}.${spec}`] = `请填写第${index + 1}档${spec === 'FRAGMENT' ? '碎屑' : '统矿'}单价（元/度，须大于0）`;
      }
    }
    if (rule.specPricingMode === 'UNIFIED' && specs.some(spec => band.rates[spec] !== band.rates[specs[0]])) errors[`${key}.${specs[0]}`] = `第${index + 1}档统一价格不一致，请重新填写统一单价`;
  });
  if (!rule?.formulaConfirmed) errors.formulaConfirmed = '请勾选确认品位分档规则、元/度口径及人工例外处理';
  if (rule?.recoveryAdjustment) {
    const recovery = rule.recoveryAdjustment;
    if (recovery.baselinePct == null || !Number.isFinite(recovery.baselinePct) || recovery.baselinePct <= 0 || recovery.baselinePct > 100) errors.recovery = '请填写有效的选矿回收率基准（大于0且不超过100%）';
    else if (recovery.deductionPerPointPerDegree == null || !Number.isFinite(recovery.deductionPerPointPerDegree) || recovery.deductionPerPointPerDegree <= 0) errors.recovery = '请填写选矿回收率每低1个百分点的扣价（元/度，须大于0）';
  }
  return errors;
}
