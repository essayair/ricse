import assert from 'node:assert/strict';
import test from 'node:test';
import { gradePriceRuleErrors } from './grade-price-validation';
import type { GradePriceSnapshot } from '../components/contracts/grade-price-rules-editor';

const rule: GradePriceSnapshot = { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX', quantityBasis: 'DRY_MATTER', selectedSpec: 'FRAGMENT', moistureMaxPct: 5, formulaConfirmed: true, exceptionHandling: 'MANUAL_REVIEW', bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: null } }] };

test('完整规则无错误，未采用规格可以留空价格', () => assert.deepEqual(gradePriceRuleErrors(rule), {}));
test('规格、计价重量、水分上限和确认均有独立错误位置', () => {
  const errors = gradePriceRuleErrors({ ...rule, selectedSpec: '', quantityBasis: undefined, moistureMaxPct: null, formulaConfirmed: false });
  assert.deepEqual(Object.keys(errors), ['selectedSpec', 'quantityBasis', 'moistureMaxPct', 'formulaConfirmed']);
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
test('启用回收率条款时补充参数检查', () => {
  assert.match(gradePriceRuleErrors({ ...rule, recoveryAdjustment: { baselinePct: null, deductionPerPointPerDegree: null, stepMode: 'PROPORTIONAL' } }).recovery, /回收率基准/);
});
