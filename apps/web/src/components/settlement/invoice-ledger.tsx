'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileCheck2, Link2, Plus, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import { ClickableRow } from '@/components/clickable-row';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InvoiceRegisterDialog, InvoiceRegisterMode } from './invoice-register-dialog';
import { InvoiceAllocateDialog, AllocateSource } from './invoice-allocate-dialog';
import { InvoiceDetailDialog } from './invoice-detail-dialog';
import { ALLOCATION_TONE, AllocationState, InvoiceDirection, Named, SOURCE_LABEL, TargetRef, day, gapText, money, qty, targetHref, total, useInvoicePermission } from './invoice-shared';

type MatchState = 'NONE' | 'PARTIAL' | 'OVER' | 'QUANTITY_MISMATCH' | 'MATCHED';

interface InvoiceRow {
  id: string; sourceType: 'GOODS' | 'FREIGHT'; invoiceNo: string; invoiceCode?: string | null; issuedAt: string;
  materialName: string; quantity?: string | null; taxRate?: string | null; taxAmount?: string | null; taxInclusiveAmount: string;
  status: 'ACTIVE' | 'VOIDED'; voidReason?: string | null;
  seller: Named; buyer: Named; contract: { id: string; contractNo: string; title: string } | null; businessUnit: Named; creator: { name: string };
  allocatedAmount: string; remainingAmount: string; allocationState: AllocationState; allocationStateLabel: string;
  targets: Array<TargetRef & { amount: string }>;
}
interface PendingRow {
  sourceType: 'GOODS' | 'FREIGHT'; source: TargetRef; contract: { id: string; contractNo: string; title: string } | null;
  businessUnit: Named; seller: Named; buyer: Named; confirmedAt?: string | null;
  state: MatchState; stateLabel: string; invoiceCount: number; warnings: string[];
  settlementQuantity: string | null; invoiceQuantity: string | null; settlementAmount: string; invoiceAmount: string;
  remainingAmount: string; paidAmount: string; invoicePaymentGap: string;
}

const STATE_TONE: Record<MatchState, string> = { NONE: 'PENDING', PARTIAL: 'PARTIALLY_SETTLED', OVER: 'REJECTED', QUANTITY_MISMATCH: 'REJECTED', MATCHED: 'SETTLED' };

/**
 * 进项发票（应付管理）/ 销项发票（应收管理）。
 * 发票明细：先登记、按金额分摊到一张或多张结算单；到票核对：按结算单看已到票、未到票与票款差。
 */
