import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { directPurchaseFollowAdjustment } from './direct-settlement-follow';
const adjustment = { settlementId: 's', settlementNo: 'YS001', finalQuantity: 37.5, waybillLineItemIds: ['a', 'b'] };
test('采购选齐车辆后自动获取销售整单数量，不能自行估算分摊', () => {
  const result = directPurchaseFollowAdjustment(['a', 'b'].map(id => ({ id, followSales: true, followAdjustment: adjustment })));
  assert.equal(result.issue, ''); assert.equal(result.adjustment?.finalQuantity, 37.5);
});
test('少选、多选或混选其他业务均提示，而不是静默套用总数量', () => {
  assert.match(directPurchaseFollowAdjustment([{ id: 'a', followSales: true, followAdjustment: adjustment }]).issue, /选齐/);
  assert.match(directPurchaseFollowAdjustment(['a', 'b', 'c'].map(id => ({ id, followSales: true, followAdjustment: adjustment }))).issue, /选齐/);
});
test('不同整单销售结算必须分开处理，普通采购不受影响', () => {
  assert.match(directPurchaseFollowAdjustment([{ id: 'a', followSales: true, followAdjustment: adjustment }, { id: 'c', followSales: true, followAdjustment: { ...adjustment, settlementId: 's2' } }]).issue, /分别编制/);
  assert.equal(directPurchaseFollowAdjustment([{ id: 'a' }]).adjustment, null);
});
