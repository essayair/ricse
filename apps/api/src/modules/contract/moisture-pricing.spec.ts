import { moisturePricingQuantity, moisturePricingSnapshot } from '@ricse/shared-types/moisture-pricing';
import { settlementMoistureQuantity } from './moisture-pricing';

describe('合同扣水数量与实际干基分离', () => {
  const rule = { moistureDeductionMode: 'EXCESS' as const, moistureBasePct: 5 };
  it.each([[3, 100], [5, 100], [6.8, 98.2], [10, 95], [0, 100]])('净重100吨，实测水分%s%%，计价量%s吨', (water, expected) => {
    expect(settlementMoistureQuantity(100, water, rule)).toBe(expected);
    expect(moisturePricingQuantity(100, water, rule)).toBe(expected);
  });
  it('实际折干和旧合同仍扣全部水分，旧快照不新增字段', () => {
    expect(settlementMoistureQuantity(100, 6.8)).toBe(93.2);
    expect(settlementMoistureQuantity(100, 6.8, { moistureDeductionMode: 'ACTUAL' })).toBe(93.2);
    expect(moisturePricingSnapshot(null)).toEqual({});
    expect(moisturePricingSnapshot(rule)).toEqual(rule);
  });
  it('基准0合法，基准缺失或非法及无效实测值不得猜测为0', () => {
    expect(settlementMoistureQuantity(100, 6.8, { ...rule, moistureBasePct: 0 })).toBe(93.2);
    for (const base of [null, undefined, -1, 100, NaN]) expect(settlementMoistureQuantity(100, 6.8, { ...rule, moistureBasePct: base })).toBeNull();
    for (const water of [null, -1, 100, NaN]) expect(settlementMoistureQuantity(100, water, rule)).toBeNull();
  });
  it('前后端换算三位数量一致，支持切换磅单及不同水分', () => {
    for (const net of [87.58, 0.005, 98.745, 51.65, 1153.95]) {
      for (const water of [0, 4.99, 5, 5.01, 6.8, 8.7, 99.99]) {
        expect(moisturePricingQuantity(net, water, rule)).toBe(settlementMoistureQuantity(net, water, rule));
      }
    }
  });
});
