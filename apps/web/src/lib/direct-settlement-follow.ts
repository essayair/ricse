interface FollowSource {
  id: string; followSales?: boolean;
  followAdjustment?: { settlementId: string; settlementNo: string; finalQuantity: number; waybillLineItemIds: string[] } | null;
}
export function directPurchaseFollowAdjustment(rows: FollowSource[]) {
  const groups = [...new Map(rows.filter(row => row.followSales && row.followAdjustment).map(row => [row.followAdjustment!.settlementId, row.followAdjustment!])).values()];
  if (!groups.length) return { adjustment: null, issue: '' };
  if (groups.length > 1) return { adjustment: null, issue: '所选车辆分属多张整单调整的销售结算，请分别编制采购结算' };
  const adjustment = groups[0], selected = new Set(rows.map(row => row.id));
  const complete = adjustment.waybillLineItemIds.length === selected.size && adjustment.waybillLineItemIds.every(id => selected.has(id));
  return { adjustment, issue: complete ? '' : `请选齐销售结算 ${adjustment.settlementNo} 的全部车辆后再预览或保存` };
}
