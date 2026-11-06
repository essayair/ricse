'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileCheck2, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import { logisticsSettlementDetailHref, settlementDetailHref } from '@/lib/settlement-navigation';
import { ClickableRow } from '@/components/clickable-row';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InvoiceRegisterDialog } from './invoice-register-dialog';

type Direction = 'INPUT' | 'OUTPUT';
type SourceRef = { kind: 'SETTLEMENT' | 'LOGISTICS_SETTLEMENT'; id: string; no: string };
type Named = { id: string; name: string } | null;
type MatchState = 'NONE' | 'PARTIAL' | 'OVER' | 'QUANTITY_MISMATCH' | 'MATCHED';

interface InvoiceRow {
  id: string; sourceType: 'GOODS' | 'FREIGHT'; invoiceNo: string; invoiceCode?: string | null; issuedAt: string;
  materialName: string; quantity?: string | null; taxRate?: string | null; taxAmount?: string | null; taxInclusiveAmount: string;
  status: 'ACTIVE' | 'VOIDED'; voidReason?: string | null; remarks?: string | null;
  seller: Named; buyer: Named; contract: { id: string; contractNo: string; title: string } | null;
  source: SourceRef; businessUnit: Named; creator: { name: string };
}
interface PendingRow {
  sourceType: 'GOODS' | 'FREIGHT'; source: SourceRef; contract: { id: string; contractNo: string; title: string } | null;
  businessUnit: Named; seller: Named; buyer: Named; confirmedAt?: string | null;
  state: MatchState; stateLabel: string; invoiceCount: number; warnings: string[];
  settlementQuantity: string | null; invoiceQuantity: string; settlementAmount: string; invoiceAmount: string; amountDifference: string;
}

const SOURCE_LABEL = { GOODS: '货款', FREIGHT: '运费' } as const;
const STATE_TONE: Record<MatchState, string> = { NONE: 'PENDING', PARTIAL: 'PARTIALLY_SETTLED', OVER: 'REJECTED', QUANTITY_MISMATCH: 'REJECTED', MATCHED: 'SETTLED' };
const money = (value?: string | number | null) => value == null ? '—' : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (value?: string | number | null) => value == null || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
/** 按最小单位累加，避免浮点尾差；金额 2 位、数量 3 位小数。 */
const total = (values: Array<string | number | null | undefined>, digits = 2) => {
  const unit = 10 ** digits;
  return values.reduce<number>((sum, value) => sum + Math.round(Number(value || 0) * unit), 0) / unit;
};

function sourceHref(source: SourceRef, direction: Direction) {
  return source.kind === 'SETTLEMENT' ? settlementDetailHref(source.id, direction === 'INPUT' ? 'PAYABLE' : 'RECEIVABLE') : logisticsSettlementDetailHref(source.id);
}

function usePermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setPermissions(user.role === 'ADMIN' || user.roles?.includes('ADMIN') ? ['*'] : user.permissions || []); }
    catch { setPermissions([]); }
  }, []);
  return useCallback((code: string) => permissions.includes('*') || permissions.includes(code), [permissions]);
}

/**
 * 进项发票（应付管理）/ 销项发票（应收管理）台账。
 * 发票明细跨结算单查询已登记发票；待到票/待开票列出已确认结算依据的到票核对情况，并可直接登记。
 */
