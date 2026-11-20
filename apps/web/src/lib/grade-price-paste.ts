import { applicableGradeSpecs, type GradeSpecRule } from '@ricse/shared-types/grade-price-spec';

/** 统一计价三列；分别计价且选两种规格时四列。不隐式复制不同规格价格。 */
export function parsePastedBands(text: string, rule: GradeSpecRule) {
  const specs = applicableGradeSpecs(rule);
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(row => row && /\d/.test(row.replace(/CaF[₂2]/gi, '品位')));
  if (!rows.length) throw new Error('请先粘贴品位区间和单价');
  if (!specs.length) throw new Error('粘贴价格前，请先选择合同适用规格');
  return rows.map((row, index) => {
    const numbers = row.replace(/CaF[₂2]/gi, '品位').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length !== 3 && numbers.length !== 4) throw new Error(`第 ${index + 1} 行应填写下限、上限和单价；也可以分别填写两种规格的单价`);
    const [lower, upper, firstRate, secondRate] = numbers;
    if (lower < 0 || upper > 100 || lower >= upper || firstRate <= 0 || (secondRate !== undefined && secondRate <= 0)) throw new Error(`第 ${index + 1} 行的品位区间或单价无效`);
    if (rule.specPricingMode === 'UNIFIED' && secondRate !== undefined && secondRate !== firstRate) throw new Error(`第 ${index + 1} 行两种规格价格不同，请改为按规格分别计价`);
    if (rule.specPricingMode !== 'UNIFIED' && secondRate === undefined && specs.length > 1) throw new Error('分别计价时请粘贴下限、上限、碎屑价、统矿价四列');
    return { lower, upper, rates: {
      FRAGMENT: !specs.includes('FRAGMENT') ? null : firstRate,
      RUN_OF_MINE: !specs.includes('RUN_OF_MINE') ? null : rule.specPricingMode === 'UNIFIED' || secondRate === undefined ? firstRate : secondRate,
    } };
  });
}
