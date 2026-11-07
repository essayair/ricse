export type SettlementSummaryAdjustment = {
  version: number; mode: 'NONE' | 'QUANTITY' | 'AMOUNT'; reason: string;
  base: { quantity: number; grossAmount: number; qualityDeductionAmount: number; adjustmentAmount: number; totalAmount: number };
  final: { quantity: number; grossAmount: number; qualityDeductionAmount: number; adjustmentAmount: number; totalAmount: number };
  quantityDifference: number; amountDifference: number; unitPrice?: number | null;
};
const number = (value: number, digits: number) => Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function SettlementAdjustmentSummary({ summary }: { summary?: SettlementSummaryAdjustment | null }) {
  if (!summary || summary.mode === 'NONE') return null;
  return <section className="space-y-3 rounded-md border bg-surface-2 p-4 text-sm"><h3 className="font-semibold">最终结算调整</h3>
    <div className="grid gap-3 sm:grid-cols-2"><div>明细合计数量：{number(summary.base.quantity, 3)} 吨</div><div>明细合计金额：{number(summary.base.totalAmount, 2)} 元</div><div>最终结算数量：<b>{number(summary.final.quantity, 3)} 吨</b></div><div>最终结算金额：<b>{number(summary.final.totalAmount, 2)} 元</b></div></div>
    <p className="text-xs text-muted-foreground">{summary.mode === 'QUANTITY' ? `按调整后干基数量 × ${number(summary.unitPrice || 0, 4)} 元/吨重算，并计入适用质量扣款。` : '整单金额调整，不分摊到各车。'}数量差额 {number(summary.quantityDifference, 3)} 吨；金额差额 {number(summary.amountDifference, 2)} 元。</p>
    <p className="whitespace-pre-wrap">调整说明：{summary.reason}</p>
  </section>;
}