export function InvoiceLedger({ direction }: { direction: Direction }) {
  const input = direction === 'INPUT';
  const pendingLabel = input ? '待到票' : '待开票';
  const can = usePermissions();
  const [query, setQuery] = useListQuery({ view: 'records', search: '', sourceType: '', status: '', from: '', to: '', state: 'UNMATCHED' }, { scopeParams: [] });
  const [records, setRecords] = useState<InvoiceRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerFor, setRegisterFor] = useState<PendingRow | null>(null);
  const view = query.view === 'pending' ? 'pending' : 'records';

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams({ direction });
    const filters = { search: query.search.trim(), sourceType: query.sourceType, status: query.status, from: query.from, to: query.to };
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    setRecords(await api.get<InvoiceRow[]>(`/invoices?${params}`) || []);
  }, [direction, query.search, query.sourceType, query.status, query.from, query.to]);
  const loadPending = useCallback(async () => {
    setPending(await api.get<PendingRow[]>(`/invoices/pending?direction=${direction}`) || []);
  }, [direction]);
  const load = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadRecords(), loadPending()]); }
    catch (error: any) { alert(error.message || `${input ? '进项' : '销项'}发票加载失败`); }
    finally { setLoading(false); }
  }, [input, loadPending, loadRecords]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => clearTimeout(timer); }, [load]);

  const visiblePending = useMemo(() => {
    const keyword = query.search.trim().toLowerCase();
    return pending.filter(row => {
      if (query.sourceType && row.sourceType !== query.sourceType) return false;
      if (query.state === 'UNMATCHED' ? row.state === 'MATCHED' : query.state && row.state !== query.state) return false;
      if (!keyword) return true;
      return `${row.source.no} ${row.contract?.contractNo || ''} ${row.contract?.title || ''} ${row.seller?.name || ''} ${row.buyer?.name || ''} ${row.businessUnit?.name || ''}`.toLowerCase().includes(keyword);
    });
  }, [pending, query.search, query.sourceType, query.state]);

  const active = records.filter(row => row.status === 'ACTIVE');
  const unmatched = pending.filter(row => row.state !== 'MATCHED');
  const outstanding = total(unmatched.map(row => Math.max(0, -Number(row.amountDifference))));
  const canRegister = (row: PendingRow) => row.sourceType === 'FREIGHT' ? can('settlement.create') || can('logistics.settlement.manage') : can('settlement.create');
  const counterpartyLabel = input ? '开票方（供应商／承运方）' : '收票方（客户）';
  const counterparty = (row: { seller: Named; buyer: Named }) => (input ? row.seller : row.buyer)?.name || '—';
  const ourEntity = (row: { seller: Named; buyer: Named }) => (input ? row.buyer : row.seller)?.name || '—';

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="有效发票" value={`${active.length} 张`} hint="当前筛选条件下" />
      <Metric label="有效发票含税金额" value={money(total(active.map(row => row.taxInclusiveAmount)))} />
      <Metric label={`${pendingLabel}结算单`} value={`${unmatched.length} 张`} hint="已确认但发票未登记全或有差异" warn={unmatched.length > 0} />
      <Metric label={`${pendingLabel}金额`} value={money(outstanding)} hint="结算金额减已登记发票金额" warn={outstanding > 0} />
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-md border bg-muted/30 p-1">
        {([['records', '发票明细'], ['pending', `${pendingLabel}核对`]] as const).map(([key, label]) => <button key={key} className={`rounded px-4 py-1.5 text-sm ${view === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`} onClick={() => setQuery({ view: key })}>{label}{key === 'pending' && unmatched.length ? <span className="ml-1 text-warning">{unmatched.length}</span> : null}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {input && <select aria-label="发票类型" className="h-9 rounded-md border bg-background px-3 text-sm" value={query.sourceType} onChange={event => setQuery({ sourceType: event.target.value })}><option value="">货款和运费</option><option value="GOODS">货款发票</option><option value="FREIGHT">运费发票</option></select>}
        {view === 'records' ? <>
          <select aria-label="发票状态" className="h-9 rounded-md border bg-background px-3 text-sm" value={query.status} onChange={event => setQuery({ status: event.target.value })}><option value="">全部状态</option><option value="ACTIVE">有效</option><option value="VOIDED">已作废</option></select>
          <Input aria-label="开票日期起" type="date" className="h-9 w-36" value={query.from} onChange={event => setQuery({ from: event.target.value })} /><span className="text-xs text-muted-foreground">至</span><Input aria-label="开票日期止" type="date" className="h-9 w-36" min={query.from || undefined} value={query.to} onChange={event => setQuery({ to: event.target.value })} />
        </> : <select aria-label="核对状态" className="h-9 rounded-md border bg-background px-3 text-sm" value={query.state} onChange={event => setQuery({ state: event.target.value })}><option value="UNMATCHED">仅看未匹配</option><option value="">全部</option><option value="NONE">未到票</option><option value="PARTIAL">部分到票</option><option value="QUANTITY_MISMATCH">数量不符</option><option value="OVER">发票超额</option><option value="MATCHED">已匹配</option></select>}
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 w-72 pl-9" placeholder={view === 'records' ? '发票号码、品名、单位、结算单或合同' : '结算单、合同、单位或事业部'} value={query.search} onChange={event => setQuery({ search: event.target.value })} /></div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className="mr-1 h-3.5 w-3.5" />刷新</Button>
      </div>
    </div>

    <Card className="overflow-hidden">{loading ? <Empty text="正在加载…" /> : view === 'records'
      ? (!records.length ? <Empty text={`暂无${input ? '进项' : '销项'}发票。发票在${input ? '采购结算单、物流结算单' : '销售结算单'}确认后登记，也可在“${pendingLabel}核对”中直接登记。`} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr>
          <th className="whitespace-nowrap p-3">发票号码 / 代码</th><th className="whitespace-nowrap p-3">开票日期</th>{input && <th className="p-3">类型</th>}<th className="p-3">{counterpartyLabel}</th><th className="p-3">状态 / 登记人</th><th className="p-3">品名规格</th><th className="p-3 text-right">数量</th><th className="p-3 text-right">税率</th><th className="p-3 text-right">税额</th><th className="p-3 text-right">含税金额</th><th className="p-3">关联结算单 / 合同</th><th className="p-3">我方主体 / 事业部</th>
        </tr></thead>
        <tbody>{records.map(row => <ClickableRow key={row.id} href={sourceHref(row.source, direction)} className={`border-b align-top hover:bg-muted/20 ${row.status === 'VOIDED' ? 'text-muted-foreground' : ''}`}>
          <td className="p-3 font-mono"><div className={row.status === 'VOIDED' ? 'line-through' : ''}>{row.invoiceNo}</div><div className="text-xs text-muted-foreground">{row.invoiceCode || '—'}</div></td>
          <td className="whitespace-nowrap p-3">{day(row.issuedAt)}</td>
          {input && <td className="whitespace-nowrap p-3">{SOURCE_LABEL[row.sourceType]}</td>}
          <td className="min-w-48 p-3">{counterparty(row)}</td>
          <td className="whitespace-nowrap p-3"><StatusText status={row.status === 'ACTIVE' ? 'SETTLED' : 'VOIDED'}>{row.status === 'ACTIVE' ? '有效' : '已作废'}</StatusText><div className="mt-1 text-xs text-muted-foreground">{row.creator.name}</div>{row.status === 'VOIDED' && row.voidReason && <div className="mt-1 max-w-40 truncate text-xs" title={row.voidReason}>{row.voidReason}</div>}</td>
          <td className="max-w-56 p-3"><div className="truncate" title={row.materialName}>{row.materialName}</div></td>
          <td className="p-3 text-right tabular-nums">{qty(row.quantity)}</td>
          <td className="p-3 text-right tabular-nums">{row.taxRate != null ? `${Number(row.taxRate)}%` : '—'}</td>
          <td className="p-3 text-right tabular-nums">{money(row.taxAmount)}</td>
          <td className="p-3 text-right font-medium tabular-nums">{money(row.taxInclusiveAmount)}</td>
          <td className="p-3"><Link href={sourceHref(row.source, direction)} className="font-mono text-xs hover:text-primary hover:underline">{row.source.no}</Link><div className="mt-1 max-w-52 truncate text-xs text-muted-foreground">{row.contract ? `${row.contract.contractNo} · ${row.contract.title}` : '运费结算'}</div></td>
          <td className="p-3"><div className="max-w-48 truncate">{ourEntity(row)}</div><div className="mt-1 text-xs text-muted-foreground">{row.businessUnit?.name || '—'}</div></td>
        </ClickableRow>)}</tbody>
        <tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={input ? 6 : 5} className="p-3">有效合计（{active.length} 张，不含作废）</td><td className="p-3 text-right">{qty(total(active.map(row => row.quantity), 3))}</td><td /><td className="p-3 text-right">{money(total(active.map(row => row.taxAmount)))}</td><td className="p-3 text-right">{money(total(active.map(row => row.taxInclusiveAmount)))}</td><td colSpan={2} /></tr></tfoot>
      </table></div>)
      : (!visiblePending.length ? <Empty text={pending.length ? '没有符合条件的结算单' : `暂无已确认的${input ? '采购或物流' : '销售'}结算单`} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-sm">
        <thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr>
          <th className="p-3">结算单号</th>{input && <th className="p-3">类型</th>}<th className="p-3">{input ? '开票方' : '收票方'}</th><th className="p-3">核对状态</th><th className="p-3">合同 / 事业部</th><th className="whitespace-nowrap p-3">确认日期</th><th className="p-3 text-right">结算数量 / 发票数量</th><th className="p-3 text-right">结算金额</th><th className="p-3 text-right">已登记发票</th><th className="p-3 text-right">{pendingLabel}金额</th><th className="p-3">操作</th>
        </tr></thead>
        <tbody>{visiblePending.map(row => {
          const gap = -Number(row.amountDifference);
          return <ClickableRow key={`${row.source.kind}-${row.source.id}`} href={sourceHref(row.source, direction)} className="border-b align-top hover:bg-muted/20">
            <td className="p-3 font-mono"><Link href={sourceHref(row.source, direction)} className="hover:text-primary hover:underline">{row.source.no}</Link></td>
            {input && <td className="whitespace-nowrap p-3">{SOURCE_LABEL[row.sourceType]}</td>}
            <td className="min-w-48 p-3">{counterparty(row)}</td>
            <td className="whitespace-nowrap p-3"><StatusText status={STATE_TONE[row.state]}>{row.stateLabel}</StatusText>{row.state !== 'MATCHED' && row.state !== 'NONE' && <div className="mt-1 max-w-56 text-xs text-muted-foreground">{row.warnings.join('；')}</div>}</td>
            <td className="p-3"><div className="max-w-56 truncate">{row.contract ? `${row.contract.contractNo} · ${row.contract.title}` : '运费结算'}</div><div className="mt-1 text-xs text-muted-foreground">{row.businessUnit?.name || '—'}</div></td>
            <td className="whitespace-nowrap p-3">{day(row.confirmedAt)}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{row.settlementQuantity == null ? '—' : `${qty(row.settlementQuantity)} / ${qty(row.invoiceQuantity)}`}</td>
            <td className="p-3 text-right tabular-nums">{money(row.settlementAmount)}</td>
            <td className="p-3 text-right tabular-nums">{money(row.invoiceAmount)}<div className="text-xs text-muted-foreground">{row.invoiceCount} 张</div></td>
            <td className={`p-3 text-right font-medium tabular-nums ${gap > 0 ? 'text-warning' : gap < 0 ? 'text-destructive' : ''}`}>{gap < 0 ? `超 ${money(-gap)}` : money(gap)}</td>
            <td className="p-3">{canRegister(row) && <Button size="sm" variant="outline" onClick={() => setRegisterFor(row)}><FileCheck2 className="mr-1 h-3.5 w-3.5" />登记发票</Button>}</td>
          </ClickableRow>;
        })}</tbody>
      </table></div>)}
    </Card>
    <p className="text-xs text-muted-foreground">发票按结算单登记，作废须在对应结算单详情中操作。系统只核对数量和含税金额，不做发票验真，也不生成会计凭证或税务申报数据。{input ? '运费发票只核对金额。' : ''}</p>

    <InvoiceRegisterDialog
      open={Boolean(registerFor)}
      onOpenChange={value => { if (!value) setRegisterFor(null); }}
      basePath={registerFor ? (registerFor.source.kind === 'SETTLEMENT' ? `/financial-settlements/${registerFor.source.id}` : `/logistics-settlements/${registerFor.source.id}`) : ''}
      kindLabel={input ? '进项' : '销项'}
      sourceLabel={registerFor ? `${registerFor.sourceType === 'FREIGHT' ? '物流结算单' : input ? '采购结算单' : '销售结算单'} ${registerFor.source.no}` : undefined}
      defaults={registerFor?.sourceType === 'FREIGHT' ? { materialName: '运输服务*运输费', taxRate: '9' } : undefined}
      quantityLabel={registerFor?.sourceType === 'FREIGHT' ? '数量' : '数量（吨）'}
      onSaved={load}
    />
  </div>;
}

function Metric({ label, value, hint, warn = false }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? 'text-warning' : ''}`}>{value}</div>{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}</Card>;
}
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
