import assert from 'node:assert/strict';
import test from 'node:test';
import { freightWeightChoices, lowerFreightWeightStage } from './logistics-weight';

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
