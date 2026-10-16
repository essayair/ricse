import { evaluateContractQualityRules } from './contract-quality-rules';

describe('合同质量规则评价', () => {
  const snapshot = { items: [{
    indicatorId: 'caf2', code: 'CaF2', name: '氟化钙', unit: '%', operator: 'GTE', standardValue: 97,
    deductionMode: 'PER_STEP', deductionStep: 0.1, deductionAmount: 20,
    deductionLimitValue: 96.5, rejectOperator: 'LT', rejectValue: 96.5,
  }] };

  it('合同标准内判定合格', () => {
    expect(evaluateContractQualityRules(snapshot, [{ indicatorDefinitionId: 'caf2', measuredValue: 97 }])?.disposition).toBe('PASS');
  });

  it('合同允许扣款区间按每步标准计算元/吨', () => {
    const result = evaluateContractQualityRules(snapshot, [{ indicatorDefinitionId: 'caf2', measuredValue: 96.8 }]);
    expect(result?.disposition).toBe('DEDUCTION');
    expect(result?.deductionPerTon).toBe(40);
  });

  it('命中拒收条件时优先拒收', () => {
    expect(evaluateContractQualityRules(snapshot, [{ indicatorDefinitionId: 'caf2', measuredValue: 96.4 }])?.disposition).toBe('REJECT');
  });

  it('报告缺少合同要求指标时转人工判定', () => {
    expect(evaluateContractQualityRules(snapshot, [])?.disposition).toBe('REVIEW_REQUIRED');
  });
});
