import assert from 'node:assert/strict';
import test from 'node:test';
import { batchReportSelection, batchWeighSelection } from './settlement-basis-selection';

const sources = ['a', 'b'].map(id => ({ id, reportId: `${id}-r`, defaultReportId: `${id}-r`,
  availableQualityReports: [{ id: `${id}-s`, evidenceStage: 'SHIPPING' }, { id: `${id}-r`, evidenceStage: 'RECEIVING' }, { id: 'shared', evidenceStage: 'SHIPPING' }],
  availableWeighTickets: [{ id: `${id}-ts`, weighingStage: 'SHIPPING' }, { id: `${id}-tr`, weighingStage: 'RECEIVING' }] }));
const shipping = { a: { qualityReportId: 'a-s', weighTicketId: 'a-ts' }, b: { qualityReportId: 'b-s', weighTicketId: 'b-ts' } };
const receiving = { a: { qualityReportId: 'a-r', weighTicketId: 'a-tr' }, b: { qualityReportId: 'b-r', weighTicketId: 'b-tr' } };

test('全部使用发货侧后显示发货侧，不退回请选择', () => {
  assert.equal(batchReportSelection(sources, shipping), 'SHIPPING');
  assert.equal(batchWeighSelection(sources, shipping), 'SHIPPING');
});
test('全部使用收货侧后显示收货侧', () => {
  assert.equal(batchReportSelection(sources, receiving), 'RECEIVING');
  assert.equal(batchWeighSelection(sources, receiving), 'RECEIVING');
});
test('逐车改选或批量只成功部分时显示混合口径', () => {
  const mixed = { a: shipping.a, b: receiving.b };
  assert.equal(batchReportSelection(sources, mixed, 'SHIPPING'), 'MIXED');
  assert.equal(batchWeighSelection(sources, mixed), 'MIXED');
});
test('仅统计当前筛选中已选车辆，未选车不影响选中态', () => {
  assert.equal(batchReportSelection(sources, { a: shipping.a }), 'SHIPPING');
  assert.equal(batchReportSelection([sources[1]], { a: shipping.a, b: receiving.b }), 'RECEIVING');
  assert.equal(batchWeighSelection([sources[1]], { a: shipping.a, b: receiving.b }), 'RECEIVING');
});
test('没有选中车辆时显示占位，不沿用上一次操作', () => {
  assert.equal(batchReportSelection(sources, {}, 'SHIPPING'), '');
  assert.equal(batchWeighSelection(sources, {}), '');
});
test('选择默认报告后显示默认报告，实际不一致时不能显示操作成功', () => {
  assert.equal(batchReportSelection(sources, receiving, 'DEFAULT'), 'DEFAULT');
  assert.equal(batchReportSelection(sources, { a: shipping.a, b: receiving.b }, 'DEFAULT'), 'MIXED');
});
test('选择共用报告时保留具体报告，后续逐车改选自动纠正', () => {
  const shared = { a: { qualityReportId: 'shared' }, b: { qualityReportId: 'shared' } };
  assert.equal(batchReportSelection(sources, shared, 'REPORT:shared'), 'REPORT:shared');
  assert.equal(batchReportSelection(sources, { ...shared, b: receiving.b }, 'REPORT:shared'), 'MIXED');
});
test('缺失的报告不被误显示为发货侧或收货侧', () => {
  assert.equal(batchReportSelection(sources, { a: { qualityReportId: 'missing' } }), 'MISSING');
  assert.equal(batchReportSelection(sources, { a: { qualityReportId: 'missing' }, b: receiving.b }), 'MIXED');
});
