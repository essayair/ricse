import { goodsAmounts, requestCommitment } from './payment-balance';

describe('付款占用和质量结算金额', () => {
  it('部分登记付款后剩余批准额与已登记额共同占用，作废付款释放回申请余额', () => {
    const request = { amount: '100000', status: 'PARTIALLY_PAID', fundTransactions: [{ amount: '30000', status: 'PENDING_CONFIRMATION' }, { amount: '10000', status: 'VOIDED' }] };
    expect(requestCommitment(request)).toBe(70000);
    expect(requestCommitment({ ...request, status: 'REJECTED' })).toBe(0);
    expect(requestCommitment({ ...request, status: 'DRAFT' })).toBe(0);
  });
  it('实际数量乘合同价后分别列质量扣款及其他调整，精确到分', () => {
    expect(goodsAmounts('100', '2000', '40')).toMatchObject({ grossAmount: 200000, qualityDeductionAmount: 4000, totalAmount: 196000 });
    expect(goodsAmounts('0.333', '1000.1234', '20.4567', '-1.23')).toMatchObject({ grossAmount: 333.04, qualityDeductionAmount: 6.81, totalAmount: 325 });
  });
});
