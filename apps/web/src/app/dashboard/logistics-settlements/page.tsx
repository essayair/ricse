'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { settlementColumnTotal } from '@/lib/settlement-table-totals';
import { emptySettlementFilters, logisticsDateError, settlementMatches } from '@/lib/logistics-settlement-filters';
import { StatusText } from '@/components/status-text';
import { ClickableRow } from '@/components/clickable-row';
import { useListQuery } from '@/lib/use-list-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LogisticsField as Field, logisticsField, day, num, useLogisticsPermission } from '@/components/logistics/logistics-shared';

type Named = { id: string; name: string };
interface SettlementItem {
  id: string; settlementNo: string; status: string; periodStart: string; periodEnd: string; totalNetWeight: string; totalAmount: string;
  payerCompany: Named | null; payerPartner: Named | null; carrierPartner?: Named | null; businessUnit?: Named | null; ownerPartner?: Named | null;
  preparer: Named;
  lines: Array<{ materialName?: string | null; ticketNo?: string | null; waybill: { waybillNo: string; plateNo?: string | null; carrierName?: string | null }; contractPriceTerm?: { contract?: { contractNo: string; title?: string } } | null }>;
}
const STATUS_LABEL: Record<string, string> = { DRAFT: '草稿', SUBMITTED: '已提交', REVIEWED: '已复核', VOIDED: '已作废' };
const options = (values: Array<Named | null | undefined>) => [...new Map(values.filter((value): value is Named => Boolean(value)).map(value => [value.id, value])).values()];

export default function LogisticsSettlementsPage() {
  const can = useLogisticsPermission();
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [filters, setFilters, resetFilters] = useListQuery(emptySettlementFilters());
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const put = (key: keyof typeof filters, value: string) => setFilters({ [key]: value });
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await api.get<SettlementItem[]>('/logistics-settlements') || []); }
    catch (cause: any) { setError(cause.message || '加载物流结算单失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = items.filter(item => settlementMatches(item, filters));
  const valid = visible.filter(item => item.status !== 'VOIDED');
  const carriers = options(items.map(item => item.carrierPartner)), payers = options(items.map(item => item.payerPartner || item.payerCompany)), units = options(items.map(item => item.businessUnit));
  const dateError = logisticsDateError(filters.from, filters.to);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">物流结算单</h1>{can('logistics.settlement.manage') && <Button asChild><Link href="/dashboard/logistics-settlements/new"><Plus className="mr-1 h-4 w-4"/>新建结算单</Link></Button>}</div>
    {error && <div role="alert" className="rounded-md border border-destructive-border bg-destructive-bg p-3 text-sm text-destructive">{error}</div>}
    <Card className="space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div className="md:col-span-2"><Field label="关键词"><Input value={filters.search} onChange={event => put('search', event.target.value)} placeholder="结算单号、运单、车牌、物料或企业"/></Field></div>
        <Field label="状态"><select className={logisticsField} value={filters.status} onChange={event => put('status', event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="物流承运方"><select className={logisticsField} value={filters.carrierId} onChange={event => put('carrierId', event.target.value)}><option value="">全部承运方</option>{carriers.map(carrier => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}</select></Field>
        <Field label="付款主体"><select className={logisticsField} value={filters.payerId} onChange={event => put('payerId', event.target.value)}><option value="">全部付款主体</option>{payers.map(payer => <option key={payer.id} value={payer.id}>{payer.name}</option>)}</select></Field>
        <Field label="业务单元（事业部）"><select className={logisticsField} value={filters.businessUnitId} onChange={event => put('businessUnitId', event.target.value)}><option value="">全部事业部</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
        <Field label="结算周期起日"><Input type="date" value={filters.from} onChange={event => put('from', event.target.value)}/></Field>
        <Field label="结算周期止日"><Input type="date" value={filters.to} onChange={event => put('to', event.target.value)}/></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>筛选结果 {visible.length} / {items.length} 单{(filters.from || filters.to) && ' · 按结算周期交集筛选'}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={resetFilters}>重置筛选</Button><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5"/>{loading ? '刷新中…' : '刷新'}</Button></div></div>
      {dateError && <p role="alert" className="text-sm text-destructive">{dateError}</p>}
    </Card>
    <Card className="overflow-hidden">{loading ? <div className="p-12 text-center text-muted-foreground">加载中…</div> : !visible.length ? <div className="p-12 text-center text-sm text-muted-foreground">{items.length ? '未找到符合筛选条件的结算单' : '暂无结算单'}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm">
      <thead className="border-b bg-surface-2 text-left text-xs text-muted-foreground"><tr>{['结算单号', '付款主体／货主', '物流承运方', '状态', '事业部', '结算周期', '车次', '净重合计（吨）', '含税金额（元）', '制表人', '操作'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
      <tbody>{visible.map(item => <ClickableRow key={item.id} href={'/dashboard/logistics-settlements/' + item.id} className="border-b align-top hover:bg-muted/20">
        <td className="whitespace-nowrap p-3 font-mono"><Link href={'/dashboard/logistics-settlements/' + item.id} className="hover:text-primary hover:underline">{item.settlementNo}</Link></td><td className="min-w-48 p-3">{item.payerPartner?.name || item.payerCompany?.name || '—'}{item.ownerPartner && item.ownerPartner.id !== item.payerPartner?.id && <p className="mt-1 text-xs text-muted-foreground">货主：{item.ownerPartner.name}</p>}</td>
        <td className="min-w-44 p-3">{item.carrierPartner?.name || '历史未记录'}</td><td className="whitespace-nowrap p-3"><StatusText status={item.status}>{STATUS_LABEL[item.status] || item.status}</StatusText></td><td className="min-w-36 p-3">{item.businessUnit?.name || '历史未记录'}</td>
        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{day(item.periodStart)} ～ {day(item.periodEnd)}</td><td className="p-3 text-right tabular-nums">{item.lines.length}</td><td className="p-3 text-right tabular-nums">{num(item.totalNetWeight)}</td><td className="p-3 text-right font-medium tabular-nums">{num(item.totalAmount, 2)}</td><td className="whitespace-nowrap p-3">{item.preparer.name}</td><td className="p-3"><Button size="sm" variant="ghost" asChild><Link href={'/dashboard/logistics-settlements/' + item.id}>详情</Link></Button></td>
      </ClickableRow>)}</tbody>
      <tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={6} className="p-3">当前结果有效合计（不含作废，含草稿）</td><td className="p-3 text-right">{valid.reduce((sum, item) => sum + item.lines.length, 0)}</td><td className="p-3 text-right">{num(settlementColumnTotal(valid.map(item => item.totalNetWeight)))}</td><td className="p-3 text-right">{num(settlementColumnTotal(valid.map(item => item.totalAmount), 2), 2)}</td><td colSpan={2}/></tr></tfoot>
    </table></div>}</Card>
  </div>;
}
