export interface SettlementQuantityReview {
  version: number; key: string; finalSettlement: boolean; reason: string; confirmed: boolean;
  recordedBy?: string; recordedByName?: string; recordedAt?: string;
  differences: Array<{ contractLineItemId: string; materialName: string; type: string; contractQuantity: number;
    lowerQuantity: number; upperQuantity: number; currentQuantity: number; previousQuantity: number; totalQuantity: number; difference: number }>;
}

export function QuantityReviewSummary({ review }: { review: SettlementQuantityReview }) {
  return <div className="space-y-2 text-sm">{review.differences.map(row => <div key={row.contractLineItemId} className="rounded-md border p-3">
    <div className="font-medium">{row.materialName} · {row.type === 'OVER' ? '超出溢装上限' : '低于短装下限'} {row.difference.toFixed(3)} 吨</div>
    <div className="mt-1 text-xs text-muted-foreground">合同 {row.contractQuantity.toFixed(3)} 吨 · 允许范围 {row.lowerQuantity.toFixed(3)}～{row.upperQuantity.toFixed(3)} 吨</div>
    <div className="mt-1 text-xs text-muted-foreground">既往已结／草稿占用 {row.previousQuantity.toFixed(3)} 吨 ＋ 本次 {row.currentQuantity.toFixed(3)} 吨 ＝ 累计 {row.totalQuantity.toFixed(3)} 吨</div>
  </div>)}</div>;
}

/** 打印仅呈现双方需确认的业务事实，不带账号及内部审批信息。 */
export function quantityReviewPrintText(review?: SettlementQuantityReview | null) {
  if (!review?.differences.length) return '';
  return `数量差异：${review.differences.map(row => `${row.materialName}累计结算 ${row.totalQuantity.toFixed(3)} 吨，${row.type === 'OVER' ? '超出溢装上限' : '低于短装下限'} ${row.difference.toFixed(3)} 吨`).join('；')}。双方确认说明：${review.reason}`;
}
