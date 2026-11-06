import { matchInvoices } from './invoice-matching';

describe('发票与结算核对', () => {
  const goods = (invoices: Array<{ quantity: number | null; taxInclusiveAmount: number }>) =>
    matchInvoices({ settlementQuantity: 100, settlementAmount: 196000, invoices, compareQuantity: true });

  it('没有有效发票时为未到票', () => {
    expect(goods([])).toMatchObject({ state: 'NONE', matched: false, warnings: ['尚未登记发票'], invoiceAmount: '0.00' });
  });

  it('数量和金额都一致时为已匹配', () => {
    expect(goods([{ quantity: 60, taxInclusiveAmount: 117600 }, { quantity: 40, taxInclusiveAmount: 78400 }]))
      .toMatchObject({ state: 'MATCHED', matched: true, warnings: [], invoiceQuantity: '100.000', invoiceAmount: '196000.00', invoiceCount: 2 });
  });

  it('金额不足为部分到票，超出为发票超额', () => {
    expect(goods([{ quantity: 60, taxInclusiveAmount: 117600 }])).toMatchObject({ state: 'PARTIAL', amountDifference: '-78400.00', quantityDifference: '-40.000' });
    expect(goods([{ quantity: 100, taxInclusiveAmount: 196000.01 }])).toMatchObject({ state: 'OVER', amountDifference: '0.01' });
  });

  it('金额一致但数量不同为数量不符', () => {
    expect(goods([{ quantity: 99.5, taxInclusiveAmount: 196000 }])).toMatchObject({ state: 'QUANTITY_MISMATCH', quantityDifference: '-0.500' });
  });

  it('运费发票只核对金额，不比较数量', () => {
    const result = matchInvoices({ settlementQuantity: 1153.95, settlementAmount: 46158, invoices: [{ quantity: null, taxInclusiveAmount: 46158 }], compareQuantity: false });
    expect(result).toMatchObject({ state: 'MATCHED', settlementQuantity: null, quantityDifference: null });
  });
});
