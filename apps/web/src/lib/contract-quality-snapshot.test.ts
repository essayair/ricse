import test from 'node:test';
import assert from 'node:assert/strict';
import { contractQualitySnapshot, contractQualityTemplateItems } from './contract-quality-snapshot';

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
test('新取模板时不参与判定的参考指标不进入合同验收规则，旧快照不变', () => {
  const items = [{ code: 'CAF2', participates: true, standardValue: 10 }, { code: 'CACO3', participates: false, standardValue: null }, { code: 'MOISTURE', participates: false, standardValue: 10 }];
  assert.deepEqual(contractQualityTemplateItems(items), [items[0]]);
  const saved = { materialId: 'ore', items };
  assert.equal(contractQualitySnapshot(saved, 'ore'), saved);
  assert.equal(saved.items.length, 3);
  assert.deepEqual(contractQualityTemplateItems([{ code: 'LEGACY' }]), [{ code: 'LEGACY' }]);
});
