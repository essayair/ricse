export const CHECK_ADJUSTMENT_FIELDS = '请检查标红的填写项。';
export type AdjustmentIssues = Partial<Record<'quantity' | 'amount' | 'reason', string>>;
type Input = {
  mode: 'NONE' | 'QUANTITY' | 'AMOUNT'; quantity: string; amount: string; reason: string;
  quantityCeiling: number | null; baseQuantity?: number | null; baseAmount?: number | null;
};

function decimalPlaces(value: number): number {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length || 0) - Number(exponent));
}

export function settlementAdjustmentIssues(input: Input): AdjustmentIssues {
  if (input.mode === 'NONE') return {};
  const issues: AdjustmentIssues = {};
  const quantity = Number(input.quantity), amount = Number(input.amount);
  if (input.mode === 'QUANTITY') {
    if (!input.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) issues.quantity = '请填写大于 0 的协商干基数量。';
    else if (decimalPlaces(quantity) > 3) issues.quantity = '干基数量最多保留 3 位小数。';
    else if (input.quantityCeiling != null && quantity > input.quantityCeiling) {
      issues.quantity = `协商干基数量不能超过 ${input.quantityCeiling.toFixed(3)} 吨，请核对双方单据或修改数量。`;
    }
  } else {
    if (!input.amount.trim() || !Number.isFinite(amount) || amount <= 0) issues.amount = '请填写大于 0 的结算金额。';
    else if (decimalPlaces(amount) > 2) issues.amount = '结算金额最多保留 2 位小数。';
  }
  const unchanged = input.mode === 'QUANTITY' ? quantity === input.baseQuantity : amount === input.baseAmount;
  if (!unchanged && !input.reason.trim()) issues.reason = '请填写双方协商调整的原因。';
  return issues;
}

/** 后端仍是最终校验方；并发变更等错误回到具体字段，不仅显示在页面底部。 */
export function adjustmentIssuesFromServer(message: string, mode: Input['mode']): AdjustmentIssues {
  if (mode === 'NONE') return {};
  if (/请填写双方协商调整的原因|请填写整单结算调整说明/.test(message)) return { reason: message };
  if (mode === 'QUANTITY' && /协商干基数量|调整后干基数量|干基数量最多|当前可协商数量|settlementAdjustment\.quantity/.test(message)) return { quantity: message };
  if (mode === 'AMOUNT' && /最终结算金额|结算金额最多|请填写大于 0 的结算金额|settlementAdjustment\.amount/.test(message)) return { amount: message };
  return {};
}
