// 仅控制新建、复制与可编辑合同；已审批合同的读取、结算计算不得套用此策略。
const RECOVERY_ADJUSTMENT_ENTRY_ENABLED = false;
const GRADE_PRICE_HELP = '1度为1个百分点（37%按37度）；税前金额＝结算吨数×实测度数×档位价格';
function editableGradePriceRule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (RECOVERY_ADJUSTMENT_ENTRY_ENABLED) return value;
  const { recoveryAdjustment, ...rest } = value;
  return rest;
}
function editableContractPricing(value) {
  if (Array.isArray(value)) return value.map(editableContractPricing);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['priceRulesSnapshot', 'salesPriceRulesSnapshot'].includes(key)
      ? editableGradePriceRule(item) : editableContractPricing(item)]));
}
module.exports = { RECOVERY_ADJUSTMENT_ENTRY_ENABLED, GRADE_PRICE_HELP, editableGradePriceRule, editableContractPricing };
