// 侧边栏与页面顶部共用同一组入口，避免名称、顺序不一致。
export const PAYABLE_NAV_ITEMS = [
  { href: '/dashboard/payment-requests', label: '付款申请单' },
  { href: '/dashboard/payable-settlements', label: '采购结算单' },
  { href: '/dashboard/payments', label: '付款单' },
] as const;
