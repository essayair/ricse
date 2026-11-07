import { allocationState, matchInvoices } from './invoice-matching';

describe('发票与结算核对', () => {
  const goods = (allocations: Array<{ quantity: number | null; amount: number }>, paidAmount = 0) =>
    matchInvoices({ settlementQuantity: 100, settlementAmount: 196000, paidAmount, allocations, compareQuantity: true });

  it('没有分摊时为未到票', () => {
    expect(goods([])).toMatchObject({ state: 'NONE', matched: false, warnings: ['尚未登记发票'], invoiceAmount: '0.00', remainingAmount: '196000.00' });
  });

  it('多张发票分摊合计与结算一致时为已匹配', () => {
    expect(goods([{ quantity: 60, amount: 117600 }, { quantity: 40, amount: 78400 }]))
      .toMatchObject({ state: 'MATCHED', matched: true, warnings: [], invoiceQuantity: '100.000', invoiceAmount: '196000.00', invoiceCount: 2, remainingAmount: '0.00' });
  });

  it('金额不足为部分到票，超出为发票超额', () => {
    expect(goods([{ quantity: 60, amount: 117600 }])).toMatchObject({ state: 'PARTIAL', amountDifference: '-78400.00', quantityDifference: '-40.000' });
    expect(goods([{ quantity: 100, amount: 196000.01 }])).toMatchObject({ state: 'OVER', amountDifference: '0.01' });
  });

  it('金额一致但数量不同为数量不符', () => {
    expect(goods([{ quantity: 99.5, amount: 196000 }])).toMatchObject({ state: 'QUANTITY_MISMATCH', quantityDifference: '-0.500' });
  });

  it('分摊都未填数量时只核对金额', () => {
    expect(goods([{ quantity: null, amount: 196000 }])).toMatchObject({ state: 'MATCHED', invoiceQuantity: null, quantityDifference: null });
  });

  it('票款差为已到票减已收付：先开 95% 票、付 85% 款时票多于款', () => {
    expect(goods([{ quantity: null, amount: 186200 }], 166600)).toMatchObject({ state: 'PARTIAL', invoicePaymentGap: '19600.00', paidAmount: '166600.00' });
    expect(goods([], 50000)).toMatchObject({ invoicePaymentGap: '-50000.00' });
  });

  it('运费发票只核对金额，不比较数量', () => {
    const result = matchInvoices({ settlementQuantity: 1153.95, settlementAmount: 46158, allocations: [{ quantity: 5, amount: 46158 }], compareQuantity: false });
    expect(result).toMatchObject({ state: 'MATCHED', settlementQuantity: null, quantityDifference: null });
  });

  it('发票分摊状态', () => {
    expect(allocationState(1000, 0)).toBe('UNALLOCATED');
    expect(allocationState(1000, 400)).toBe('PARTIAL');
    expect(allocationState(1000, 1000)).toBe('ALLOCATED');
  });
});
