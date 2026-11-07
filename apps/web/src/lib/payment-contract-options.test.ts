import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentContractSelectable } from './payment-contract-options';

test('新采购货款隐藏已付清或额度被全额占用的合同', () => {
  for (const paymentStage of ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'OTHER']) {
    assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount: 0 }, 'PURCHASE', paymentStage), false);
  }
});
test('部分付款以及驳回、作废、退款释放额度后重新可选', () => {
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount: 50 }, 'PURCHASE', 'FINAL'), true);
});
test('保留原草稿和驳回单的关联合同，不被当前余额过滤丢失', () => {
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount: 0 }, 'PURCHASE', 'FINAL', 'c'), true);
  assert.equal(paymentContractSelectable({ id: 'other', businessType: 'PURCHASE', remainingPaymentAmount: 0 }, 'PURCHASE', 'FINAL', 'c'), false);
});
test('客户退款、保证金退回和履约保证金不误用货款余额', () => {
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'SALES', remainingPaymentAmount: 0 }, 'SALES', 'REFUND'), true);
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'SALES', remainingPaymentAmount: 0 }, 'SALES', 'GUARANTEE_RETURN'), true);
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount: 0 }, 'PURCHASE', 'GUARANTEE'), true);
  assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount: 50 }, 'SALES', 'REFUND'), false);
});
test('缺失或非法余额不会被当作可申请', () => {
  for (const remainingPaymentAmount of [undefined, null, 'NaN', -1]) {
    assert.equal(paymentContractSelectable({ id: 'c', businessType: 'PURCHASE', remainingPaymentAmount }, 'PURCHASE', 'ADVANCE'), false);
  }
});
