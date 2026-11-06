'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusText } from '@/components/status-text';
import { paymentMoney } from './purchase-payment-context';
import { QuantityReviewSummary, type SettlementQuantityReview } from './settlement-quantity-review';

interface SettlementRecord {
  id: string; settlementNo: string; direction: string; status: string; createdAt: string; confirmedAt?: string | null;
  quantity?: string | null; unit?: string | null; totalAmount: string; settledAmount: string;
  lines: Array<{ sourceSnapshot?: { settlementQuantityReview?: SettlementQuantityReview } | null }>;
}
const STATUS: Record<string, string> = { DRAFT: '草稿 · 未确认', PENDING_APPROVAL: '待审批', REJECTED: '已驳回', CONFIRMED: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清', VOIDED: '已作废' };
const EFFECTIVE = ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'];
const date = (value: string) => new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

export function ContractSettlementRecords({ contractId }: { contractId: string }) {
  const [records, setRecords] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permitted, setPermitted] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const canView = user.role === 'ADMIN' || user.permissions?.includes('settlement.view') || user.permissions?.includes('settlement.manage');
      setPermitted(Boolean(canView));
      if (!canView) { setRecords([]); return; }
      const result = await api.get<{ items: SettlementRecord[] }>(`/financial-settlements?contractId=${encodeURIComponent(contractId)}`);
      if (currentRequest === requestId.current) setRecords(result.items);
    } catch (cause: any) { if (currentRequest === requestId.current) { setRecords([]); setError(cause.message || '结算记录加载失败'); } }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [contractId]);
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [load]);
  const totals = ['PAYABLE', 'RECEIVABLE'].flatMap(direction => {
    const rows = records.filter(row => row.direction === direction && EFFECTIVE.includes(row.status));
    if (!rows.length) return [];
    return [{ direction, count: rows.length, amount: rows.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      paid: rows.reduce((sum, row) => sum + Number(row.settledAmount), 0) }];
  });
  return <Card id="contract-settlement-records" className="scroll-mt-20">
    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0"><CardTitle className="text-base">结算记录</CardTitle>{permitted && <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>刷新</Button>}</CardHeader>
    <CardContent className="space-y-4">
      {loading ? <p className="text-sm text-muted-foreground">正在加载结算记录…</p> : error ? <div role="alert" className="text-sm text-destructive">{error}<Button type="button" size="sm" variant="ghost" onClick={() => void load()}>重试</Button></div>
        : !permitted ? <p className="text-sm text-muted-foreground">当前账号无结算记录查看权限。</p>
          : !records.length ? <p className="text-sm text-muted-foreground">暂无关联结算单</p> : <>
            {totals.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{totals.map(total => <div key={total.direction} className="rounded-md border bg-muted/20 p-3 text-sm"><div className="font-medium">{total.direction === 'PAYABLE' ? '采购应付' : '销售应收'} · 有效结算 {total.count} 单</div><div className="mt-1 tabular-nums">结算 {paymentMoney(total.amount)} · 未结 {paymentMoney(total.amount - total.paid)}</div></div>)}</div>}
            <div className="overflow-x-auto"><table className="w-full min-w-[830px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="whitespace-nowrap p-2">结算单号</th><th className="whitespace-nowrap p-2">结算日期</th><th className="whitespace-nowrap p-2">方向</th><th className="whitespace-nowrap p-2">状态</th><th className="whitespace-nowrap p-2 text-right">数量</th><th className="whitespace-nowrap p-2 text-right">含税金额</th><th className="min-w-60 p-2">数量差异／确认说明</th></tr></thead>
              <tbody>{records.map(row => {
                const review = row.lines.find(line => line.sourceSnapshot?.settlementQuantityReview)?.sourceSnapshot?.settlementQuantityReview;
                return <tr key={row.id} className={`border-b align-top last:border-0 ${row.status === 'VOIDED' ? 'text-muted-foreground' : ''}`}>
                  <td className="whitespace-nowrap p-2"><Link className="font-medium text-primary hover:underline" href={`/dashboard/settlements/${row.id}`}>{row.settlementNo}</Link></td>
                  <td className="whitespace-nowrap p-2">{date(row.confirmedAt || row.createdAt)}{!row.confirmedAt && <div className="text-xs text-muted-foreground">制单日期</div>}</td>
                  <td className="whitespace-nowrap p-2">{row.direction === 'PAYABLE' ? '采购应付' : '销售应收'}</td>
                  <td className="whitespace-nowrap p-2"><StatusText status={row.status}>{STATUS[row.status] || row.status}</StatusText></td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{row.quantity == null ? '—' : `${Number(row.quantity).toFixed(3)} ${unitLabel(row.unit || 'TON')}`}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{paymentMoney(row.totalAmount)}</td>
                  <td className="p-2">{review?.differences.length ? <details><summary className="cursor-pointer text-warning">{review.differences.map(d => `${d.type === 'OVER' ? '超装' : '短装'} ${d.difference.toFixed(3)} 吨`).join('；')} · 查看说明</summary><div className="mt-2 space-y-2"><QuantityReviewSummary review={review} /><p className="whitespace-pre-wrap break-words">{review.reason || '—'}</p></div></details> : '—'}</td>
                </tr>;
              })}</tbody></table></div>
            <p className="text-xs text-muted-foreground">汇总仅包含已确认的有效结算单，草稿、待审批、驳回及作废记录不计入。</p>
          </>}
    </CardContent>
  </Card>;
}