export function InvoiceLedger({ direction }: { direction: InvoiceDirection }) {
  const input = direction === 'INPUT';
  const kindLabel = input ? '进项' : '销项';
  const pendingLabel = input ? '待到票' : '待开票';
  const cashLabel = input ? '已付款' : '已收款';
  const { canCreate } = useInvoicePermission();
  const [query, setQuery] = useListQuery({ view: 'records', search: '', sourceType: '', status: '', allocation: '', from: '', to: '', state: 'UNMATCHED' }, { scopeParams: [] });
  const [records, setRecords] = useState<InvoiceRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerMode, setRegisterMode] = useState<InvoiceRegisterMode | null>(null);
  const [allocateSource, setAllocateSource] = useState<AllocateSource | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const view = query.view === 'pending' ? 'pending' : 'records';

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams({ direction });
    const filters = { search: query.search.trim(), sourceType: query.sourceType, status: query.status, allocation: query.allocation, from: query.from, to: query.to };
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    setRecords(await api.get<InvoiceRow[]>(`/invoices?${params}`) || []);
  }, [direction, query.search, query.sourceType, query.status, query.allocation, query.from, query.to]);
  const loadPending = useCallback(async () => {
    setPending(await api.get<PendingRow[]>(`/invoices/pending?direction=${direction}`) || []);
  }, [direction]);
  const load = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadRecords(), loadPending()]); }
    catch (error: any) { alert(error.message || `${kindLabel}发票加载失败`); }
    finally { setLoading(false); }
  }, [kindLabel, loadPending, loadRecords]);
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
  const unallocated = total(active.map(row => row.remainingAmount));
  const unmatched = pending.filter(row => row.state !== 'MATCHED');
  const outstanding = total(unmatched.map(row => Math.max(0, Number(row.remainingAmount))));
  const counterparty = (row: { seller: Named; buyer: Named }) => (input ? row.seller : row.buyer)?.name || '—';
  const ourEntity = (row: { seller: Named; buyer: Named }) => (input ? row.buyer : row.seller)?.name || '—';
  const canStandalone = canCreate('GOODS') || (input && canCreate('FREIGHT'));
  const sourceLabel = (row: PendingRow) => `${row.sourceType === 'FREIGHT' ? '物流结算单' : input ? '采购结算单' : '销售结算单'} ${row.source.no}`;
  const openRegisterFor = (row: PendingRow) => setRegisterMode({
    kind: 'settlement', basePath: row.source.kind === 'SETTLEMENT' ? `/financial-settlements/${row.source.id}` : `/logistics-settlements/${row.source.id}`,
    sourceType: row.sourceType, direction, sourceLabel: sourceLabel(row), remainingAmount: row.remainingAmount,
  });
  const openLinkFor = (row: PendingRow) => setAllocateSource({
    kind: 'target', ...(row.source.kind === 'SETTLEMENT' ? { settlementId: row.source.id } : { logisticsSettlementId: row.source.id }),
    label: sourceLabel(row), remainingAmount: row.remainingAmount, freight: row.sourceType === 'FREIGHT',
  });
  const pendingActions = (row: PendingRow) => canCreate(row.sourceType) && Number(row.remainingAmount) > 0
    ? <div className="flex gap-2">
      <Button size="sm" variant="outline" className="h-8" onClick={() => openLinkFor(row)}><Link2 className="mr-1 h-3.5 w-3.5" />关联发票</Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => openRegisterFor(row)}><FileCheck2 className="mr-1 h-3.5 w-3.5" />登记</Button>
    </div> : null;

  const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-auto';
  const stickyLeft = 'sticky left-0 z-10 bg-background group-hover:bg-muted';
  const stickyRight = 'sticky right-0 z-10 border-l bg-background group-hover:bg-muted';
  const registerButton = (className: string) => canStandalone ? <Button size="sm" className={`h-9 ${className}`} onClick={() => setRegisterMode({ kind: 'standalone', direction })}><Plus className="mr-1 h-4 w-4" />登记发票</Button> : null;

  return <div className="space-y-4 sm:space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="有效发票含税金额" value={money(total(active.map(row => row.taxInclusiveAmount)))} hint={`${active.length} 张，当前筛选条件下`} />
      <Metric label="待分摊发票金额" value={money(unallocated)} hint="已登记但尚未分摊到结算单" warn={unallocated > 0} />
      <Metric label={`${pendingLabel}结算单`} value={`${unmatched.length} 张`} hint="已确认但未全额到票或有差异" warn={unmatched.length > 0} />
      <Metric label={`${pendingLabel}金额`} value={money(outstanding)} hint="结算金额减已分摊发票金额" warn={outstanding > 0} />
    </div>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="查看方式" className="flex rounded-md border bg-muted/30 p-1">
          {([['records', '发票明细'], ['pending', `${pendingLabel}核对`]] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={view === key} className={`whitespace-nowrap rounded px-4 py-1.5 text-sm ${view === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`} onClick={() => setQuery({ view: key })}>{label}{key === 'pending' && unmatched.length ? <span className="ml-1 text-warning">{unmatched.length}</span> : null}</button>)}
        </div>
        {registerButton('xl:hidden')}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center xl:justify-end">
        {input && <select aria-label="发票类型" className={selectClass} value={query.sourceType} onChange={event => setQuery({ sourceType: event.target.value })}><option value="">货款和运费</option><option value="GOODS">货款发票</option><option value="FREIGHT">运费发票</option></select>}
        {view === 'records' ? <>
          <select aria-label="分摊状态" className={selectClass} value={query.allocation} onChange={event => setQuery({ allocation: event.target.value })}><option value="">全部分摊状态</option><option value="UNALLOCATED">待分摊</option><option value="PARTIAL">部分分摊</option><option value="ALLOCATED">已分摊</option></select>
          <select aria-label="发票状态" className={selectClass} value={query.status} onChange={event => setQuery({ status: event.target.value })}><option value="">有效和作废</option><option value="ACTIVE">有效</option><option value="VOIDED">已作废</option></select>
          <div className="col-span-2 flex items-center gap-2"><Input aria-label="开票日期起" type="date" className="h-9 min-w-0 flex-1 sm:w-36 sm:flex-none" value={query.from} onChange={event => setQuery({ from: event.target.value })} /><span className="shrink-0 text-xs text-muted-foreground">至</span><Input aria-label="开票日期止" type="date" className="h-9 min-w-0 flex-1 sm:w-36 sm:flex-none" min={query.from || undefined} value={query.to} onChange={event => setQuery({ to: event.target.value })} /></div>
        </> : <select aria-label="核对状态" className={selectClass} value={query.state} onChange={event => setQuery({ state: event.target.value })}><option value="UNMATCHED">仅看未匹配</option><option value="">全部</option><option value="NONE">未到票</option><option value="PARTIAL">部分到票</option><option value="QUANTITY_MISMATCH">数量不符</option><option value="OVER">发票超额</option><option value="MATCHED">已匹配</option></select>}
        <div className="col-span-2 flex gap-2 sm:col-span-1"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索" className="h-9 w-full pl-9 sm:w-60" placeholder={view === 'records' ? '发票号码、品名、单位、结算单或合同' : '结算单、合同、单位或事业部'} value={query.search} onChange={event => setQuery({ search: event.target.value })} /></div>
          <Button size="sm" variant="outline" className="h-9 shrink-0" disabled={loading} onClick={() => void load()} aria-label="刷新"><RefreshCw className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">刷新</span></Button></div>
        {registerButton('hidden xl:inline-flex')}
      </div>
    </div>

    {loading ? <Card><Empty text="正在加载…" /></Card> : view === 'records' ? (!records.length
      ? <Card><Empty text={`暂无${kindLabel}发票。票先到时点“登记发票”，结算单确认后再分摊；也可在结算单详情中直接登记。`} /></Card>
      : <>
        <div className="space-y-3 md:hidden">
          {records.map(row => <button type="button" key={row.id} onClick={() => setDetailId(row.id)} className={`block w-full rounded-lg border bg-card p-4 text-left active:bg-muted ${row.status === 'VOIDED' ? 'text-muted-foreground' : ''}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className={`truncate font-mono text-sm font-medium ${row.status === 'VOIDED' ? 'line-through' : ''}`}>{row.invoiceNo}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{day(row.issuedAt)}{input ? ` · ${SOURCE_LABEL[row.sourceType]}` : ''} · {row.materialName}</div></div><StatusText status={row.status === 'VOIDED' ? 'VOIDED' : ALLOCATION_TONE[row.allocationState]}>{row.allocationStateLabel}</StatusText></div>
            <div className="mt-2 truncate text-sm">{counterparty(row)}</div>
            <div className="mt-3 flex items-end justify-between gap-3"><div className="min-w-0 text-xs text-muted-foreground"><div className="truncate">{row.targets.length ? row.targets.map(target => target.no).join('、') : row.contract ? `归属 ${row.contract.contractNo}` : '未分摊'}</div>{row.status === 'ACTIVE' && Number(row.remainingAmount) > 0 && <div className="text-warning">待分摊 {money(row.remainingAmount)}</div>}</div><div className="shrink-0 text-right text-base font-semibold tabular-nums">{money(row.taxInclusiveAmount)}</div></div>
          </button>)}
          <div className="rounded-lg border bg-surface-2 p-3 text-sm font-medium tabular-nums">有效合计 {active.length} 张 · {money(total(active.map(row => row.taxInclusiveAmount)))} · 待分摊 {money(unallocated)}</div>
        </div>
        <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1440px] text-sm">
          <thead className="border-b bg-surface-2 text-left text-muted-foreground"><tr className="[&>th]:whitespace-nowrap [&>th]:p-3">
            <th className="sticky left-0 z-10 bg-surface-2">发票号码 / 代码</th><th>开票日期</th>{input && <th>类型</th>}<th>{input ? '开票方（供应商／承运方）' : '收票方（客户）'}</th><th>分摊状态</th><th>品名规格</th><th className="text-right">税率</th><th className="text-right">含税金额</th><th className="text-right">已分摊</th><th className="text-right">待分摊</th><th>分摊到结算单</th><th>我方主体 / 事业部</th>
          </tr></thead>
          <tbody>{records.map(row => <ClickableRow key={row.id} onOpen={() => setDetailId(row.id)} className={`group border-b align-top hover:bg-muted ${row.status === 'VOIDED' ? 'text-muted-foreground' : ''}`}>
            <td className={`${stickyLeft} p-3 font-mono`}><div className={row.status === 'VOIDED' ? 'line-through' : ''}>{row.invoiceNo}</div><div className="text-xs text-muted-foreground">{row.invoiceCode || '—'}</div></td>
            <td className="whitespace-nowrap p-3">{day(row.issuedAt)}</td>
            {input && <td className="whitespace-nowrap p-3">{SOURCE_LABEL[row.sourceType]}</td>}
            <td className="min-w-44 p-3">{counterparty(row)}{row.contract && <div className="mt-1 text-xs text-muted-foreground">归属 {row.contract.contractNo}</div>}</td>
            <td className="whitespace-nowrap p-3"><StatusText status={row.status === 'VOIDED' ? 'VOIDED' : ALLOCATION_TONE[row.allocationState]}>{row.allocationStateLabel}</StatusText><div className="mt-1 text-xs text-muted-foreground">{row.creator.name}</div></td>
            <td className="max-w-48 p-3"><div className="truncate" title={row.materialName}>{row.materialName}</div>{row.quantity && <div className="text-xs text-muted-foreground">{qty(row.quantity)}</div>}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{row.taxRate != null ? `${Number(row.taxRate)}%` : '—'}</td>
            <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">{money(row.taxInclusiveAmount)}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.allocatedAmount)}</td>
            <td className={`whitespace-nowrap p-3 text-right tabular-nums ${row.status === 'ACTIVE' && Number(row.remainingAmount) > 0 ? 'text-warning' : ''}`}>{row.status === 'ACTIVE' ? money(row.remainingAmount) : '—'}</td>
            <td className="max-w-56 p-3">{row.targets.length ? <div className="space-y-0.5">{row.targets.slice(0, 3).map(target => <div key={target.id} className="truncate text-xs"><Link href={targetHref(target, direction)} className="font-mono hover:text-primary hover:underline">{target.no}</Link><span className="ml-1 text-muted-foreground">{money(target.amount)}</span></div>)}{row.targets.length > 3 && <div className="text-xs text-muted-foreground">等 {row.targets.length} 张</div>}</div> : <span className="text-xs text-muted-foreground">—</span>}</td>
            <td className="p-3"><div className="max-w-44 truncate" title={ourEntity(row)}>{ourEntity(row)}</div><div className="mt-1 text-xs text-muted-foreground">{row.businessUnit?.name || '—'}</div></td>
          </ClickableRow>)}</tbody>
          <tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td className="sticky left-0 z-10 whitespace-nowrap bg-surface-2 p-3">有效合计（{active.length} 张，不含作废）</td><td colSpan={input ? 6 : 5} /><td className="whitespace-nowrap p-3 text-right">{money(total(active.map(row => row.taxInclusiveAmount)))}</td><td className="whitespace-nowrap p-3 text-right">{money(total(active.map(row => row.allocatedAmount)))}</td><td className="whitespace-nowrap p-3 text-right">{money(unallocated)}</td><td colSpan={2} /></tr></tfoot>
        </table></div></Card>
      </>)
      : (!visiblePending.length ? <Card><Empty text={pending.length ? '没有符合条件的结算单' : `暂无已确认的${input ? '采购或物流' : '销售'}结算单`} /></Card> : <>
        <div className="space-y-3 md:hidden">
          {visiblePending.map(row => { const gap = gapText(row.invoicePaymentGap); const actions = pendingActions(row); return <div key={`${row.source.kind}-${row.source.id}`} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3"><Link href={targetHref(row.source, direction)} className="min-w-0 truncate font-mono text-sm font-medium text-primary">{row.source.no}</Link><StatusText status={STATE_TONE[row.state]}>{row.stateLabel}</StatusText></div>
            <div className="mt-1 truncate text-sm">{counterparty(row)}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{input ? `${SOURCE_LABEL[row.sourceType]} · ` : ''}{row.contract ? row.contract.contractNo : '运费结算'} · 确认 {day(row.confirmedAt)}</div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">结算金额</dt><dd className="mt-0.5 font-medium tabular-nums">{money(row.settlementAmount)}</dd></div><div><dt className="text-muted-foreground">{cashLabel}</dt><dd className="mt-0.5 font-medium tabular-nums">{money(row.paidAmount)}</dd></div><div><dt className="text-muted-foreground">已到票（{row.invoiceCount}笔）</dt><dd className="mt-0.5 font-medium tabular-nums">{money(row.invoiceAmount)}</dd></div><div><dt className="text-muted-foreground">{pendingLabel}</dt><dd className={`mt-0.5 font-semibold tabular-nums ${Number(row.remainingAmount) > 0 ? 'text-warning' : ''}`}>{money(row.remainingAmount)}</dd></div></dl>
            <p className={`mt-2 text-xs ${gap.tone}`}>{gap.text}</p>
            {actions && <div className="mt-3 border-t pt-3">{actions}</div>}
          </div>; })}
        </div>
        <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1360px] text-sm">
          <thead className="border-b bg-surface-2 text-left text-muted-foreground"><tr className="[&>th]:whitespace-nowrap [&>th]:p-3">
            <th className="sticky left-0 z-10 bg-surface-2">结算单号</th>{input && <th>类型</th>}<th>{input ? '开票方' : '收票方'}</th><th>核对状态</th><th>合同 / 事业部</th><th>确认日期</th><th className="text-right">结算金额</th><th className="text-right">{cashLabel}</th><th className="text-right">已到票</th><th className="text-right">{pendingLabel}</th><th>票款差</th><th className="sticky right-0 z-10 border-l bg-surface-2">操作</th>
          </tr></thead>
          <tbody>{visiblePending.map(row => { const gap = gapText(row.invoicePaymentGap); return <ClickableRow key={`${row.source.kind}-${row.source.id}`} href={targetHref(row.source, direction)} className="group border-b align-top hover:bg-muted">
            <td className={`${stickyLeft} whitespace-nowrap p-3 font-mono`}><Link href={targetHref(row.source, direction)} className="hover:text-primary hover:underline">{row.source.no}</Link></td>
            {input && <td className="whitespace-nowrap p-3">{SOURCE_LABEL[row.sourceType]}</td>}
            <td className="min-w-44 p-3">{counterparty(row)}</td>
            <td className="p-3"><StatusText status={STATE_TONE[row.state]} className="whitespace-nowrap">{row.stateLabel}</StatusText>{row.state === 'QUANTITY_MISMATCH' || row.state === 'OVER' ? <div className="mt-1 w-44 text-xs text-muted-foreground">{row.warnings.join('；')}</div> : null}</td>
            <td className="p-3"><div className="max-w-52 truncate" title={row.contract ? `${row.contract.contractNo} · ${row.contract.title}` : undefined}>{row.contract ? `${row.contract.contractNo} · ${row.contract.title}` : '运费结算'}</div><div className="mt-1 text-xs text-muted-foreground">{row.businessUnit?.name || '—'}</div></td>
            <td className="whitespace-nowrap p-3">{day(row.confirmedAt)}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.settlementAmount)}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.paidAmount)}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.invoiceAmount)}<div className="text-xs text-muted-foreground">{row.invoiceCount} 笔</div></td>
            <td className={`whitespace-nowrap p-3 text-right font-medium tabular-nums ${Number(row.remainingAmount) > 0 ? 'text-warning' : Number(row.remainingAmount) < 0 ? 'text-destructive' : ''}`}>{money(row.remainingAmount)}</td>
            <td className={`whitespace-nowrap p-3 text-xs ${gap.tone}`}>{gap.text}</td>
            <td className={`${stickyRight} p-3`}>{pendingActions(row) || <span className="text-xs text-muted-foreground">—</span>}</td>
          </ClickableRow>; })}</tbody>
        </table></div></Card>
      </>)}
    <p className="text-xs text-muted-foreground">发票总额应与最终的全部结算单对应：一张发票可分摊到多张结算单，一张结算单可接收多张发票。票款差 = 已到票 − {cashLabel}。系统不做发票验真，也不生成会计凭证或税务申报数据。{input ? '运费发票只核对金额。' : ''}</p>

    <InvoiceRegisterDialog open={Boolean(registerMode)} onOpenChange={value => { if (!value) setRegisterMode(null); }} mode={registerMode} onSaved={load} />
    <InvoiceAllocateDialog open={Boolean(allocateSource)} onOpenChange={value => { if (!value) setAllocateSource(null); }} source={allocateSource} onSaved={load} />
    <InvoiceDetailDialog invoiceId={detailId} onOpenChange={value => { if (!value) setDetailId(null); }} onChanged={load} />
  </div>;
}

function Metric({ label, value, hint, warn = false }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return <Card className="min-w-0 p-3 sm:p-4"><div className="truncate text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl ${warn ? 'text-warning' : ''}`} title={value}>{value}</div>{hint && <div className="mt-1 hidden text-xs text-muted-foreground sm:block">{hint}</div>}</Card>;
}
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
