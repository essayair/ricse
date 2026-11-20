import { cargoSpecOptions, assertCargoSpec, noticeLineCargoSpecs, publicCargoWaybill } from './cargo-spec';

describe('一车一种货物规格', () => {
  const rule = { method: 'CAF2_GRADE_TIER', specPricingMode: 'UNIFIED', applicableSpecs: ['FRAGMENT', 'RUN_OF_MINE'] };
  it('新合同多选，旧合同单选，直拨取两侧交集', () => {
    expect(cargoSpecOptions([rule])).toEqual(['FRAGMENT', 'RUN_OF_MINE']);
    expect(cargoSpecOptions([rule, { method: 'CAF2_GRADE_TIER', selectedSpec: 'RUN_OF_MINE' }])).toEqual(['RUN_OF_MINE']);
    expect(cargoSpecOptions([])).toEqual([]);
  });
  it('允许暂缺，不接受合同外规格或混装数组', () => {
    expect(() => assertCargoSpec(null, ['FRAGMENT'])).not.toThrow();
    expect(() => assertCargoSpec('RUN_OF_MINE', ['FRAGMENT'])).toThrow('合同适用范围');
    expect(() => assertCargoSpec(['FRAGMENT', 'RUN_OF_MINE'], ['FRAGMENT', 'RUN_OF_MINE'])).toThrow('一车只能选择一种');
  });
  it('按合同明细ID匹配，不按同名物料猜测；双边常规执行按本方向取规格', () => {
    const notice: any = { type: 'SALES', order: { contract: { type: 'BILATERAL', pricingType: 'GRADE_TIER', lineItems: [{ id: 'line-1', priceRulesSnapshot: rule, salesPriceRulesSnapshot: { method: 'CAF2_GRADE_TIER', selectedSpec: 'RUN_OF_MINE' } }] } } };
    const line = { orderLineItem: { contractLineItemId: 'line-1' } };
    expect(noticeLineCargoSpecs(line, notice)).toEqual(['RUN_OF_MINE']);
    expect(noticeLineCargoSpecs({ orderLineItem: { contractLineItemId: 'other' } }, notice)).toEqual([]);
    expect(noticeLineCargoSpecs(line, { ...notice, type: 'PURCHASE' })).toEqual(['FRAGMENT', 'RUN_OF_MINE']);
  });
  it('物流接口只输出规格选项，不额外输出合同价格快照和执行行价格', () => {
    const w = { id: 'w', dispatchNotice: { type: 'PURCHASE', order: { contract: { type: 'PURCHASE', pricingType: 'GRADE_TIER', lineItems: [{ id: 'cl', priceRulesSnapshot: rule }] } } }, lineItems: [{ id: 'wl', dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: 'cl', unitPrice: 'sensitive-price' } } }] };
    const result = publicCargoWaybill(w);
    expect(result.cargoSpecOptions).toEqual(['FRAGMENT', 'RUN_OF_MINE']);
    expect(JSON.stringify(result)).not.toContain('priceRulesSnapshot');
    expect(JSON.stringify(result)).not.toContain('sensitive-price');
    expect(w.lineItems[0].dispatchNoticeLineItem.orderLineItem.unitPrice).toBe('sensitive-price');
  });
});
