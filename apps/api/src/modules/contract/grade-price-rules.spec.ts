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
    expect(() => parseGradePriceRules({ ...rules, bands: [] })).toThrow('请至少填写一个品位区间');
  });
  it.each([
    ['selectedSpec', '', '请选择本行货物规格'],
    ['moistureMaxPct', null, '请填写水分上限'],
    ['moistureMaxPct', -1, '水分上限必须'],
    ['formulaConfirmed', false, '请勾选确认品位分档规则、元/度口径及人工例外处理'],
    ['exceptionHandling', undefined, '人工例外处理规则缺失'],
  ])('缺失或错误字段 %s 返回准确提示', (key, value, message) => {
    expect(() => parseGradePriceRules({ ...rules, [key]: value })).toThrow(message as string);
  });
  it('新提交必须明确计价重量，存量规则计算保持兼容', () => {
    expect(() => parseGradePriceRules(rules, { requireQuantityBasis: true })).toThrow('请选择计价重量');
    expect(() => parseGradePriceRules(rules)).not.toThrow();
    expect(() => parseGradePriceRules({ ...rules, quantityBasis: 'PHYSICAL' }, { requireQuantityBasis: true })).not.toThrow();
    expect(() => parseGradePriceRules({ ...rules, quantityBasis: 'DRY_MATTER' }, { requireQuantityBasis: true })).not.toThrow();
  });
  it('缺价提示准确指向第几档及规格', () => {
    expect(() => parseGradePriceRules({ ...rules, bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: null, RUN_OF_MINE: null } }] })).toThrow('第1档碎屑单价');
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

  describe('选矿回收率扣价', () => {
    const withRecovery = (stepMode: 'PROPORTIONAL' | 'FULL_POINT' = 'PROPORTIONAL') => ({ ...rules,
      recoveryAdjustment: { baselinePct: 86, deductionPerPointPerDegree: 0.4, stepMode } });
    const facts = (recovery?: number) => [
      { code: 'CAF2', measuredValue: 37, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
      ...(recovery == null ? [] : [{ code: 'RECOVERY', name: 'CaF₂选矿回收率', measuredValue: recovery, unit: '%' }]),
    ];
    it('低于基准按差额线性扣价，档位原单价不变', () => {
      // 37 度 × 0.4 元/度/点 × (86 − 84.5) = 22.2 元/吨
      expect(evaluateGradePrice(withRecovery(), 'FRAGMENT', 100, facts(84.5))).toMatchObject({
        status: 'READY', unitPrice: 858.4, recoveryPct: 84.5,
        recovery: { shortfallPoints: 1.5, deductionPerDegree: 0.6, deductionPerTon: 22.2 },
        netUnitPrice: 836.2, amountExTax: 83620,
      });
    });
    it('按整百分点计算时，不足1个百分点的差额不扣', () => {
      expect(evaluateGradePrice(withRecovery('FULL_POINT'), 'FRAGMENT', 100, facts(84.5))).toMatchObject({
        status: 'READY', recovery: { shortfallPoints: 1, deductionPerTon: 14.8 }, netUnitPrice: 843.6,
      });
    });
    it('达到或高于基准只扣不奖', () => {
      expect(evaluateGradePrice(withRecovery(), 'FRAGMENT', 100, facts(90))).toMatchObject({
        status: 'READY', recovery: { shortfallPoints: 0, deductionPerTon: 0 }, netUnitPrice: 858.4, amountExTax: 85840,
      });
    });
    it('合同约定回收率条款但报告缺回收率实测值时转人工', () => {
      const result = evaluateGradePrice(withRecovery(), 'FRAGMENT', 100, facts());
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.reasons.join()).toContain('选矿回收率');
    });
    it('回收率指标不会被误读为 CaF₂ 品位', () => {
      const result = evaluateGradePrice(withRecovery(), 'FRAGMENT', 100, [
        { code: 'RECOVERY', name: 'CaF₂回收率', measuredValue: 84, unit: '%' },
        { code: 'CAF2', measuredValue: 37, unit: '%' }, { code: 'MOISTURE', measuredValue: 4, unit: '%' },
      ]);
      expect(result).toMatchObject({ status: 'READY', gradePct: 37, recoveryPct: 84 });
    });
    it('未约定回收率条款时结果不含回收率字段，存量结算依据签名不变', () => {
      const result = evaluateGradePrice(rules, 'FRAGMENT', 100, facts(80));
      expect(result).not.toHaveProperty('recovery');
      expect(result).not.toHaveProperty('recoveryPct');
      expect(result).not.toHaveProperty('netUnitPrice');
    });
    it('回收率条款参数不完整时不能提交合同', () => {
      expect(() => parseGradePriceRules({ ...rules, recoveryAdjustment: { baselinePct: 86, deductionPerPointPerDegree: 0, stepMode: 'PROPORTIONAL' } })).toThrow('每低1个百分点');
      expect(() => parseGradePriceRules({ ...rules, recoveryAdjustment: { baselinePct: 120, deductionPerPointPerDegree: 0.4, stepMode: 'PROPORTIONAL' } })).toThrow('回收率基准');
    });
  });
});
