'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';

interface LedgerRow {
  id: string; contractId: string; contractNo: string; contractTitle: string; contractType: string;
  direction: 'RECEIVABLE' | 'PAYABLE'; legalEntity: { name: string }; counterparty: { name: string };
  businessUnit?: { name: string } | null; contractAmount: number; draftAmount: number; settlementAmount: number;
  adjustmentAmount: number; fundAmount: number; allocatedAmount: number; unappliedFundAmount: number;
  advanceBalance: number; outstandingAmount: number; overdueAmount: number; latestSettlementAt?: string | null; status: string;
}

const STATUS: Record<string, string> = { UNSETTLED: '未结算', PENDING_PAYMENT: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清' };
const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SettlementLedger() {
  const [items, setItems] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get<LedgerRow[]>('/financial-settlements/ledger') || []); }
    catch (error: any) { alert(error.message || '加载结算台账失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => items.filter((item) => {
    if (direction && item.direction !== direction) return false;
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
    <div><h1 className="text-2xl font-bold">结算台账</h1><p className="mt-1 text-sm text-muted-foreground">按合同、结算方向、法律主体和业务单元汇总应收应付、收付款、核销及逾期情况</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="合同口径金额" value={money(summary.contract)}/><Metric label="已确认结算" value={money(summary.settlement)}/><Metric label="已核销" value={money(summary.allocated)}/><Metric label="未结金额" value={money(summary.outstanding)}/><Metric label="逾期未结" value={money(summary.overdue)} danger/></div>
    <div className="flex flex-wrap justify-end gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">全部方向</option><option value="RECEIVABLE">应收</option><option value="PAYABLE">应付</option></select><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="w-80 pl-9" placeholder="合同、主体、对手方或业务单元" value={search} onChange={(event) => setSearch(event.target.value)}/></div></div>
    <Card className="overflow-hidden">{loading ? <Empty text="正在加载结算台账…"/> : !visible.length ? <Empty text="暂无符合条件的结算台账"/> : <div className="overflow-x-auto"><table className="w-full min-w-[1900px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">合同/方向</th><th className="p-3">我方签约主体</th><th className="p-3">交易对手方</th><th className="p-3">状态</th><th className="p-3">业务单元</th><th className="p-3 text-right">合同金额</th><th className="p-3 text-right">结算草稿</th><th className="p-3 text-right">已确认结算</th><th className="p-3 text-right">结算加减项</th><th className="p-3 text-right">累计收付款</th><th className="p-3 text-right">已核销</th><th className="p-3 text-right">未核销资金</th><th className="p-3 text-right">预收预付余额</th><th className="p-3 text-right">未结金额</th><th className="p-3 text-right">逾期金额</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3"><div className="font-mono">{item.contractNo}</div><div className="max-w-60 truncate text-xs text-muted-foreground">{item.contractTitle}</div><div className={`mt-1 text-xs ${item.direction === 'RECEIVABLE' ? 'text-blue-600' : 'text-orange-600'}`}>{item.direction === 'RECEIVABLE' ? '应收' : '应付'}</div></td><td className="p-3">{item.legalEntity.name}</td><td className="p-3">{item.counterparty.name}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3">{item.businessUnit?.name || '—'}</td><Money value={item.contractAmount}/><Money value={item.draftAmount}/><Money value={item.settlementAmount}/><Money value={item.adjustmentAmount} signed/><Money value={item.fundAmount}/><Money value={item.allocatedAmount}/><Money value={item.unappliedFundAmount}/><Money value={item.advanceBalance}/><Money value={item.outstandingAmount} strong/><Money value={item.overdueAmount} danger/></tr>)}</tbody></table></div>}</Card>
    <div className="flex items-start gap-2 text-xs text-muted-foreground"><BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>本页为系统自动汇总的只读台账，不允许直接修改金额；如需更正，请进入对应应收、应付、收款或付款单处理。</span></div>
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-semibold ${danger ? 'text-destructive' : ''}`}>{value}</div></Card>; }
function Money({ value, signed = false, strong = false, danger = false }: { value: number; signed?: boolean; strong?: boolean; danger?: boolean }) { const text = signed && value !== 0 ? `${value > 0 ? '+' : '-'}${money(Math.abs(value))}` : money(value); return <td className={`p-3 text-right ${strong ? 'font-semibold' : ''} ${danger && value > 0 ? 'text-destructive' : ''}`}>{text}</td>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
