import assert from 'node:assert/strict';
import test from 'node:test';
import { fundMatchesContract } from './settlement-fund-options';

test('待认领收款缺少合同不会报错，也不进入任何合同的候选列表', () => {
  for (const fund of [{ contract: null }, {}, { contract: undefined }]) {
    for (const contractId of ['contract-1', '', null, undefined]) {
      assert.equal(fundMatchesContract(fund, contractId), false);
    }
  }
});

test('已关联合同的资金仅匹配同一合同，未选择合同不匹配', () => {
  const fund = { contract: { id: 'contract-1' } };
  assert.equal(fundMatchesContract(fund, 'contract-1'), true);
  for (const contractId of ['contract-2', '', null, undefined]) {
    assert.equal(fundMatchesContract(fund, contractId), false);
  }
});

test('核销和退款筛选混合已关联与未关联流水时保留正确候选', () => {
  const funds = [
    { id: 'unclaimed', contract: null },
    { id: 'same-contract', contract: { id: 'contract-1' } },
    { id: 'other-contract', contract: { id: 'contract-2' } },
  ];
  assert.deepEqual(funds.filter(fund => fundMatchesContract(fund, 'contract-1')).map(fund => fund.id), ['same-contract']);
  assert.deepEqual(funds.filter(fund => fundMatchesContract(fund, '')), []);
});
