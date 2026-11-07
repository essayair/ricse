import assert from 'node:assert/strict';
import test from 'node:test';
import { freightWeightChoices, lowerFreightWeightStage, freightWeightSelectionStage, switchFreightWeightStage } from './logistics-weight';

const shipping = { id: 'shipping', weighingStage: 'SHIPPING', netWeight: '100.000' };
const receiving = { id: 'receiving', weighingStage: 'RECEIVING', netWeight: '98.500' };

test('双端都有磅单时默认选择收货，并标出较低收货净重', () => {
  assert.equal(freightWeightChoices([shipping, receiving]).defaultTicketId, 'receiving');
  assert.equal(freightWeightChoices([shipping, receiving]).lowerStage, 'RECEIVING');
});
test('发货更低时仍默认收货，不擅自按较低值选用', () => {
  const result = freightWeightChoices([{ ...shipping, netWeight: '97' }, receiving]);
  assert.equal(result.defaultTicketId, 'receiving');
  assert.equal(result.lowerStage, 'SHIPPING');
});
test('只有发货或只有收货磅单时选唯一有效磅单', () => {
  assert.equal(freightWeightChoices([shipping]).defaultTicketId, 'shipping');
  assert.equal(freightWeightChoices([receiving]).defaultTicketId, 'receiving');
  assert.equal(freightWeightChoices([shipping]).lowerStage, null);
});
test('相同净重不作较低值标记', () => {
  assert.equal(lowerFreightWeightStage('100.000', 100), null);
});
test('缺少、无效、零或负重量不参加比较或默认选用', () => {
  for (const value of [null, undefined, '', 'NaN', 0, -1]) assert.equal(lowerFreightWeightStage(value, 98), null);
  assert.equal(freightWeightChoices([{ ...receiving, netWeight: '0' }, shipping]).defaultTicketId, 'shipping');
  assert.equal(freightWeightChoices([]).defaultTicketId, '');
});
test('明确选择同节点旧磅单后，列表显示该张重量，不展示另一张误导用户', () => {
  const old = { ...receiving, id: 'old', netWeight: '97.500' };
  const result = freightWeightChoices([receiving, shipping, old], 'old');
  assert.equal(result.receiving?.id, 'old');
  assert.equal(result.receiving?.netWeight, '97.500');
});
test('手动切到发货时准确返回该张磅单，数据源不被修改', () => {
  const tickets = [shipping, receiving];
  const original = JSON.stringify(tickets);
  assert.equal(freightWeightChoices(tickets, 'shipping').shipping?.id, 'shipping');
  assert.equal(JSON.stringify(tickets), original);
});

const line = (ticketId = 'receiving') => ({ ticketId, weightBasis: 'TICKET' as 'TICKET' | 'CONFIRMED', confirmedWeight: '', weightReason: '', unitPrice: '100' });
const rows = [{ id: 'a', tickets: [shipping, receiving] }, { id: 'b', tickets: [shipping, receiving] }];
test('批量选发货净重同步全部已选行和表头状态，不改合同单价', () => {
  const selected = { a: line(), b: line() };
  const result = switchFreightWeightStage(rows, selected, 'SHIPPING', '按发货磅单确认运费');
  assert.deepEqual(result.switched, ['a', 'b']);
  assert.equal(result.lines.a.ticketId, 'shipping');
  assert.equal(result.lines.b.ticketId, 'shipping');
  assert.equal(result.lines.a.unitPrice, '100');
  assert.equal(freightWeightSelectionStage(rows, result.lines), 'SHIPPING');
  assert.equal(selected.a.ticketId, 'receiving');
});
test('缺少目标侧磅单不切换、不回退，保留原选择并显示混合状态', () => {
  const candidates = [rows[0], { id: 'b', tickets: [receiving] }];
  const result = switchFreightWeightStage(candidates, { a: line(), b: line() }, 'SHIPPING');
  assert.deepEqual(result.missing, ['b']);
  assert.equal(result.lines.b.ticketId, 'receiving');
  assert.equal(freightWeightSelectionStage(candidates, result.lines), 'MIXED');
});
test('仅处理当前范围已选行，未选行不新增，范围外的已选不修改', () => {
  const result = switchFreightWeightStage([rows[0], { id: 'unselected', tickets: [shipping] }], { a: line(), b: line() }, 'SHIPPING');
  assert.deepEqual(Object.keys(result.lines), ['a', 'b']);
  assert.equal(result.lines.a.ticketId, 'shipping');
  assert.equal(result.lines.b.ticketId, 'receiving');
});
test('手工确认重量切回磅单时清空手工值并采用新说明', () => {
  const result = switchFreightWeightStage(rows, { a: { ...line(), weightBasis: 'CONFIRMED' as const, confirmedWeight: '97', weightReason: '原手工重量依据' } }, 'RECEIVING', '改按收货磅单');
  assert.equal(result.lines.a.confirmedWeight, '');
  assert.equal(result.lines.a.weightBasis, 'TICKET');
  assert.equal(result.lines.a.weightReason, '改按收货磅单');
  assert.equal(freightWeightSelectionStage(rows, result.lines), 'RECEIVING');
});
test('保留已有业务说明和明确选用的同侧旧磅单', () => {
  const old = { ...shipping, id: 'old-shipping', netWeight: '99' };
  const candidates = [{ id: 'a', tickets: [shipping, old, receiving] }];
  const result = switchFreightWeightStage(candidates, { a: { ...line('old-shipping'), weightReason: '原有效说明' } }, 'SHIPPING', '统一新说明');
  assert.equal(result.lines.a.ticketId, 'old-shipping');
  assert.equal(result.lines.a.weightReason, '原有效说明');
});
test('清空选择后表头不保留已选口径，手工或失效磅单不误标统一', () => {
  assert.equal(freightWeightSelectionStage(rows, {}), '');
  assert.equal(freightWeightSelectionStage(rows, { a: { ...line(), weightBasis: 'CONFIRMED' } }), 'MIXED');
  assert.equal(freightWeightSelectionStage(rows, { a: line('missing') }), 'MIXED');
});
