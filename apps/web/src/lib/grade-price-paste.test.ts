import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePastedBands } from './grade-price-paste';
import type { GradeSpecRule } from '@ricse/shared-types/grade-price-spec';

const unified: GradeSpecRule = { specPricingMode: 'UNIFIED', applicableSpecs: ['FRAGMENT', 'RUN_OF_MINE'] };
test('统一价粘贴三列，同步填两种规格的元/度价', () => {
  assert.deepEqual(parsePastedBands('CaF₂ 下限 上限 价格\n10\t15\t14.80\n15\t20\t18.5', unified), [
    { lower: 10, upper: 15, rates: { FRAGMENT: 14.8, RUN_OF_MINE: 14.8 } }, { lower: 15, upper: 20, rates: { FRAGMENT: 18.5, RUN_OF_MINE: 18.5 } },
  ]);
});
test('不同规格价格不能在统一模式下静默覆盖', () => assert.throws(() => parsePastedBands('10 15 14.8 15', unified), /分别计价/));
test('两规格分别计价读取四列，单规格兼容三列', () => {
  assert.deepEqual(parsePastedBands('10 15 14.8 15', { ...unified, specPricingMode: 'BY_SPEC' })[0].rates, { FRAGMENT: 14.8, RUN_OF_MINE: 15 });
  assert.throws(() => parsePastedBands('10 15 14.8', { ...unified, specPricingMode: 'BY_SPEC' }), /四列/);
  assert.deepEqual(parsePastedBands('10 15 15', { selectedSpec: 'RUN_OF_MINE' })[0].rates, { FRAGMENT: null, RUN_OF_MINE: 15 });
});
test('缺规格、负价格不接受', () => {
  assert.throws(() => parsePastedBands('10 15 15', {}), /适用规格/);
  assert.throws(() => parsePastedBands('10 15 -15', unified), /无效/);
});
