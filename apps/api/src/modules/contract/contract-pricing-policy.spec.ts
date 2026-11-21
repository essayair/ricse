import { editableContractPricing, editableGradePriceRule, RECOVERY_ADJUSTMENT_ENTRY_ENABLED } from '@ricse/shared-types/contract-pricing-policy';
import { buildContractCopyTemplate } from './contract-copy';
import { evaluateRecoveryAdjustment } from './grade-price-rules';

describe('回收率入口暂停与历史隔离', () => {
  const recovery = { baselinePct: 86, deductionPerPointPerDegree: 0.4, stepMode: 'PROPORTIONAL' as const };
  const rules = { bands: [{ lower: 10, upper: 15 }], formulaConfirmed: false, recoveryAdjustment: recovery };
  it('新写入的两侧正式行和草稿缓存均移除条款，其他数据不变', () => {
    expect(RECOVERY_ADJUSTMENT_ENTRY_ENABLED).toBe(false);
    const input = { lineItems: [{ priceRulesSnapshot: rules, salesPriceRulesSnapshot: rules }], draftData: { lineItems: [{ priceRulesSnapshot: rules }] } };
    const result = editableContractPricing(input);
    expect(result.lineItems[0].priceRulesSnapshot).not.toHaveProperty('recoveryAdjustment');
    expect(result.lineItems[0].salesPriceRulesSnapshot).not.toHaveProperty('recoveryAdjustment');
    expect(result.draftData.lineItems[0].priceRulesSnapshot).not.toHaveProperty('recoveryAdjustment');
    expect(result.lineItems[0].priceRulesSnapshot.bands).toEqual(rules.bands);
    expect(input.lineItems[0].priceRulesSnapshot.recoveryAdjustment).toEqual(recovery);
    expect(editableGradePriceRule(null)).toBeNull();
  });
  it('复制移除回收率、提示经办人，不改原审批合同', () => {
    const source = { id: 'old', status: 'EXECUTING', lineItems: [{ priceRulesSnapshot: rules, salesPriceRulesSnapshot: rules }] };
    const result = buildContractCopyTemplate(source, { allowedBusinessUnitIds: [] });
    expect(result.lineItems[0].priceRulesSnapshot).not.toHaveProperty('recoveryAdjustment');
    expect(result.warnings[0]).toContain('不复制');
    expect(source.lineItems[0].priceRulesSnapshot.recoveryAdjustment).toEqual(recovery);
  });
  it('既有合同结算仍执行原快照，不能因关闭新入口改变已约定扣款', () => {
    expect(evaluateRecoveryAdjustment(recovery, 32.5, 83)).toMatchObject({ deductionPerDegree: 1.2, deductionPerTon: 39 });
  });
});
