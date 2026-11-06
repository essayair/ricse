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
  const [query, setQuery] = useListQuery({ search: '', status: '' });
  const { search, status } = query;
  const payable = direction === 'PAYABLE';
  const title = payable ? '应付台账' : '应收台账';
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get<LedgerRow[]>('/financial-settlements/ledger') || []); }
    catch (error: any) { alert(error.message || '加载结算台账失败'); }
    finally { setLoading(false); }
  }, []);
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

  return <div className="space-y-5">
    {showTitle && <div><h1 className="text-2xl font-bold">{title}</h1></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="合同口径金额" value={money(summary.contract)}/><Metric label="已确认结算" value={money(summary.settlement)}/><Metric label="已核销" value={money(summary.allocated)}/><Metric label="未结金额" value={money(summary.outstanding)}/><Metric label="逾期未结" value={money(summary.overdue)} danger/></div>
    <div className="flex flex-wrap justify-end gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setQuery({ status: event.target.value })}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="w-80 pl-9" placeholder="合同、主体、对手方或业务单元" value={search} onChange={(event) => setQuery({ search: event.target.value })}/></div></div>
    <Card className="overflow-hidden">{loading ? <Empty text={`正在加载${title}…`}/> : !visible.length ? <Empty text={`暂无符合条件的${title}`}/> : <div className="overflow-x-auto"><table className="w-full min-w-[1900px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">合同</th><th className="p-3">我方签约主体</th><th className="p-3">交易对手方</th><th className="p-3">状态</th><th className="p-3">业务单元</th><th className="p-3 text-right">合同金额</th><th className="p-3 text-right">结算草稿</th><th className="p-3 text-right">已确认结算</th><th className="p-3 text-right">结算加减项</th><th className="p-3 text-right">{payable ? '累计付款' : '累计收款'}</th><th className="p-3 text-right">已核销</th><th className="p-3 text-right">未核销资金</th><th className="p-3 text-right">{payable ? '预付余额' : '预收余额'}</th><th className="p-3 text-right">未结金额</th><th className="p-3 text-right">逾期金额</th></tr></thead><tbody>{visible.map((item) => <ClickableRow key={item.id} href={`/dashboard/contracts/${item.contractId}`} className="border-b hover:bg-muted/20"><td className="p-3"><Link href={`/dashboard/contracts/${item.contractId}`} className="font-mono hover:text-primary hover:underline">{item.contractNo}</Link><div className="max-w-60 truncate text-xs text-muted-foreground">{item.contractTitle}</div></td><td className="p-3">{item.legalEntity.name}</td><td className="p-3">{item.counterparty.name}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3">{item.businessUnit?.name || '—'}</td><Money value={item.contractAmount}/><Money value={item.draftAmount}/><Money value={item.settlementAmount}/><Money value={item.adjustmentAmount} signed/><Money value={item.fundAmount}/><Money value={item.allocatedAmount}/><Money value={item.unappliedFundAmount}/><Money value={item.advanceBalance}/><Money value={item.outstandingAmount} strong/><Money value={item.overdueAmount} danger/></ClickableRow>)}</tbody></table></div>}</Card>
    <div className="flex items-start gap-2 text-xs text-muted-foreground"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>本页为系统自动汇总的只读台账，不允许直接修改金额；单击行查看合同。如需更正，请进入对应{payable ? '采购结算单、付款申请单或付款单' : '销售结算单或收款单'}处理。</span></div>
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div></Card>; }
function Money({ value, signed = false, strong = false, danger = false }: { value: number; signed?: boolean; strong?: boolean; danger?: boolean }) { const text = signed && value !== 0 ? `${value > 0 ? '+' : '-'}${money(Math.abs(value))}` : money(value); return <td className={`p-3 text-right ${strong ? 'font-semibold' : ''} ${danger && value > 0 ? 'text-destructive' : ''}`}>{text}</td>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
