export type QualityRuleEvaluation = {
  disposition: 'PASS' | 'DEDUCTION' | 'REJECT' | 'REVIEW_REQUIRED';
  deductionPerTon: number;
  items: Array<Record<string, unknown>>;
};

type Rule = {
  indicatorId?: string;
  code?: string;
  name?: string;
  symbol?: string;
  unit?: string;
  operator?: string;
  standardValue?: number | null;
  upperValue?: number | null;
  deductionMode?: 'NONE' | 'PER_STEP' | 'FLAT';
  deductionStep?: number | null;
  deductionAmount?: number | null;
  deductionCondition?: 'OUTSIDE_STANDARD' | 'IN_RANGE';
  deductionLowerValue?: number | null;
  deductionUpperValue?: number | null;
  deductionLimitValue?: number | null;
  rejectOperator?: string | null;
  rejectValue?: number | null;
};

function matches(value: number, operator: string | null | undefined, boundary: number | null | undefined) {
  if (!operator || operator === 'NONE' || boundary == null) return false;
  switch (operator) {
    case 'LT': return value < boundary;
    case 'LTE': return value <= boundary;
    case 'GT': return value > boundary;
    case 'GTE': return value >= boundary;
    case 'EQ': return value === boundary;
    default: return false;
  }
}

function meetsStandard(value: number, rule: Rule) {
  switch (rule.operator) {
    case 'GTE': return rule.standardValue != null && value >= rule.standardValue;
    case 'GT': return rule.standardValue != null && value > rule.standardValue;
    case 'LTE': return rule.standardValue != null && value <= rule.standardValue;
    case 'LT': return rule.standardValue != null && value < rule.standardValue;
    case 'EQ': return rule.standardValue != null && value === rule.standardValue;
    case 'RANGE': return rule.standardValue != null && rule.upperValue != null && value >= rule.standardValue && value <= rule.upperValue;
    default: return false;
  }
}

function deviation(value: number, rule: Rule) {
  if (rule.operator === 'RANGE') {
    if (rule.standardValue == null || rule.upperValue == null) return null;
    return value < rule.standardValue ? rule.standardValue - value : value > rule.upperValue ? value - rule.upperValue : 0;
  }
  if (rule.standardValue == null) return null;
  return Math.abs(value - rule.standardValue);
}

export function evaluateContractQualityRules(snapshot: unknown, indicators: Array<any>): QualityRuleEvaluation | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const rules = (snapshot as { items?: Rule[] }).items;
  if (!Array.isArray(rules) || !rules.length) return null;

  const results = rules.map((rule) => {
    const expectedCode = String(rule.code || '').toLowerCase();
    const expectedName = String(rule.name || '').toLowerCase();
    const measured = indicators.find((item) => (
      (item.code && String(item.code).toLowerCase() === expectedCode)
      || (item.indicatorDefinitionId && rule.indicatorId && item.indicatorDefinitionId === rule.indicatorId)
      || (item.name && String(item.name).toLowerCase() === expectedName)
    ));
    const value = measured?.measuredValue == null ? null : Number(measured.measuredValue);
    const standardPass = value != null && meetsStandard(value, rule);
    let result = 'PASS';
    let amount = 0;
    let reason = '';

    if (value == null) {
      result = 'REVIEW_REQUIRED'; reason = '选定报告缺少该指标的实测值';
    } else if (matches(value, rule.rejectOperator, rule.rejectValue)) {
      result = 'REJECT'; reason = '实测值达到合同拒收条件';
    } else if (rule.deductionCondition === 'IN_RANGE') {
      const lower = rule.deductionLowerValue;
      const upper = rule.deductionUpperValue;
      if (lower == null || upper == null) {
        result = 'REVIEW_REQUIRED'; reason = '扣款区间配置不完整';
      } else if (value >= lower && value <= upper) {
        amount = rule.deductionMode === 'FLAT' ? Number(rule.deductionAmount || 0) : 0;
        result = amount > 0 ? 'DEDUCTION' : 'REVIEW_REQUIRED';
        reason = amount > 0 ? '实测值落入合同固定扣款区间' : '扣款区间未配置有效扣款金额';
      } else if (!standardPass) {
        result = 'REVIEW_REQUIRED'; reason = '实测值超出已配置的合同规则范围';
      }
    } else if (!standardPass) {
      if (rule.deductionMode === 'FLAT') {
        amount = Number(rule.deductionAmount || 0);
        result = amount > 0 ? 'DEDUCTION' : 'REVIEW_REQUIRED';
        reason = amount > 0 ? '触发合同固定扣款' : '固定扣款金额未配置';
      } else if (rule.deductionMode === 'PER_STEP') {
        const delta = deviation(value, rule);
        const step = Number(rule.deductionStep || 0);
        const rate = Number(rule.deductionAmount || 0);
        if (delta == null || step <= 0 || rate < 0) {
          result = 'REVIEW_REQUIRED'; reason = '扣款步长或金额配置不完整';
        } else if (rule.deductionLimitValue != null && (
          (['GTE', 'GT'].includes(rule.operator || '') && value < Number(rule.deductionLimitValue))
          || (['LTE', 'LT'].includes(rule.operator || '') && value > Number(rule.deductionLimitValue))
        )) {
          result = 'REVIEW_REQUIRED'; reason = '实测值超出合同扣款区间但未命中明确拒收条件';
        } else {
          amount = Math.round((delta / step * rate + Number.EPSILON) * 10000) / 10000;
          result = amount > 0 ? 'DEDUCTION' : 'REVIEW_REQUIRED';
          reason = amount > 0 ? '按偏差比例线性计算，单位为元/吨' : '无法计算扣款';
        }
      } else {
        result = 'REVIEW_REQUIRED'; reason = '合同未配置该指标的扣款或拒收处理方式';
      }
    }
    return {
      code: rule.code || '', name: rule.name || '', unit: rule.unit || '%',
      measuredValue: value, standardOperator: rule.operator || null,
      standardValue: rule.standardValue ?? null, upperValue: rule.upperValue ?? null,
      result, deductionPerTon: amount, reason,
    };
  });

  const disposition = results.some(item => item.result === 'REJECT') ? 'REJECT'
    : results.some(item => item.result === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED'
      : results.some(item => item.result === 'DEDUCTION') ? 'DEDUCTION' : 'PASS';
  const deductionPerTon = Math.round((results.reduce((sum, item) => sum + Number(item.deductionPerTon), 0) + Number.EPSILON) * 10000) / 10000;
  return { disposition, deductionPerTon, items: results };
}
