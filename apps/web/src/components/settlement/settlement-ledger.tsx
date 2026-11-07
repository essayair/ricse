'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpenCheck, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { ClickableRow } from '@/components/clickable-row';
import { useListQuery } from '@/lib/use-list-query';

interface LedgerRow {
  id: string; contractId: string; contractNo: string; contractTitle: string; contractType: string;
  direction: 'RECEIVABLE' | 'PAYABLE'; legalEntity: { name: string }; counterparty: { name: string };
  businessUnit?: { name: string } | null; contractAmount: number; draftAmount: number; settlementAmount: number;
  adjustmentAmount: number; fundAmount: number; allocatedAmount: number; unappliedFundAmount: number;
  advanceBalance: number; outstandingAmount: number; overdueAmount: number; latestSettlementAt?: string | null; status: string;
}

const STATUS: Record<string, string> = { UNSETTLED: '未结算', PENDING_PAYMENT: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清' };
const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 应付台账、应收台账：按合同汇总单一方向的结算、收付款、核销与未结情况。收付合并总览后续放到工作台。 */
export function SettlementLedger({ direction, showTitle = true }: { direction: 'PAYABLE' | 'RECEIVABLE'; showTitle?: boolean }) {
  const [items, setItems] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** 合同维度到票：已分摊到本合同结算单的发票金额，以及归属本合同尚未分摊的发票余额。 */
  const [invoiceByContract, setInvoiceByContract] = useState(new Map<string, { allocated: number; unallocated: number }>());
  const [query, setQuery] = useListQuery({ search: '', status: '' });
  const { search, status } = query;
  const payable = direction === 'PAYABLE';
  const title = payable ? '应付台账' : '应收台账';
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, invoices] = await Promise.all([
        api.get<LedgerRow[]>('/financial-settlements/ledger'),
        api.get<Array<{ contractId: string; allocatedAmount: string; unallocatedAmount: string }>>(`/invoices/contract-summary?direction=${direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT'}`).catch(() => []),
      ]);
      setItems(rows || []);
      setInvoiceByContract(new Map((invoices || []).map(row => [row.contractId, { allocated: Number(row.allocatedAmount), unallocated: Number(row.unallocatedAmount) }])));
    }
    catch (error: any) { alert(error.message || '加载结算台账失败'); }
    finally { setLoading(false); }
  }, [direction]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => items.filter((item) => {
    if (item.direction !== direction) return false;
    if (status && item.status !== status) return false;
    if (!search.trim()) return true;
    return `${item.contractNo} ${item.contractTitle} ${item.legalEntity.name} ${item.counterparty.name} ${item.businessUnit?.name || ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [direction, items, search, status]);
  const summary = visible.reduce((result, item) => ({
    contract: result.contract + item.contractAmount,
    settlement: result.settlement + item.settlementAmount,
    allocated: result.allocated + item.allocatedAmount,
    outstanding: result.outstanding + item.outstandingAmount,
    overdue: result.overdue + item.overdueAmount,
  }), { contract: 0, settlement: 0, allocated: 0, outstanding: 0, overdue: 0 });

  const contractHref = (item: LedgerRow) => `/dashboard/contracts/${item.contractId}`;
  return <div className="space-y-4 sm:space-y-5">
    {showTitle && <div><h1 className="text-xl font-bold sm:text-2xl">{title}</h1></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="合同口径金额" value={money(summary.contract)}/><Metric label="已确认结算" value={money(summary.settlement)}/><Metric label="已核销" value={money(summary.allocated)}/><Metric label="未结金额" value={money(summary.outstanding)}/><div className="col-span-2 lg:col-span-1"><Metric label="逾期未结" value={money(summary.overdue)} danger/></div></div>
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><select aria-label="结算状态" className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-auto" value={status} onChange={(event) => setQuery({ status: event.target.value })}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input aria-label="搜索" className="h-9 w-full pl-9 sm:w-80" placeholder="合同、主体、对手方或业务单元" value={search} onChange={(event) => setQuery({ search: event.target.value })}/></div></div>
    {loading ? <Card><Empty text={`正在加载${title}…`}/></Card> : !visible.length ? <Card><Empty text={`暂无符合条件的${title}`}/></Card> : <>
      {/* 手机：卡片列表，只展示判断收付进度的关键金额 */}
      <div className="space-y-3 md:hidden">{visible.map((item) => <Link key={item.id} href={contractHref(item)} className="block rounded-lg border bg-card p-4 active:bg-muted">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-mono text-sm font-medium">{item.contractNo}</div><div className="truncate text-xs text-muted-foreground">{item.contractTitle}</div></div><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></div>
        <div className="mt-2 truncate text-sm">{item.counterparty.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">{payable ? '已收票' : '已开票'} {money(invoiceByContract.get(item.contractId)?.allocated || 0)}{invoiceByContract.get(item.contractId)?.unallocated ? ` · 待分摊 ${money(invoiceByContract.get(item.contractId)!.unallocated)}` : ''}</div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">已确认结算</dt><dd className="mt-0.5 font-medium tabular-nums">{money(item.settlementAmount)}</dd></div><div><dt className="text-muted-foreground">{payable ? '累计付款' : '累计收款'}</dt><dd className="mt-0.5 font-medium tabular-nums">{money(item.fundAmount)}</dd></div><div><dt className="text-muted-foreground">未结</dt><dd className="mt-0.5 font-semibold tabular-nums">{money(item.outstandingAmount)}</dd></div></dl>
        {item.overdueAmount > 0 && <div className="mt-2 text-xs text-destructive">逾期 {money(item.overdueAmount)}</div>}
      </Link>)}</div>
      <Card className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1800px] text-sm"><thead className="border-b bg-surface-2 text-left text-muted-foreground"><tr className="[&>th]:whitespace-nowrap [&>th]:p-3"><th className="sticky left-0 z-10 bg-surface-2">合同</th><th>我方签约主体</th><th>交易对手方</th><th>状态</th><th>业务单元</th><th className="text-right">合同金额</th><th className="text-right">结算草稿</th><th className="text-right">已确认结算</th><th className="text-right">{payable ? '已收票' : '已开票'}</th><th className="text-right">结算加减项</th><th className="text-right">{payable ? '累计付款' : '累计收款'}</th><th className="text-right">已核销</th><th className="text-right">未核销资金</th><th className="text-right">{payable ? '预付余额' : '预收余额'}</th><th className="text-right">逾期金额</th><th className="sticky right-0 z-10 border-l bg-surface-2 text-right">未结金额</th></tr></thead><tbody>{visible.map((item) => <ClickableRow key={item.id} href={contractHref(item)} className="group border-b hover:bg-muted"><td className="sticky left-0 z-10 bg-background p-3 group-hover:bg-muted"><Link href={contractHref(item)} className="whitespace-nowrap font-mono hover:text-primary hover:underline">{item.contractNo}</Link><div className="max-w-56 truncate text-xs text-muted-foreground" title={item.contractTitle}>{item.contractTitle}</div></td><td className="p-3"><div className="max-w-48 truncate" title={item.legalEntity.name}>{item.legalEntity.name}</div></td><td className="p-3"><div className="max-w-48 truncate" title={item.counterparty.name}>{item.counterparty.name}</div></td><td className="whitespace-nowrap p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3"><div className="max-w-40 truncate">{item.businessUnit?.name || '—'}</div></td><Money value={item.contractAmount}/><Money value={item.draftAmount}/><Money value={item.settlementAmount}/><InvoiceCell value={invoiceByContract.get(item.contractId)}/><Money value={item.adjustmentAmount} signed/><Money value={item.fundAmount}/><Money value={item.allocatedAmount}/><Money value={item.unappliedFundAmount}/><Money value={item.advanceBalance}/><Money value={item.overdueAmount} danger/><Money value={item.outstandingAmount} strong sticky/></ClickableRow>)}</tbody></table></div></Card>
    </>}
    <div className="flex items-start gap-2 text-xs text-muted-foreground"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>本页为系统自动汇总的只读台账，不允许直接修改金额；单击行查看合同。如需更正，请进入对应{payable ? '采购结算单、付款申请单或付款单' : '销售结算单或收款单'}处理。</span></div>
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <Card className="min-w-0 p-3 sm:p-4"><div className="truncate text-xs text-muted-foreground">{label}</div><div className={`mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl ${danger ? 'text-destructive' : ''}`} title={value}>{value}</div></Card>; }
function Money({ value, signed = false, strong = false, danger = false, sticky = false }: { value: number; signed?: boolean; strong?: boolean; danger?: boolean; sticky?: boolean }) { const text = signed && value !== 0 ? `${value > 0 ? '+' : '-'}${money(Math.abs(value))}` : money(value); return <td className={`whitespace-nowrap p-3 text-right tabular-nums ${sticky ? 'sticky right-0 z-10 border-l bg-background group-hover:bg-muted' : ''} ${strong ? 'font-semibold' : ''} ${danger && value > 0 ? 'text-destructive' : ''}`}>{text}</td>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
function InvoiceCell({ value }: { value?: { allocated: number; unallocated: number } }) {
  return <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(value?.allocated || 0)}{value?.unallocated ? <div className="text-xs text-warning">待分摊 {money(value.unallocated)}</div> : null}</td>;
}
