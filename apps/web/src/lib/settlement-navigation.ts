// 侧边栏与页面顶部共用同一组入口，避免名称、顺序不一致。
// 应付管理：付出去的钱与收进来的票；应收管理：收进来的钱与开出去的票。
export const PAYABLE_NAV_ITEMS = [
  { href: '/dashboard/payment-requests', label: '付款申请单' },
  { href: '/dashboard/payable-settlements', label: '采购结算单' },
  { href: '/dashboard/payments', label: '付款单' },
  { href: '/dashboard/input-invoices', label: '进项发票' },
  { href: '/dashboard/payable-ledger', label: '应付台账' },
] as const;

export const RECEIVABLE_NAV_ITEMS = [
  { href: '/dashboard/receivables', label: '销售结算单' },
  { href: '/dashboard/receipts', label: '收款单' },
  { href: '/dashboard/output-invoices', label: '销项发票' },
  { href: '/dashboard/receivable-ledger', label: '应收台账' },
] as const;

export const SETTLEMENT_NAV_HREFS: readonly string[] = [...PAYABLE_NAV_ITEMS, ...RECEIVABLE_NAV_ITEMS].map(item => item.href);

/** 结算单详情地址带上方向，面包屑据此归入应付管理或应收管理。 */
export const settlementDetailHref = (id: string, direction?: 'PAYABLE' | 'RECEIVABLE' | string | null) =>
  `/dashboard/settlements/${id}${direction === 'PAYABLE' || direction === 'RECEIVABLE' ? `?direction=${direction}` : ''}`;

/** 物流结算单详情地址。 */
export const logisticsSettlementDetailHref = (id: string) => `/dashboard/logistics-settlements/${id}`;
