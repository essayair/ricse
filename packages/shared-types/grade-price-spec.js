/** 合同适用规格与运单实际规格分离；未声明新模式的历史快照保持单规格取价。 */
const CARGO_SPECS = ['FRAGMENT', 'RUN_OF_MINE'];
const SPEC_LABELS = { FRAGMENT: '碎屑', RUN_OF_MINE: '统矿' };
function applicableGradeSpecs(rule) {
  if (!rule) return [];
  if (rule.specPricingMode == null) return CARGO_SPECS.includes(rule.selectedSpec) ? [rule.selectedSpec] : [];
  return CARGO_SPECS.filter(spec => Array.isArray(rule.applicableSpecs) && rule.applicableSpecs.includes(spec));
}
function resolveGradeSpec(rule, actualSpec) {
  const specs = applicableGradeSpecs(rule);
  if (actualSpec && !specs.includes(actualSpec)) return { error: `本车规格“${SPEC_LABELS[actualSpec] || actualSpec}”不在合同适用规格内` };
  if (actualSpec) return { spec: actualSpec };
  if (specs.length === 1 || rule?.specPricingMode === 'UNIFIED') return specs.length ? { spec: specs[0] } : { error: '合同未配置适用规格' };
  return { error: '合同按规格分别计价，请先在物流运单补充本车货物规格（碎屑或统矿）' };
}
module.exports = { CARGO_SPECS, SPEC_LABELS, applicableGradeSpecs, resolveGradeSpec };
