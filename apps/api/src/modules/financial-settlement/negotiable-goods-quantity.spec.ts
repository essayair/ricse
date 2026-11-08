import { negotiableGoodsQuantity } from './negotiable-goods-quantity';
import { adjustedGoodsLine, goodsSettlementSummary } from './goods-settlement-adjustment';

const tickets = (shipping = 100, receiving = 100) => new Map([
  ['SHIPPING', { weighingStage: 'SHIPPING', netWeight: shipping }],
  ['RECEIVING', { weighingStage: 'RECEIVING', netWeight: receiving }],
]);
const report = (stage: string, moisture: number, status = 'CONFIRMED') => ({ evidenceStage: stage, status,
  indicators: [{ code: 'MOISTURE', unit: '%', measuredValue: moisture }] });

describe('双侧计量质检协商数量', () => {
  it('发收货净重相同、水分不同时，采用各侧水分，不把我方水分套给供应商', () => {
    const result = negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(), [report('SHIPPING', 5), report('RECEIVING', 10)], 10);
    expect(result).toBe(95);
  });
  it('两侧分别配对，不拼接最大净重和另一侧最低水分来虚增上限', () => {
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(100, 110), [report('SHIPPING', 5), report('RECEIVING', 20)], 5)).toBe(95);
  });
  it('不使用草稿、作废、已删除或未分类的报告扩充上限', () => {
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(), [report('SHIPPING', 0, 'DRAFT'),
      report('SHIPPING', 0, 'VOIDED'), { ...report('SHIPPING', 0), deletedAt: new Date() }, report('UNSPECIFIED', 0)], 10)).toBe(90);
  });
  it.each([-1, 101, NaN, Infinity])('不将无效水分 %s 当成零水分', value => {
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(), [report('SHIPPING', value)], 10)).toBe(90);
  });
  it('缺少本侧独立报告时兼容沿用所选有效报告；缺少水分不臆造干基', () => {
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(105, 100), [], 10)).toBe(94.5);
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', tickets(105, 100), [], null)).toBe(90);
  });
  it('单侧计量不扩大协商数量；实物口径不折干', () => {
    const oneSide = tickets(105, 100); oneSide.delete('SHIPPING');
    expect(negotiableGoodsQuantity(90, 'DRY_MATTER', oneSide, [report('RECEIVING', 0)], 0)).toBe(90);
    expect(negotiableGoodsQuantity(100, 'PHYSICAL', tickets(105, 100), [report('SHIPPING', 50)], 50)).toBe(105);
  });
  it('13车回归：1044.88干吨在双方支持范围内可预览，超出1049.389仍拦截', () => {
    const values = [[87.58,87.58,8.7,9.71],[96.1,96.13,8.8,9.69],[99.1,99.04,8.6,9.13],
      [91.06,91.09,8.84,9.71],[78.24,78.2,8.89,9.8],[103.7,103.67,8.57,9.1],
      [105.34,105.33,8.87,9.4],[80.98,80.99,9.02,9.76],[80.78,80.76,9.17,10.27],
      [96.12,96.08,10.05,10.59],[80.3,80.31,9.76,10.44],[84.68,84.68,9.08,9.76],[70.12,70.09,9.95,11.05]];
    const lines = values.map(([shipping, receiving, shippingWater, receivingWater]) => {
      const quantity = Number((receiving * (1 - receivingWater / 100)).toFixed(3));
      const source = { remainingQuantity: quantity, negotiableRemainingQuantity: negotiableGoodsQuantity(quantity, 'DRY_MATTER',
        tickets(shipping, receiving), [report('SHIPPING', shippingWater), report('RECEIVING', receivingWater)], receivingWater),
        unitPrice: 2920, pricingQuantityBasis: 'DRY_MATTER', contractLineItemId: 'contract-line' };
      const priced = adjustedGoodsLine(source, { quantity }, false);
      return { ...priced.amounts, sourceSnapshot: { ...source, lineAdjustment: priced.adjustment } };
    });
    const result = goodsSettlementSummary(lines, { mode: 'QUANTITY', quantity: 1044.88, reason: '双方确认干基' });
    expect(result).toMatchObject({ quantityCeiling: 1049.389, base: { quantity: 1040.477 },
      final: { quantity: 1044.88, totalAmount: 3051049.6 } });
    expect(() => goodsSettlementSummary(lines, { mode: 'QUANTITY', quantity: 1049.39, reason: '超出依据' })).toThrow('1049.389');
  });
});
