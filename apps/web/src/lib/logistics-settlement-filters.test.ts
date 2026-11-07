import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateMatches, emptyCandidateFilters, emptySettlementFilters, logisticsDay, logisticsSelectionGroup, retainCandidateSelection, settlementMatches } from './logistics-settlement-filters';

const candidate = { id: 'w1', waybillNo: 'WB-001', plateNo: '甘A12345', materialName: '萤石精粉', businessType: 'PURCHASE', signedAt: '2026-11-02T15:59:59Z',
  payerPartner: { id: 'owner', name: '贸易货主' }, businessUnit: { id: 'unit', name: '玉门事业部' }, carrierPartnerId: 'carrier', carrierName: '东起物流',
  originLocation: '甘肃酒泉', destinationLocation: '玉门仓库', tradeContract: { id: 'contract', contractNo: 'CG-001', title: '精粉采购合同' }, order: { id: 'order', orderNo: 'PC-001', name: '第一批' } };
test('运单支持组合筛选货主、承运方、事业部、合同、执行批次及方向', () => {
  const filters = { ...emptyCandidateFilters(), ownerId: 'owner', carrierId: 'carrier', businessUnitId: 'unit', contractId: 'contract', orderId: 'order', businessType: 'PURCHASE' };
  assert.equal(candidateMatches(candidate, filters, false), true);
  for (const key of ['ownerId', 'carrierId', 'businessUnitId', 'contractId', 'orderId', 'businessType'] as const) {
    assert.equal(candidateMatches(candidate, { ...filters, [key]: 'other' }, false), false);
  }
});
test('模糊搜索支持空格分隔的多关键词，覆盖路线及合同批次', () => {
  for (const search of ['萤石 甘a', '东起 PC-001', 'CG-001 酒泉', '玉门 第一批']) {
    assert.equal(candidateMatches(candidate, { ...emptyCandidateFilters(), search }, false), true);
  }
  assert.equal(candidateMatches(candidate, { ...emptyCandidateFilters(), search: '萤石 不存在' }, false), false);
});
test('签收日期按北京时间包含结束日全天，错误日期范围返回空结果', () => {
  const filters = { ...emptyCandidateFilters(), from: '2026-11-02', to: '2026-11-02' };
  assert.equal(logisticsDay(candidate.signedAt), '2026-11-02');
  assert.equal(candidateMatches(candidate, filters, false), true);
  assert.equal(candidateMatches({ ...candidate, signedAt: '2026-11-02T16:00:00Z' }, filters, false), false);
  assert.equal(candidateMatches(candidate, { ...filters, from: '2026-11-03' }, false), false);
});
test('待绑定承运方、仅看已选可以独立或组合使用', () => {
  const unbound = { ...candidate, carrierPartnerId: null };
  const filters = { ...emptyCandidateFilters(), carrierId: 'UNBOUND', selectedOnly: true };
  assert.equal(candidateMatches(unbound, filters, true), true);
  assert.equal(candidateMatches(unbound, filters, false), false);
  assert.equal(candidateMatches(candidate, filters, true), false);
});
test('筛选不改选中内容，刷新仅剔除已不在可结算范围的运单', () => {
  const selected = { w1: { price: '100' }, w2: { price: '200' } };
  candidateMatches(candidate, { ...emptyCandidateFilters(), search: '不匹配' }, true);
  assert.deepEqual(selected, { w1: { price: '100' }, w2: { price: '200' } });
  assert.deepEqual(retainCandidateSelection([{ id: 'w1' }, { id: 'new' }], selected), { w1: { price: '100' } });
});
test('结算分组同时区分货主、事业部和承运方，未绑定不能被批量误选', () => {
  assert.equal(logisticsSelectionGroup(candidate), 'owner|unit|carrier');
  assert.notEqual(logisticsSelectionGroup({ ...candidate, carrierPartnerId: 'other' }), logisticsSelectionGroup(candidate));
  assert.equal(logisticsSelectionGroup({ ...candidate, carrierPartnerId: null }), null);
});
const settlement = { settlementNo: 'JS-001', status: 'DRAFT', periodStart: '2026-11-01T00:00:00+08:00', periodEnd: '2026-11-30T23:59:59+08:00',
  payerPartner: { id: 'payer', name: '付款主体' }, carrierPartner: { id: 'carrier', name: '东起物流' }, businessUnit: { id: 'unit', name: '玉门事业部' },
  lines: [{ materialName: '萤石精粉', ticketNo: 'PD-001', waybill: { waybillNo: 'WB-001', plateNo: '甘A12345' }, contractPriceTerm: { contract: { contractNo: 'WL-001' } } }] };
test('结算单列表按周期交集筛选，不遗漏跨月结算单', () => {
  assert.equal(settlementMatches(settlement, { ...emptySettlementFilters(), from: '2026-11-15', to: '2026-11-16' }), true);
  assert.equal(settlementMatches(settlement, { ...emptySettlementFilters(), from: '2026-12-01' }), false);
});
test('结算单按状态、付款主体、承运方、事业部组合过滤并查找运单或车牌', () => {
  const filters = { ...emptySettlementFilters(), status: 'DRAFT', carrierId: 'carrier', payerId: 'payer', businessUnitId: 'unit', search: '甘a WL-001' };
  assert.equal(settlementMatches(settlement, filters), true);
  for (const key of ['status', 'carrierId', 'payerId', 'businessUnitId'] as const) assert.equal(settlementMatches(settlement, { ...filters, [key]: 'other' }), false);
});
test('旧单据缺少企业、事业部或合同引用仍可在未加条件时正常浏览', () => {
  assert.equal(settlementMatches({ settlementNo: 'OLD-1', status: 'VOIDED', periodStart: '2026-10-01', periodEnd: '2026-10-02', lines: [] }, emptySettlementFilters()), true);
});
