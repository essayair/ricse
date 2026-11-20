import { evaluateGradePrice, parseGradePriceRules } from './grade-price-rules';

describe('合同适用规格与逐车取价', () => {
  const base: any = { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX', quantityBasis: 'DRY_MATTER', moistureDeductionMode: 'EXCESS', moistureBasePct: 5, moistureMaxPct: null, exceptionHandling: 'MANUAL_REVIEW', formulaConfirmed: true, specPricingMode: 'UNIFIED', applicableSpecs: ['FRAGMENT', 'RUN_OF_MINE'], bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 22.7, RUN_OF_MINE: 22.7 } }] };
  const report = [{ code: 'CAF2', unit: '%', measuredValue: 32.5 }, { code: 'MOISTURE', unit: '%', measuredValue: 3 }];
  it('统一计价一套价格适用两规格，未填本车规格也可计算', () => {
    for (const spec of ['FRAGMENT', 'RUN_OF_MINE', null] as const) expect(evaluateGradePrice(base, spec, 48.4, report)).toMatchObject({ status: 'READY', rate: 22.7, unitPrice: 737.75, amountExTax: 35707.1 });
  });
  it('分别计价必须按车选规格，不能退回合同默认规格猜价', () => {
    const rule = { ...base, specPricingMode: 'BY_SPEC', selectedSpec: 'FRAGMENT', bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 22.7, RUN_OF_MINE: 24 } }] };
    expect(evaluateGradePrice(rule, null, 100, report)).toMatchObject({ status: 'REVIEW_REQUIRED', reasons: [expect.stringContaining('补充本车货物规格')] });
    expect(evaluateGradePrice(rule, 'RUN_OF_MINE', 100, report)).toMatchObject({ status: 'READY', rate: 24, unitPrice: 780, amountExTax: 78000 });
    expect(evaluateGradePrice(rule, 'FRAGMENT', 100, report)).toMatchObject({ status: 'READY', rate: 22.7, unitPrice: 737.75 });
  });
  it('采销各用自己的价格，不共享一套数字', () => {
    const sale = { ...base, bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 25, RUN_OF_MINE: 25 } }] };
    expect(evaluateGradePrice(base, 'FRAGMENT', 100, report)).toMatchObject({ amountExTax: 73775 });
    expect(evaluateGradePrice(sale, 'FRAGMENT', 100, report)).toMatchObject({ amountExTax: 81250 });
  });
  it('拒绝统一价不同、漏填适用规格价格和合同外规格', () => {
    expect(() => parseGradePriceRules({ ...base, bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 22.7, RUN_OF_MINE: 24 } }] })).toThrow('必须一致');
    expect(() => parseGradePriceRules({ ...base, specPricingMode: 'BY_SPEC', bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 22.7, RUN_OF_MINE: null } }] })).toThrow('统矿单价');
    expect(() => parseGradePriceRules({ ...base, applicableSpecs: ['FRAGMENT', 'FRAGMENT'] })).toThrow('不可重复');
    expect(evaluateGradePrice({ ...base, applicableSpecs: ['FRAGMENT'] }, 'RUN_OF_MINE', 100, report)).toMatchObject({ status: 'REVIEW_REQUIRED', reasons: [expect.stringContaining('不在合同适用规格内')] });
  });
  it('旧合同未声明新模式时继续按原单规格取价，不扩展适用范围', () => {
    const { applicableSpecs: _, specPricingMode: __, ...old } = base;
    const legacy = { ...old, selectedSpec: 'RUN_OF_MINE', bands: [{ lower: 30, upper: 35, rates: { FRAGMENT: 22.7, RUN_OF_MINE: 24 } }] };
    expect(evaluateGradePrice(legacy, null, 100, report)).toMatchObject({ status: 'READY', spec: 'RUN_OF_MINE', rate: 24 });
    expect(parseGradePriceRules(legacy)).toEqual(legacy);
  });
});
