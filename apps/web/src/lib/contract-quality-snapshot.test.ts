import test from 'node:test';
import assert from 'node:assert/strict';
import { contractQualitySnapshot } from './contract-quality-snapshot';

test('保留同物料合同快照，不由最新模板替换', () => {
  const snapshot = { materialId: 'ore', items: [{ code: 'MOISTURE', standardValue: 5 }] };
  assert.equal(contractQualitySnapshot(snapshot, 'ore'), snapshot);
});
test('无物料字段的历史快照仍被保留，空规则也是明确快照', () => {
  const snapshot = { items: [] };
  assert.equal(contractQualitySnapshot(snapshot, 'ore'), snapshot);
});
test('切换物料时不采用其他物料的快照', () => {
  assert.equal(contractQualitySnapshot({ materialId: 'powder', items: [] }, 'ore'), null);
  assert.equal(contractQualitySnapshot(null, 'ore'), null);
});
