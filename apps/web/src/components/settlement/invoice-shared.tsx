'use client';

import { useCallback, useEffect, useState } from 'react';
import { logisticsSettlementDetailHref, settlementDetailHref } from '@/lib/settlement-navigation';

export type InvoiceDirection = 'INPUT' | 'OUTPUT';
export type InvoiceSourceType = 'GOODS' | 'FREIGHT';
export type AllocationState = 'UNALLOCATED' | 'PARTIAL' | 'ALLOCATED';
export type Named = { id: string; name: string } | null;
export type TargetRef = { kind: 'SETTLEMENT' | 'LOGISTICS_SETTLEMENT'; id: string; no: string };

export interface AllocationRow {
  id: string; amount: string; quantity?: string | null; createdAt: string; reversedAt?: string | null; reversalReason?: string | null;
  creator: { name: string }; reverser?: { name: string } | null;
  invoice: { id: string; invoiceNo: string; invoiceCode?: string | null; issuedAt: string; materialName: string; taxRate?: string | null; taxInclusiveAmount: string; quantity?: string | null; status: string; contract?: { id: string; contractNo: string } | null };
  settlement?: { id: string; settlementNo: string; direction: string; contract?: { id: string; contractNo: string } | null } | null;
  logisticsSettlement?: { id: string; settlementNo: string } | null;
}

export const SOURCE_LABEL: Record<InvoiceSourceType, string> = { GOODS: '货款', FREIGHT: '运费' };
export const ALLOCATION_TONE: Record<AllocationState, string> = { UNALLOCATED: 'PENDING', PARTIAL: 'PARTIALLY_SETTLED', ALLOCATED: 'SETTLED' };

export const money = (value?: string | number | null) => value == null || value === '' ? '—' : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const qty = (value?: string | number | null) => value == null || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** 按本地日期显示（开票日期按北京时间零点保存，直接截取 UTC 字符串会早一天）。 */
export const day = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** 按最小单位累加，避免浮点尾差；金额 2 位、数量 3 位小数。 */
export const total = (values: Array<string | number | null | undefined>, digits = 2) => {
  const unit = 10 ** digits;
  return values.reduce<number>((sum, value) => sum + Math.round(Number(value || 0) * unit), 0) / unit;
};
/** 票款差：正数表示票多于款，负数表示已付款未到票。 */
export const gapText = (gap: string | number) => {
  const value = Number(gap);
  if (!value) return { text: '票款一致', tone: 'text-muted-foreground' };
  return value > 0 ? { text: `票多于款 ${money(value)}`, tone: 'text-warning' } : { text: `款多于票 ${money(-value)}`, tone: 'text-destructive' };
};

export function targetHref(target: TargetRef, direction?: InvoiceDirection | null) {
  return target.kind === 'SETTLEMENT'
    ? settlementDetailHref(target.id, direction === 'INPUT' ? 'PAYABLE' : direction === 'OUTPUT' ? 'RECEIVABLE' : null)
    : logisticsSettlementDetailHref(target.id);
}

export function usePermission() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setPermissions(user.role === 'ADMIN' || user.roles?.includes('ADMIN') ? ['*'] : user.permissions || []); }
    catch { setPermissions([]); }
  }, []);
  return useCallback((...codes: string[]) => Boolean(permissions && (permissions.includes('*') || codes.some(code => permissions.includes(code)))), [permissions]);
}

/** 发票操作权限：货款按资金结算权限，运费另允许物流结算维护权限。 */
export function useInvoicePermission() {
  const can = usePermission();
  return {
    canCreate: (source: InvoiceSourceType) => source === 'FREIGHT' ? can('settlement.create', 'logistics.settlement.manage') : can('settlement.create'),
    canReverse: (source: InvoiceSourceType) => source === 'FREIGHT' ? can('settlement.reverse', 'logistics.settlement.manage') : can('settlement.reverse'),
  };
}

export function Field({ label, children, wide = false, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`block min-w-0 space-y-1 text-sm ${wide ? 'col-span-2' : ''}`}><span className="font-medium">{label}</span>{children}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
}
