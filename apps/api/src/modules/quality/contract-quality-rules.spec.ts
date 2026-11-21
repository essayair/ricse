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

  it('模板参考指标即使超出标准或缺少实测值也不拦截结算', () => {
    const reference = { items: [{ code: 'H2O', name: '水分', operator: 'LTE', standardValue: 10,
      deductionMode: 'NONE', rejectOperator: 'NONE' }] };
    const measured = evaluateContractQualityRules(reference, [{ code: 'H2O', measuredValue: 10.1 }]);
    expect(measured?.disposition).toBe('PASS');
    expect(measured?.items[0].result).toBe('REFERENCE');
    expect(evaluateContractQualityRules(reference, [])?.disposition).toBe('PASS');
    expect(evaluateContractQualityRules({ items: [{ ...reference.items[0], deductionCondition: 'IN_RANGE', deductionLowerValue: 0, deductionUpperValue: 10 }] }, [{ code: 'H2O', measuredValue: 10.1 }])?.disposition).toBe('PASS');
  });

  it('明确选择超标待人工判定时才拦截', () => {
    const review = { items: [{ code: 'H2O', name: '水分', operator: 'LTE', standardValue: 10,
      deductionMode: 'REVIEW', rejectOperator: 'NONE' }] };
    expect(evaluateContractQualityRules(review, [{ code: 'H2O', measuredValue: 10.1 }])?.disposition).toBe('REVIEW_REQUIRED');
  });

  it('仅明确配置拒收条件时不因模板标准超限而拦截', () => {
    const rejectOnly = { items: [{ code: 'H2O', name: '水分', operator: 'LTE', standardValue: 10,
      deductionMode: 'NONE', rejectOperator: 'GT', rejectValue: 15 }] };
    expect(evaluateContractQualityRules(rejectOnly, [{ code: 'H2O', measuredValue: 10.1 }])?.disposition).toBe('PASS');
    expect(evaluateContractQualityRules(rejectOnly, [{ code: 'H2O', measuredValue: 15.1 }])?.disposition).toBe('REJECT');
  });
});
