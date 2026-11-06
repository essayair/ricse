import { settlementQuantityReview } from './settlement-quantity-review';

const item = { id: 'a', materialName: '萤石', quantity: 1000 };
const line = (quantity: number, id = 'a') => ({ quantity, sourceSnapshot: { contractLineItemId: id } });

describe('结算溢短装数量核对', () => {
  it('超出溢装上限时返回差额，累计包含既往结算和草稿占用', () => {
    const result = settlementQuantityReview({ overfillPct: 10, shortfallPct: 10 }, [item], [line(625)], [line(500)]);
    expect(result.differences).toEqual([expect.objectContaining({ type: 'OVER', currentQuantity: 625, previousQuantity: 500, totalQuantity: 1125,
      lowerQuantity: 900, upperQuantity: 1100, difference: 25 })]);
  });
  it('分批结算不检查短装，最终结算才检查', () => {
    expect(settlementQuantityReview({ shortfallPct: 10 }, [item], [line(850)], []).differences).toEqual([]);
    expect(settlementQuantityReview({ shortfallPct: 10 }, [item], [line(850)], [], true).differences)
      .toEqual([expect.objectContaining({ type: 'SHORT', difference: 50 })]);
  });
  it('最终结算也检查本次未选择的合同物料，不能漏掉未结数量', () => {
    expect(settlementQuantityReview({ shortfallPct: 10 }, [item, { ...item, id: 'b' }], [line(1000)], [], true).differences)
      .toEqual([expect.objectContaining({ contractLineItemId: 'b', type: 'SHORT', difference: 900 })]);
  });
  it('恰好在上下限时不提示，0% 不会错误替换成默认比例', () => {
    expect(settlementQuantityReview({ overfillPct: 10, shortfallPct: 10 }, [item], [line(1100)], [], true).differences).toEqual([]);
    expect(settlementQuantityReview({ shortfallPct: 10 }, [item], [line(900)], [], true).differences).toEqual([]);
    expect(settlementQuantityReview({ overfillPct: 0 }, [item], [line(1000.001)], []).differences[0].difference).toBe(0.001);
  });
});
