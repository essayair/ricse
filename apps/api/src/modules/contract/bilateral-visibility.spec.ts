import { bilateralContractView } from './bilateral-visibility';
describe('双边对外方向隔离', () => {
  const c = { type: 'BILATERAL', sellerId: 'supplier', buyerId: 'customer', totalAmount: 100, salesExternalNo: 'SALE', draftData: { price: 999 }, approvals: [{ comment: '内部差价' }], lineItems: [{ unitPrice: 10, salesUnitPrice: 20, priceRulesSnapshot: { rate: 1 }, salesPriceRulesSnapshot: { rate: 2 } }], attachments: [{ category: 'PURCHASE_CONTRACT' }, { category: 'SALES_CONTRACT' }, { category: 'OTHER' }], orders: [{ type: 'PURCHASE' }, { type: 'SALES' }], fulfillment: { directions: [{ type: 'PURCHASE' }, { type: 'SALES' }] } };
  it('供应商不能读取销售价格、附件及内部信息', () => {
    const view = bilateralContractView(c, 'supplier');
    expect(view.lineItems[0]).not.toHaveProperty('salesUnitPrice'); expect(view.lineItems[0]).not.toHaveProperty('salesPriceRulesSnapshot');
    expect(view.attachments).toEqual([{ category: 'PURCHASE_CONTRACT' }]); expect(view.orders).toEqual([{ type: 'PURCHASE' }]);
    expect(view).not.toHaveProperty('draftData'); expect(view).not.toHaveProperty('approvals'); expect(c.lineItems[0].salesUnitPrice).toBe(20);
  });
  it('客户不能读取采购单价、总额及分档价格', () => {
    const view = bilateralContractView(c, 'customer');
    expect(view).not.toHaveProperty('totalAmount'); expect(view.lineItems[0]).not.toHaveProperty('unitPrice');
    expect(view.attachments).toEqual([{ category: 'SALES_CONTRACT' }]); expect(view.lineItems[0].salesUnitPrice).toBe(20);
  });
  it('内部调用保持原始计算数据', () => expect(bilateralContractView(c)).toBe(c));
});
