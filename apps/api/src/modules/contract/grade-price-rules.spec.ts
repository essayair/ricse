import { DEFAULT_FLUORITE_ORE_BANDS, evaluateGradePrice, parseGradePriceRules } from './grade-price-rules';

const rules = { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS',
  rateUnit: 'CNY_PER_DEGREE_EX_TAX', moistureMaxPct: 5, bands: DEFAULT_FLUORITE_ORE_BANDS,
  exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'FRAGMENT', formulaConfirmed: true };

describe('萤石矿品位分档计价', () => {
  it('37% 落在 35–40 档，按元/度计算税前单价与金额', () => {
    expect(evaluateGradePrice(rules, 'FRAGMENT', 100, [
      { code: 'CAF2', measuredValue: 37, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
    ])).toMatchObject({ status: 'READY', gradePct: 37, rate: 23.2, unitPrice: 858.4, amountExTax: 85840 });
  });
  it('区间下闭上开，50% 属表外，不自动套最高档', () => {
    expect(evaluateGradePrice(rules, 'RUN_OF_MINE', 1, [
      { code: 'CAF2', measuredValue: 50, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
    ])).toMatchObject({ status: 'REVIEW_REQUIRED' });
  });
  it('水分超过5%需人工确认，不自动形成金额', () => {
    const result = evaluateGradePrice(rules, 'FRAGMENT', 100, [
      { code: 'CAF2', measuredValue: 37, unit: '%' }, { code: 'MOISTURE', measuredValue: 6, unit: '%' },
    ]);
    expect(result).toMatchObject({ status: 'REVIEW_REQUIRED' });
    expect(result).not.toHaveProperty('amountExTax');
  });
  it('重叠或缺档规则不能提交合同', () => {
    expect(() => parseGradePriceRules({ ...rules, bands: [rules.bands[0], { ...rules.bands[1], lower: 14 }] })).toThrow('连续、不重叠');
  });
  it('新合同未填价格表时不能提交，草稿可保留空白', () => {
    expect(() => parseGradePriceRules({ ...rules, bands: [], moistureMaxPct: null })).toThrow('请确认品位分档价格规则');
  });
  it('只填写本行货物规格的价格也可以提交，另一规格不被自动套价', () => {
    const oneSpec = { ...rules, bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: null } }] };
    expect(parseGradePriceRules(oneSpec).bands[0].rates.RUN_OF_MINE).toBeNull();
    expect(evaluateGradePrice(oneSpec, 'FRAGMENT', 10, [
      { code: 'CAF2', measuredValue: 12, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
    ])).toMatchObject({ status: 'READY', amountExTax: 1776 });
    expect(evaluateGradePrice(oneSpec, 'RUN_OF_MINE', 10, [
      { code: 'CAF2', measuredValue: 12, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
    ])).toMatchObject({ status: 'REVIEW_REQUIRED' });
  });
});
