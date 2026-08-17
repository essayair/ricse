export const SETTLEMENT_METHOD_SUGGESTIONS = [
  '按交货结算',
  '预付',
  '分期结算',
  '月结30天',
  '月结60天',
] as const;

const LEGACY_SETTLEMENT_METHOD_LABELS: Record<string, string> = {
  DELIVERY: '按交货结算',
  PREPAY: '预付',
  INSTALLMENT: '分期结算',
  MONTHLY_30: '月结30天',
  MONTHLY_60: '月结60天',
};

export function settlementMethodLabel(value?: string | null) {
  if (!value) return '按交货结算';
  return LEGACY_SETTLEMENT_METHOD_LABELS[value] || value;
}
