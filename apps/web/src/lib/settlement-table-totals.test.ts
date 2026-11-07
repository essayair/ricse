import assert from 'node:assert/strict';
import test from 'node:test';
import { settlementColumnTotal } from './settlement-table-totals';

test('重量按逐行三位小数合计，避免浮点尾差', () => {
  assert.equal(settlementColumnTotal([0.1, '0.2', 32.123]), 32.423);
});
test('金额按分合计，保留负向调整', () => {
  assert.equal(settlementColumnTotal(['100.01', '-20.02', 0.03], 2), 80.02);
});
test('空列表为零，缺失或非法数据不冒充零', () => {
  assert.equal(settlementColumnTotal([]), 0);
  for (const value of [null, undefined, '', ' ', '无数据', NaN, Infinity]) {
    assert.equal(settlementColumnTotal([10, value]), null);
  }
});
