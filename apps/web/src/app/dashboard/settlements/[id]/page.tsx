'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Fund { id: string; transactionNo: string; direction: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; occurredAt: string }
interface Allocation { id: string; amount: string; reversedAt?: string | null; reversalReason?: string | null; fundTransaction: Fund; creator: { name: string }; reverser?: { name: string } | null }
interface SettlementLine { id: string; orderId?: string | null; orderNo?: string | null; orderName?: string | null; quantity?: string | null; unit?: string | null; unitPrice?: string | null; adjustmentAmount: string; totalAmount: string; remarks?: string | null; order?: { id: string; status: string } | null }
interface Settlement {
  id: string; settlementNo: string; direction: 'RECEIVABLE' | 'PAYABLE'; settlementScope: string; stageName?: string | null; status: string;
  grossAmount: string; adjustmentAmount: string; totalAmount: string; settledAmount: string; dueDate?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; businessUnit?: { name: string } | null;
  legalEntity: { name: string }; counterparty: { name: string }; creator: { name: string }; confirmer?: { name: string } | null;
  lines: SettlementLine[]; allocations: Allocation[]; operationLogs?: BusinessOperationLog[];
}

const STATUS: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清', VOIDED: '已作废' };
const SCOPE: Record<string, string> = { BATCH: '执行批次结算', CONTRACT_STAGE: '合同阶段结算', CONTRACT_FINAL: '合同最终结算', ADJUSTMENT: '调整结算' };
const ORDER_STATUS: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', DISPATCHED: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const STAGE: Record<string, string> = { ADVANCE: '预收预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', OTHER: '其他款项' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const availableFund = (fund: Fund) => Math.max(0, Number(fund.amount) - Number(fund.allocatedAmount) - Number(fund.refundedAmount));

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Settlement | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocation, setAllocation] = useState({ fundTransactionId: '', amount: '' });

  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await api.get<Settlement>(`/financial-settlements/${id}`);
      setItem(detail);
      const businessType = detail.direction === 'PAYABLE' ? 'PURCHASE' : 'SALES';
      setFunds(await api.get<Fund[]>(`/financial-settlements/funds?businessType=${businessType}&contractId=${detail.contract.id}`) || []);
    } catch (error: any) { alert(error.message || '加载结算单失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);

  const candidates = useMemo(() => funds.filter((fund) => item
    && fund.direction === (item.direction === 'PAYABLE' ? 'PAYMENT' : 'RECEIPT')
    && ['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(fund.status)
    && !['GUARANTEE', 'REFUND', 'GUARANTEE_RETURN'].includes(fund.paymentStage)
    && availableFund(fund) > 0), [funds, item]);

  const doAction = async (action: 'confirm' | 'void') => {
    if (!item) return;
    if (action === 'void' && !confirm(`确定作废结算单 ${item.settlementNo} 吗？`)) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/${item.id}/${action}`); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const openAllocation = () => {
    if (!item) return;
    const first = candidates[0];
    const outstanding = Number(item.totalAmount) - Number(item.settledAmount);
    setAllocation({ fundTransactionId: first?.id || '', amount: first ? String(Math.min(outstanding, availableFund(first))) : '' });
    setAllocationOpen(true);
  };
  const allocate = async () => {
    if (!item || !allocation.fundTransactionId || Number(allocation.amount) <= 0) return alert('请选择资金流水并填写核销金额');
    setBusy(true);
    try { await api.post(`/financial-settlements/${item.id}/allocate`, { fundTransactionId: allocation.fundTransactionId, amount: Number(allocation.amount) }); setAllocationOpen(false); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const reverse = async (entry: Allocation) => {
    const reason = prompt('请输入撤销核销原因');
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/allocations/${entry.id}/reverse`, { reason: reason.trim() }); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">正在加载结算单…</div>;
  if (!item) return <div className="p-12 text-center text-muted-foreground">结算单不存在或无权访问</div>;
  const cashLabel = item.direction === 'PAYABLE' ? '付款' : '收款';
  const dueDateLabel = item.direction === 'PAYABLE' ? '约定付款到期日' : '约定收款到期日';
  const outstanding = Number(item.totalAmount) - Number(item.settledAmount);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="font-mono text-2xl font-bold">{item.settlementNo}</h1><p className="mt-1 text-sm text-muted-foreground">{SCOPE[item.settlementScope]} · {item.contract.contractNo} · {item.contract.title}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText>{['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status) && <Button variant="outline" asChild><Link href={`/dashboard/settlements/${item.id}/print`}><Printer className="mr-1.5 h-4 w-4"/>打印存档</Link></Button>}{item.status === 'DRAFT' && can('settlement.confirm') && <Button disabled={busy} onClick={() => void doAction('confirm')}>确认形成{item.direction === 'PAYABLE' ? '应付' : '应收'}</Button>}{['CONFIRMED', 'PARTIALLY_SETTLED'].includes(item.status) && can('settlement.allocate') && <Button disabled={busy} onClick={openAllocation}>核销{cashLabel}</Button>}{!['VOIDED', 'SETTLED'].includes(item.status) && can('settlement.reverse') && <Button variant="outline" disabled={busy} onClick={() => void doAction('void')}>作废</Button>}</div>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">基本信息</h2><div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="我方签约主体" value={item.legalEntity.name}/><Info label="交易对手方" value={item.counterparty.name}/><Info label="业务单元（事业部）" value={item.businessUnit?.name || '—'}/><Info label={dueDateLabel} value={day(item.dueDate)}/><Info label="结算原金额" value={money(item.grossAmount)}/><Info label="价格/质量等加减项" value={money(item.adjustmentAmount)}/><Info label="结算金额" value={money(item.totalAmount)} emphasis/><Info label="未结金额" value={money(outstanding)} emphasis/><Info label="制单人" value={item.creator.name}/><Info label="确认人" value={item.confirmer?.name || '—'}/></div>{item.remarks && <div className="mt-5 border-t pt-4 text-sm"><span className="text-muted-foreground">备注：</span>{item.remarks}</div>}</Card>

    {item.lines.length > 0 && <Card className="overflow-hidden"><div className="border-b p-4 font-semibold">执行批次明细</div><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">批次</th><th className="p-3">当前状态</th><th className="p-3 text-right">数量</th><th className="p-3 text-right">单价</th><th className="p-3 text-right">加减项</th><th className="p-3">调整原因</th><th className="p-3 text-right">结算金额</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id} className="border-t"><td className="p-3">{line.orderId ? <Link className="font-medium text-primary hover:underline" href={`/dashboard/orders/${line.orderId}`}>{line.orderNo} · {line.orderName}</Link> : `${line.orderNo || '—'} · ${line.orderName || '—'}`}</td><td className="p-3">{line.order ? <StatusText status={line.order.status}>{ORDER_STATUS[line.order.status] || line.order.status}</StatusText> : '—'}</td><td className="p-3 text-right">{line.quantity || '—'} {line.unit || ''}</td><td className="p-3 text-right">{money(line.unitPrice)}</td><td className="p-3 text-right">{money(line.adjustmentAmount)}</td><td className="p-3">{line.remarks || '—'}</td><td className="p-3 text-right font-medium">{money(line.totalAmount)}</td></tr>)}</tbody></table></div></Card>}

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">核销记录</h2>{item.allocations.length ? <div className="space-y-3">{item.allocations.map((entry) => <div key={entry.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 text-sm ${entry.reversedAt ? 'bg-muted/40 text-muted-foreground' : ''}`}><div><div className="font-medium">{entry.fundTransaction.transactionNo} · {STAGE[entry.fundTransaction.paymentStage] || entry.fundTransaction.paymentStage}</div><div className="mt-1 text-xs text-muted-foreground">{day(entry.fundTransaction.occurredAt)} · 经办人 {entry.creator.name}{entry.reversedAt ? ` · 已撤销：${entry.reversalReason || '—'}` : ''}</div></div><div className="flex items-center gap-3"><b>{money(entry.amount)}</b>{can('settlement.reverse') && !entry.reversedAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reverse(entry)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>撤销核销</Button>}</div></div>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无核销记录</div>}</Card>
    <BusinessOperationHistory logs={item.operationLogs}/>

    <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}><DialogContent><DialogHeader><DialogTitle>核销{cashLabel}</DialogTitle><DialogDescription>仅显示当前合同、法律主体和交易对手一致的可用资金流水。</DialogDescription></DialogHeader><Field label={`${cashLabel}流水`}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={allocation.fundTransactionId} onChange={(event) => { const fund = candidates.find((candidate) => candidate.id === event.target.value); setAllocation({ fundTransactionId: event.target.value, amount: fund ? String(Math.min(outstanding, availableFund(fund))) : '' }); }}><option value="">请选择</option>{candidates.map((fund) => <option key={fund.id} value={fund.id}>{fund.transactionNo} · 可用 {money(availableFund(fund))}</option>)}</select></Field>{!candidates.length && <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">当前没有可核销的资金流水</div>}<Field label="本次核销金额"><Input type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => setAllocation((old) => ({ ...old, amount: event.target.value }))}/></Field><DialogFooter><Button variant="outline" onClick={() => setAllocationOpen(false)}>取消</Button><Button disabled={busy || !candidates.length} onClick={() => void allocate()}>确认核销</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
