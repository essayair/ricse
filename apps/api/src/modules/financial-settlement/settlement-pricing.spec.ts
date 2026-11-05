import { gradeTierAmounts, settlementPricingFacts } from './settlement-pricing';

describe('品位分档货款金额', () => {
  it('无回收率扣价时与原含税计算一致', () => {
    expect(gradeTierAmounts(100, 858.4, 0, 13)).toMatchObject({
      grossAmount: 96999.2, qualityDeductionAmount: 0, totalAmount: 96999.2, amountExTax: 85840, taxAmount: 11159.2,
    });
  });
  it('回收率扣价单列为扣款，税额按扣价后不含税货款计算，合计不因取整产生差额', () => {
    const amounts = gradeTierAmounts(48.4, 858.4, 22.2, 13, -100);
    // 不含税：48.4 × 858.4 = 41546.56；扣价 48.4 × 22.2 = 1074.48；净额 40472.08；税 5261.37
    expect(amounts).toMatchObject({ grossAmountExTax: 41546.56, recoveryDeductionExTax: 1074.48, amountExTax: 40472.08, taxAmount: 5261.37,
      qualityDeductionAmount: 1214.16, adjustmentAmount: -100 });
    expect(amounts.grossAmount - amounts.qualityDeductionAmount).toBeCloseTo(amounts.amountExTax + amounts.taxAmount, 2);
    expect(amounts.totalAmount).toBeCloseTo(40472.08 + 5261.37 - 100, 2);
  });
  it('结算行记录实际采用的品位、档位、回收率和税额', () => {
    const facts = settlementPricingFacts({
      pricingQuantityBasis: 'DRY_MATTER', recoveryDeductionPerTon: 22.2,
      gradePrice: { status: 'READY', gradePct: 37, moisturePct: 4, recoveryPct: 84.5, band: { lower: 35, upper: 40 }, rate: 23.2 },
    }, { quantity: 48.4, amountExTax: 40472.08, taxAmount: 5261.37 }, true, 13);
    expect(facts).toEqual({ pricingMethod: 'GRADE_TIER', pricingQuantityBasis: 'DRY_MATTER', measuredGradePct: 37, measuredMoisturePct: 4,
      measuredRecoveryPct: 84.5, gradeBandLower: 35, gradeBandUpper: 40, gradeRateExTax: 23.2, recoveryDeductionPerTonExTax: 22.2,
      taxRatePct: 13, amountExTax: 40472.08, taxAmount: 5261.37 });
  });
  it('固定价结算行只记录计价方式与重量口径', () => {
    expect(settlementPricingFacts({ pricingQuantityBasis: 'PHYSICAL', measuredMoisturePct: 6 }, { quantity: 30 }, false, null))
      .toMatchObject({ pricingMethod: 'FIXED', pricingQuantityBasis: 'PHYSICAL', measuredMoisturePct: 6, measuredGradePct: null, taxRatePct: null, amountExTax: null });
  });
});
