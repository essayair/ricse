import assert from 'node:assert/strict';
import test from 'node:test';
import { contactText, hasLegacyBilateralContact, partnerContactDefaults } from './contract-contacts';

test('双边合同选择交易对手仅填入对应侧联系人，取消选择可清空', () => {
  const form = { purchaseContactPerson: '供方', purchaseContactPhone: '111', salesContactPerson: '客户', salesContactPhone: '222' };
  assert.deepEqual({ ...form, ...partnerContactDefaults('BILATERAL', 'sellerId', { contactPerson: '新供方', contactPhone: '333' }) }, { ...form, purchaseContactPerson: '新供方', purchaseContactPhone: '333' });
  assert.deepEqual(partnerContactDefaults('BILATERAL', 'buyerId'), { salesContactPerson: '', salesContactPhone: '' });
  assert.deepEqual(partnerContactDefaults('SALES', 'sellerId', { contactPerson: '客户' }), { contactPerson: '客户', contactPhone: '' });
});

test('旧共用联系人仅中性展示，不推断为任意一侧', () => {
  assert.equal(hasLegacyBilateralContact({ contactPerson: '历史联系人' }), true);
  assert.equal(hasLegacyBilateralContact({ contactPerson: '历史联系人', salesContactPerson: '新客户' }), false);
  assert.equal(hasLegacyBilateralContact({}), false);
  assert.equal(contactText('', '0570-1234567'), '0570-1234567');
});
