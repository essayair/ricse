import assert from 'node:assert/strict';
import test from 'node:test';
import { gradePriceRuleErrors } from './grade-price-validation';
import type { GradePriceSnapshot } from '../components/contracts/grade-price-rules-editor';

const rule: GradePriceSnapshot = { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX', quantityBasis: 'DRY_MATTER', selectedSpec: 'FRAGMENT', moistureMaxPct: 5, formulaConfirmed: true, exceptionHandling: 'MANUAL_REVIEW', bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: null } }] };

test('完整规则无错误，未采用规格可以留空价格', () => assert.deepEqual(gradePriceRuleErrors(rule), {}));
test('新免扣模式要求基准水分，但质量水分上限可以明确不设', () => {
  assert.deepEqual(gradePriceRuleErrors({ ...rule, moistureDeductionMode: 'EXCESS', moistureBasePct: 5, moistureMaxPct: null }), {});
  assert.equal(gradePriceRuleErrors({ ...rule, moistureDeductionMode: 'EXCESS', moistureBasePct: null }).moistureBasePct, '请填写基准水分，须大于等于0且小于100%');
  assert.deepEqual(gradePriceRuleErrors({ ...rule, moistureDeductionMode: 'EXCESS', moistureBasePct: 0, moistureMaxPct: null }), {});
});
test('规格、计价重量、水分上限有独立错误位置，不再要求人工确认勾选', () => {
  const errors = gradePriceRuleErrors({ ...rule, selectedSpec: '', quantityBasis: undefined, moistureMaxPct: null, formulaConfirmed: false });
  assert.deepEqual(Object.keys(errors), ['selectedSpec', 'quantityBasis', 'moistureMaxPct']);
  assert.match(errors.selectedSpec, /本行货物规格/);
});
test('水分0合法，空值不是0，越界须提示', () => {
  assert.deepEqual(gradePriceRuleErrors({ ...rule, moistureMaxPct: 0 }), {});
  for (const value of [-1, 101, NaN]) assert.match(gradePriceRuleErrors({ ...rule, moistureMaxPct: value }).moistureMaxPct, /0至100/);
});
test('区间、所选规格报价错误定位到具体档位', () => {
  assert.match(gradePriceRuleErrors({ ...rule, bands: [] }).bands, /至少填写一个/);
  assert.match(gradePriceRuleErrors({ ...rule, bands: [{ lower: null, upper: 15, rates: { FRAGMENT: null, RUN_OF_MINE: null } }] })['bands.0.range'], /第1档/);
  assert.match(gradePriceRuleErrors({ ...rule, selectedSpec: 'RUN_OF_MINE' })['bands.0.RUN_OF_MINE'], /第1档统矿单价/);
});
test('暂停回收率入口后隐藏条款不阻断填写，保存时由后台移除', () => {
  assert.equal(gradePriceRuleErrors({ ...rule, recoveryAdjustment: { baselinePct: null, deductionPerPointPerDegree: null, stepMode: 'PROPORTIONAL' } }).recovery, undefined);
});

test('多规格统一计价只要求一套同步价格，分别计价逐个校验', () => {
  const unified: GradePriceSnapshot = { ...rule, selectedSpec: '', specPricingMode: 'UNIFIED', applicableSpecs: ['FRAGMENT', 'RUN_OF_MINE'], bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: 14.8 } }] };
  assert.deepEqual(gradePriceRuleErrors(unified), {});
  assert.match(gradePriceRuleErrors({ ...unified, applicableSpecs: [] }).selectedSpec, /至少选择一种/);
  assert.match(gradePriceRuleErrors({ ...unified, bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: 16 } }] })['bands.0.FRAGMENT'], /统一价格不一致/);
  assert.match(gradePriceRuleErrors({ ...unified, specPricingMode: 'BY_SPEC', bands: rule.bands })['bands.0.RUN_OF_MINE'], /统矿单价/);
});
