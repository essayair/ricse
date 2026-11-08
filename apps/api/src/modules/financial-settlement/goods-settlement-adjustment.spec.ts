import { adjustedGoodsLine, goodsSettlementSummary, assertGoodsSettlementSummary, assertCurrentGoodsQuantityCeiling } from './goods-settlement-adjustment';
import { settlementQuantityReview } from './settlement-quantity-review';

const source = (quantity = 100) => ({ remainingQuantity: quantity, negotiableRemainingQuantity: quantity + 2, unitPrice: 2000, deductionPerTon: 40, pricingQuantityBasis: 'DRY_MATTER', contractLineItemId: 'material-line' });
function line(quantity = 100, price?: number) {
  const s = source(quantity), priced = adjustedGoodsLine(s, { quantity, adjustedUnitPrice: price, remarks: '双方确认' }, false);
  return { ...priced.amounts, unitPrice: priced.unitPrice, sourceSnapshot: { ...s, lineAdjustment: priced.adjustment } };
}
describe('逐车与整单结算调整', () => {
  it('单价调整是含税每吨价格，不是本车总额加减，不修改原合同价', () => {
    const s = source(), result = adjustedGoodsLine(s, { quantity: 100, adjustedUnitPrice: 1990, remarks: '本车议价' }, false);
    expect(result).toMatchObject({ unitPrice: 1990, amounts: { quantity: 100, grossAmount: 199000, qualityDeductionAmount: 4000, totalAmount: 195000 }, adjustment: { priceAdjusted: true, quantityAdjusted: false, contractUnitPrice: 2000 } });
    expect(s.unitPrice).toBe(2000);
  });
  it('本车调价必须说明，不能再叠加历史金额调整', () => {
    expect(() => adjustedGoodsLine(source(), { quantity: 99, adjustedUnitPrice: 1990, remarks: '说明' }, false)).toThrow('只能选择一种');
    expect(() => adjustedGoodsLine(source(), { quantity: 100, adjustedUnitPrice: 1990 }, false)).toThrow('调整说明');
    expect(() => adjustedGoodsLine(source(), { quantity: 100, adjustedUnitPrice: 1990, adjustmentAmount: 100, remarks: '原因' }, false)).toThrow('不能同时');
  });
  it('分档价调价统一使用含税每吨值，并保留可核对的税额', () => {
    const s = { ...source(48.4), unitPrice: 737.75, recoveryDeductionPerTon: 39 };
    const result = adjustedGoodsLine(s, { quantity: 48.4, adjustedUnitPrice: 840, remarks: '本车议价' }, true, 13);
    expect(result.adjustment.contractUnitPrice).toBe(833.6575);
    expect(result.amounts.grossAmount).toBe(40656);
    expect(result.amounts.qualityDeductionAmount).toBe(2132.99);
    expect(Number((result.amounts.amountExTax! + result.amounts.taxAmount!).toFixed(2))).toBe(result.amounts.totalAmount);
  });
  it('默认最终结算等于明细合计', () => {
    const result = goodsSettlementSummary([line(50), line(50)]);
    expect(result.mode).toBe('NONE'); expect(result.final).toEqual(result.base);
    expect(result.final).toMatchObject({ quantity: 100, grossAmount: 200000, qualityDeductionAmount: 4000, totalAmount: 196000 });
  });
  it('整单干基数量按合同单价同步重算，质量扣款同步，不改逐车明细', () => {
    const lines = [line(50), line(50)], original = JSON.stringify(lines);
    const result = goodsSettlementSummary(lines, { mode: 'QUANTITY', quantity: 99, reason: '双方按99干吨结算' });
    expect(result).toMatchObject({ mode: 'QUANTITY', unitPrice: 2000, quantityDifference: -1, amountDifference: -1960,
      final: { quantity: 99, grossAmount: 198000, qualityDeductionAmount: 3960, adjustmentAmount: 0, totalAmount: 194040 } });
    expect(JSON.stringify(lines)).toBe(original);
  });
  it('整单金额只改总额，不改各车金额及数量', () => {
    const lines = [line()], result = goodsSettlementSummary(lines, { mode: 'AMOUNT', amount: 195500, reason: '整单优惠500元' });
    expect(result).toMatchObject({ mode: 'AMOUNT', quantityDifference: 0, amountDifference: -500, final: { quantity: 100, totalAmount: 195500, adjustmentAmount: -500 } });
    expect(lines[0].totalAmount).toBe(196000);
  });
  it('整体数量与金额不能同时输入', () => {
    expect(() => goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity: 99, amount: 195500, reason: '说明' })).toThrow('只能选择一种');
    expect(() => goodsSettlementSummary([line()], { mode: 'AMOUNT', quantity: 99, amount: 195500, reason: '说明' })).toThrow('只能选择一种');
  });
  it('有逐车调整不能再叠加整单调整，避免三重改变货款', () => {
    expect(() => goodsSettlementSummary([line(100, 1990)], { mode: 'AMOUNT', amount: 190000, reason: '说明' })).toThrow('恢复逐车系统计算');
    const changed = line(); changed.sourceSnapshot.lineAdjustment.quantityAdjusted = true;
    expect(() => goodsSettlementSummary([changed], { mode: 'QUANTITY', quantity: 99, reason: '说明' })).toThrow('恢复逐车系统计算');
  });
  it('实物计价、多物料、多单价或不同扣款不能套用统一总干基公式', () => {
    const physical = line(); physical.sourceSnapshot.pricingQuantityBasis = 'PHYSICAL';
    expect(() => goodsSettlementSummary([physical], { mode: 'QUANTITY', quantity: 99, reason: '说明' })).toThrow('只支持干基');
    for (const key of ['contractLineItemId', 'contractUnitPrice', 'deductionPerTon']) {
      const second = line(50);
      if (key === 'contractLineItemId') second.sourceSnapshot.contractLineItemId = 'other';
      else (second.sourceSnapshot.lineAdjustment as any)[key] = 3000;
      expect(() => goodsSettlementSummary([line(50), second], { mode: 'QUANTITY', quantity: 99, reason: '说明' })).toThrow('无法按统一单价');
    }
  });
  it('调整须填写原因，数量不超计量依据上限，金额大于零', () => {
    expect(() => goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity: 99 })).toThrow('请填写双方协商调整的原因。');
    expect(() => goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity: 103, reason: '说明' })).toThrow('协商干基数量不能超过 102.000 吨');
    expect(() => goodsSettlementSummary([line()], { mode: 'AMOUNT', amount: 0, reason: '说明' })).toThrow('大于 0');
  });
  it.each([0, -1, NaN, Infinity])('数量 %s 错误与超出上限分别提示', quantity => {
    expect(() => goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity, reason: '说明' })).toThrow('请填写大于 0 的协商干基数量。');
  });
  it('精度错误单独提示数量或金额的小数位要求', () => {
    expect(() => goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity: 1.2345, reason: '说明' })).toThrow('干基数量最多保留 3 位小数。');
    expect(() => goodsSettlementSummary([line()], { mode: 'AMOUNT', amount: 1.234, reason: '说明' })).toThrow('结算金额最多保留 2 位小数。');
  });
  it('与明细一致不保存为额外人工调整', () => {
    expect(goodsSettlementSummary([line()], { mode: 'QUANTITY', quantity: 100 }).mode).toBe('NONE');
    expect(goodsSettlementSummary([line()], { mode: 'AMOUNT', amount: 196000 }).mode).toBe('NONE');
  });
  it('保存后核对最终数量金额，篡改头部值不能进入确认付款', () => {
    const lines: any[] = [line()], summary = goodsSettlementSummary(lines, { mode: 'QUANTITY', quantity: 99, reason: '说明' });
    lines[0].sourceSnapshot.settlementAdjustment = summary;
    expect(() => assertGoodsSettlementSummary({ ...summary.final, lines })).not.toThrow();
    expect(() => assertGoodsSettlementSummary({ ...summary.final, totalAmount: 999999, lines })).toThrow('调整依据不一致');
    expect(() => assertGoodsSettlementSummary({ ...summary.final, quantity: 101, lines })).toThrow('调整依据不一致');
  });
  it('合同数量差异核对采用最终干基，累计时整单差额只计一次', () => {
    const lines: any[] = [line(50), line(50)], summary = goodsSettlementSummary(lines, { mode: 'QUANTITY', quantity: 99, reason: '说明' });
    lines[0].sourceSnapshot.settlementAdjustment = summary;
    const review = settlementQuantityReview({ shortfallPct: 0 }, [{ id: 'material-line', quantity: 100 }], lines, [], true);
    expect(review.differences[0]).toMatchObject({ currentQuantity: 99, difference: 1, type: 'SHORT' });
    const cumulative = settlementQuantityReview({ overfillPct: 0 }, [{ id: 'material-line', quantity: 100 }], [{ quantity: 1, sourceSnapshot: { contractLineItemId: 'material-line' } }], lines);
    expect(cumulative.differences).toEqual([]);
  });
  it('旧单据没有调整快照时保持原数据，不要求补写', () => {
    expect(() => assertGoodsSettlementSummary({ quantity: 1, grossAmount: 1, qualityDeductionAmount: 0, adjustmentAmount: 0, totalAmount: 1, lines: [] })).not.toThrow();
  });
  it('确认或审批前核对当前双方依据上限，报告撤销或更正不能继续使用旧上限', () => {
    const item = { lines: [{ waybillLineItemId: 'w', sourceSnapshot: { settlementAdjustment: { version: 1, mode: 'QUANTITY', final: { quantity: 104.488 } } } }] };
    expect(() => assertCurrentGoodsQuantityCeiling(item, [{ id: 'w', remainingQuantity: 104, negotiableRemainingQuantity: 105 }])).not.toThrow();
    expect(() => assertCurrentGoodsQuantityCeiling(item, [{ id: 'w', remainingQuantity: 104, negotiableRemainingQuantity: 104.1 }])).toThrow('当前可协商数量为 104.100 吨');
    expect(() => assertCurrentGoodsQuantityCeiling({ lines: [] }, [])).not.toThrow();
  });
});
