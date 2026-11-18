import assert from 'node:assert/strict';
import test from 'node:test';
import { moisturePricingQuantity } from '@ricse/shared-types/moisture-pricing';

test('前端按免扣基准实时重算，切换水分及磅单保持口径一致', () => {
  const rule = { moistureDeductionMode: 'EXCESS' as const, moistureBasePct: 5 };
  assert.equal(moisturePricingQuantity(100, 3, rule), 100);
  assert.equal(moisturePricingQuantity(100, 5, rule), 100);
  assert.equal(moisturePricingQuantity(100, 6.8, rule), 98.2);
  assert.equal(moisturePricingQuantity(98, 6.8, rule), 96.236);
  assert.equal(moisturePricingQuantity(100, 6.8), 93.2);
});
test('尚未选磅单、无水分或未填基准时不虚构数量', () => {
  assert.equal(moisturePricingQuantity(null, 6.8), null);
  assert.equal(moisturePricingQuantity(100, null), null);
  assert.equal(moisturePricingQuantity(100, 6.8, { moistureDeductionMode: 'EXCESS' }), null);
});
