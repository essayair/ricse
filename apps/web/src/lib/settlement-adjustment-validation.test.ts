import assert from 'node:assert/strict';
import test from 'node:test';
import { adjustmentIssuesFromServer, settlementAdjustmentIssues, CHECK_ADJUSTMENT_FIELDS } from './settlement-adjustment-validation';

const input = { mode: 'QUANTITY' as const, quantity: '1044.88', amount: '', reason: '双方确认', quantityCeiling: 1049.389, baseQuantity: 1040.477 };
test('协商干基在双方上限内、包括边界时不报错，较低于基线也可协商', () => {
  for (const quantity of ['1044.88', '1049.389', '1040', '1.2340']) assert.deepEqual(settlementAdjustmentIssues({ ...input, quantity }), {});
});
test('超限在数量位置提示准确上限，不改原输入', () => {
  const value = { ...input, quantity: '1049.390' };
  assert.deepEqual(settlementAdjustmentIssues(value), { quantity: '协商干基数量不能超过 1049.389 吨，请核对双方单据或修改数量。' });
  assert.equal(value.quantity, '1049.390');
});
test('数量为空、零、负数和非法值用正数提示', () => {
  for (const quantity of ['', ' ', '0', '-1', 'NaN', 'Infinity']) assert.equal(settlementAdjustmentIssues({ ...input, quantity }).quantity, '请填写大于 0 的协商干基数量。');
});
test('数量精度独立提示，支持数值精度与科学记数法', () => {
  for (const quantity of ['1.2345', '1e-4', '1.000000001']) assert.equal(settlementAdjustmentIssues({ ...input, quantity }).quantity, '干基数量最多保留 3 位小数。');
  assert.deepEqual(settlementAdjustmentIssues({ ...input, quantity: '1e-3' }), {});
});
test('缺少协商说明标记说明字段，恢复原数量不再视为人工调整', () => {
  assert.deepEqual(settlementAdjustmentIssues({ ...input, reason: ' ' }), { reason: '请填写双方协商调整的原因。' });
  assert.deepEqual(settlementAdjustmentIssues({ ...input, quantity: '1040.477', reason: '' }), {});
});
test('未获取上限时不把未知当零，普通明细不校验隐藏的调整字段', () => {
  assert.deepEqual(settlementAdjustmentIssues({ ...input, quantityCeiling: null }), {});
  assert.deepEqual(settlementAdjustmentIssues({ ...input, mode: 'NONE', quantity: '', reason: '' }), {});
});
test('金额调整同样定位正数、精度与原因错误，不校验隐藏的干基', () => {
  const amount = { ...input, mode: 'AMOUNT' as const, quantity: '', amount: '10.01', baseAmount: 10 };
  assert.deepEqual(settlementAdjustmentIssues(amount), {});
  assert.equal(settlementAdjustmentIssues({ ...amount, amount: '' }).amount, '请填写大于 0 的结算金额。');
  assert.equal(settlementAdjustmentIssues({ ...amount, amount: '1.001' }).amount, '结算金额最多保留 2 位小数。');
  assert.deepEqual(settlementAdjustmentIssues({ ...amount, reason: '' }), { reason: '请填写双方协商调整的原因。' });
});
test('服务端并发变更/格式错误定位字段，非调整错误保留正常处理', () => {
  const message = '双方计量或质检依据已变更，当前可协商数量为 1040.477 吨，请重新核对最终干基数量';
  assert.deepEqual(adjustmentIssuesFromServer(message, 'QUANTITY'), { quantity: message });
  assert.deepEqual(adjustmentIssuesFromServer('请填写双方协商调整的原因。', 'QUANTITY'), { reason: '请填写双方协商调整的原因。' });
  assert.deepEqual(adjustmentIssuesFromServer('合同无权访问', 'QUANTITY'), {});
  assert.equal(CHECK_ADJUSTMENT_FIELDS, '请检查标红的填写项。');
});
