'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, CircleDollarSign, Plus, Printer, RotateCcw, Search, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Direction = 'RECEIVABLE' | 'PAYABLE';
type BusinessType = 'PURCHASE' | 'SALES';

interface ContractOption {
  id: string; contractNo: string; title: string; type: string; amount: number; quantity: number; unit?: string;
  settledTotal: number; remainingSettleable: number; advanceBalance: number;
  signingPartner: { id: string; name: string }; counterparty: { id: string; name: string };
  businessUnit: { id: string; code: string; name: string };
}

interface OrderOption {
  id: string; orderNo: string; name: string; status: string; quantity: number; settledQuantity: number;
  remainingQuantity: number; unit?: string; amount: number; settledAmount: number; remainingAmount: number;
}

interface SettlementLine {
  id: string; orderId?: string | null; orderNo?: string | null; orderName?: string | null;
  quantity?: string | null; unit?: string | null; unitPrice?: string | null; grossAmount: string;
  adjustmentAmount: string; totalAmount: string; remarks?: string | null;
}

interface Allocation {
  id: string; amount: string; createdAt: string; reversedAt?: string | null; reversalReason?: string | null;
  fundTransaction: { id: string; transactionNo: string; category: string; paymentStage: string; paymentMethod: string; amount: string; occurredAt: string; bankReference?: string | null };
  creator: { name: string }; reverser?: { name: string } | null;
}

interface Settlement {
  id: string; settlementNo: string; direction: Direction; sourceType: string; sourceNo?: string | null; settlementScope: string;
  stageName?: string | null; stageRatio?: string | null; status: string; quantity?: string | null; unit?: string | null;
  grossAmount: string; adjustmentAmount: string; totalAmount: string; settledAmount: string; dueDate?: string | null;
  remarks?: string | null; createdAt: string; confirmedAt?: string | null;
  contract: { id: string; contractNo: string; title: string; type: string };
  businessUnit?: { code: string; name: string } | null; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; confirmer?: { name: string } | null; lines: SettlementLine[]; allocations: Allocation[];
}

interface Fund {
  id: string; transactionNo: string; direction: 'RECEIPT' | 'PAYMENT'; category: string; businessType: BusinessType;
  paymentStage: string; paymentMethod: string; status: string; amount: string; allocatedAmount: string; refundedAmount: string;
  occurredAt: string; bankReference?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null;
  instrumentNo?: string | null; instrumentDueDate?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; relatedTransaction?: { id: string; transactionNo: string; paymentStage: string; amount: string } | null;
}

interface BatchLineForm { orderId: string; quantity: string; unitPrice: string; adjustmentAmount: string; remarks: string }

const STATUS: Record<string, string> = {
  DRAFT: '草稿', CONFIRMED: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清', VOIDED: '已作废',
  PARTIALLY_ALLOCATED: '部分核销', ALLOCATED: '已核销',
};
const ORDER_STATUS: Record<string, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', DISPATCHED: '执行中', COMPLETED: '已完成', CANCELLED: '已取消',
};
const SCOPE: Record<string, string> = { BATCH: '执行批次结算', CONTRACT_STAGE: '合同阶段结算', CONTRACT_FINAL: '合同最终结算', ADJUSTMENT: '调整结算' };
const STAGE: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '退款', GUARANTEE_RETURN: '保证金退回', OTHER: '其他款项' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const today = () => new Date().toLocaleDateString('sv-SE');
const fieldClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function SettlementWorkbench({ direction, standalone = false }: { direction: Direction; standalone?: boolean }) {
  const receivable = direction === 'RECEIVABLE';
  const businessType: BusinessType = receivable ? 'SALES' : 'PURCHASE';
  const title = receivable ? '应收管理' : '应付管理';
  const cashLabel = receivable ? '收款' : '付款';
  const dueDateLabel = receivable ? '约定收款到期日' : '约定付款到期日';
  const accent = receivable ? 'text-blue-600' : 'text-orange-600';
  const AccentIcon = receivable ? ArrowDownLeft : ArrowUpRight;

  const [items, setItems] = useState<Settlement[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [summary, setSummary] = useState({ total: 0, settled: 0, outstanding: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'SETTLEMENT' | 'FUND' | 'CONTRACT'>('SETTLEMENT');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<Settlement | null>(null);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ contractId: '', settlementScope: 'BATCH', stageName: '', stageRatio: '', grossAmount: '', adjustmentAmount: '0', dueDate: '', remarks: '' });
  const [batchLines, setBatchLines] = useState<BatchLineForm[]>([]);
  const [fundForm, setFundForm] = useState({ contractId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', occurredAt: today(), relatedTransactionId: '', bankReference: '', ourBankAccount: '', counterpartyBankAccount: '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
  const [allocation, setAllocation] = useState({ fundTransactionId: '', amount: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ direction });
      if (status) query.set('status', status);
      if (search.trim()) query.set('search', search.trim());
      const [settlementResult, fundResult, contractResult] = await Promise.all([
        api.get<{ items: Settlement[]; summary: typeof summary }>(`/financial-settlements?${query}`),
        api.get<Fund[]>(`/financial-settlements/funds?businessType=${businessType}`),
        api.get<ContractOption[]>(`/financial-settlements/options/contracts?direction=${direction}`),
      ]);
      setItems(settlementResult.items || []); setSummary(settlementResult.summary || { total: 0, settled: 0, outstanding: 0, overdue: 0 });
      setFunds(fundResult || []); setContracts(contractResult || []);
    } catch (error: any) { alert(error.message || '加载结算数据失败'); }
    finally { setLoading(false); }
  }, [businessType, direction, search, status]);

  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);
  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');
  useEffect(() => { void load(); }, [load]);

  const selectedContract = contracts.find((item) => item.id === form.contractId);
  const selectedFundContract = contracts.find((item) => item.id === fundForm.contractId);
  const batchTotal = useMemo(() => batchLines.reduce((sum, line) => {
    const order = orders.find((item) => item.id === line.orderId);
    const defaultPrice = order && order.remainingQuantity ? order.remainingAmount / order.remainingQuantity : 0;
    return sum + Number(line.quantity || 0) * Number(line.unitPrice || defaultPrice) + Number(line.adjustmentAmount || 0);
  }, 0), [batchLines, orders]);

  const changeContract = async (contractId: string) => {
    setForm((old) => ({ ...old, contractId, grossAmount: '', stageRatio: '' })); setBatchLines([]); setOrders([]);
    if (!contractId) return;
    try { setOrders(await api.get<OrderOption[]>(`/financial-settlements/options/orders?contractId=${contractId}&direction=${direction}`) || []); }
    catch (error: any) { alert(error.message || '加载执行批次失败'); }
  };

  const toggleOrder = (order: OrderOption, checked: boolean) => {
    if (!checked) return setBatchLines((old) => old.filter((line) => line.orderId !== order.id));
    const price = order.remainingQuantity ? order.remainingAmount / order.remainingQuantity : 0;
    setBatchLines((old) => [...old, { orderId: order.id, quantity: String(order.remainingQuantity), unitPrice: price.toFixed(4), adjustmentAmount: '0', remarks: '' }]);
  };

  const updateBatch = (orderId: string, key: keyof BatchLineForm, value: string) => setBatchLines((old) => old.map((line) => line.orderId === orderId ? { ...line, [key]: value } : line));

  const openSettlement = () => {
    setForm({ contractId: '', settlementScope: 'BATCH', stageName: '', stageRatio: '', grossAmount: '', adjustmentAmount: '0', dueDate: '', remarks: '' });
    setBatchLines([]); setOrders([]); setSettlementOpen(true);
  };
  const openFund = () => {
    setFundForm({ contractId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', occurredAt: today(), relatedTransactionId: '', bankReference: '', ourBankAccount: '', counterpartyBankAccount: '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
    setFundOpen(true);
  };

  const submitSettlement = async () => {
    if (!form.contractId) return alert('请选择合同');
    if (form.settlementScope === 'BATCH' && !batchLines.length) return alert('请至少选择一个可结算执行批次');
    if (form.settlementScope === 'CONTRACT_STAGE' && !form.stageName.trim()) return alert('请填写结算阶段名称');
    if (['CONTRACT_STAGE', 'ADJUSTMENT'].includes(form.settlementScope) && !Number(form.grossAmount) && !Number(form.stageRatio)) return alert('请填写结算金额或比例');
    const missingBatchReason = form.settlementScope === 'BATCH'
      && batchLines.some((line) => Number(line.adjustmentAmount || 0) !== 0 && !line.remarks.trim());
    if (missingBatchReason) return alert('存在结算加减项的执行批次必须填写调整原因');
    if (form.settlementScope !== 'BATCH' && Number(form.adjustmentAmount || 0) !== 0 && !form.remarks.trim()) {
      return alert('存在结算加减项时必须填写调整原因');
    }
    setBusy(true);
    try {
      await api.post('/financial-settlements', {
        contractId: form.contractId, direction, settlementScope: form.settlementScope,
        stageName: form.stageName || undefined, stageRatio: form.stageRatio ? Number(form.stageRatio) : undefined,
        grossAmount: form.grossAmount ? Number(form.grossAmount) : undefined,
        adjustmentAmount: Number(form.adjustmentAmount || 0),
        lines: form.settlementScope === 'BATCH' ? batchLines.map((line) => ({ orderId: line.orderId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), adjustmentAmount: Number(line.adjustmentAmount || 0), remarks: line.remarks || undefined })) : undefined,
        dueDate: form.dueDate ? `${form.dueDate}T00:00:00+08:00` : undefined, remarks: form.remarks || undefined,
      });
      setSettlementOpen(false); await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const submitFund = async () => {
    if (!fundForm.contractId || !Number(fundForm.amount) || !fundForm.occurredAt) return alert(`请选择合同并填写${cashLabel}信息`);
    if (['REFUND', 'GUARANTEE_RETURN'].includes(fundForm.paymentStage) && !fundForm.relatedTransactionId) return alert('请选择原资金流水');
    setBusy(true);
    try {
      await api.post('/financial-settlements/funds', {
        contractId: fundForm.contractId, businessType, paymentStage: fundForm.paymentStage, paymentMethod: fundForm.paymentMethod,
        amount: Number(fundForm.amount), occurredAt: `${fundForm.occurredAt}T12:00:00+08:00`, relatedTransactionId: fundForm.relatedTransactionId || undefined,
        bankReference: fundForm.bankReference || undefined, ourBankAccount: fundForm.ourBankAccount || undefined,
        counterpartyBankAccount: fundForm.counterpartyBankAccount || undefined, instrumentNo: fundForm.instrumentNo || undefined,
        instrumentDueDate: fundForm.instrumentDueDate ? `${fundForm.instrumentDueDate}T00:00:00+08:00` : undefined, remarks: fundForm.remarks || undefined,
      });
      setFundOpen(false); await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const settlementAction = async (item: Settlement, name: 'confirm' | 'void') => {
    if (name === 'void' && !confirm(`确定作废结算单 ${item.settlementNo} 吗？`)) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/${item.id}/${name}`); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const voidFund = async (fund: Fund) => {
    if (!confirm(`确定作废资金流水 ${fund.transactionNo} 吗？`)) return;
    try { await api.post(`/financial-settlements/funds/${fund.id}/void`); await load(); } catch (error: any) { alert(error.message); }
  };

  const openAllocation = (item: Settlement) => {
    const candidates = usableFunds(item);
    const first = candidates[0]; const remaining = Number(item.totalAmount) - Number(item.settledAmount);
    setSelected(item); setAllocation({ fundTransactionId: first?.id || '', amount: first ? String(Math.min(remaining, availableFund(first))) : '' }); setAllocationOpen(true);
  };

  const submitAllocation = async () => {
    if (!selected || !allocation.fundTransactionId || !Number(allocation.amount)) return alert(`请选择可用${cashLabel}流水并填写核销金额`);
    setBusy(true);
    try { await api.post(`/financial-settlements/${selected.id}/allocate`, { fundTransactionId: allocation.fundTransactionId, amount: Number(allocation.amount) }); setAllocationOpen(false); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const reverseAllocation = async (entry: Allocation) => {
    const reason = prompt('请输入撤销核销原因'); if (!reason?.trim()) return;
    try { await api.post(`/financial-settlements/allocations/${entry.id}/reverse`, { reason: reason.trim() }); const id = selected?.id; await load(); if (id) setSelected(await api.get<Settlement>(`/financial-settlements/${id}`)); }
    catch (error: any) { alert(error.message); }
  };

  const candidateFunds = useMemo(() => selected ? funds.filter((fund) => (
    fund.contract.id === selected.contract.id
      && fund.status !== 'VOIDED'
      && ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'OTHER'].includes(fund.paymentStage)
      && availableFund(fund) > 0
  )) : [], [funds, selected]);
  const reverseCandidates = funds.filter((item) => item.contract.id === fundForm.contractId && item.status !== 'VOIDED' && item.direction === (receivable ? 'RECEIPT' : 'PAYMENT') && (fundForm.paymentStage === 'GUARANTEE_RETURN' ? item.paymentStage === 'GUARANTEE' : item.paymentStage !== 'GUARANTEE') && availableFund(item) > 0);

  function availableFund(fund: Fund) { return Math.max(0, Number(fund.amount) - Number(fund.allocatedAmount) - Number(fund.refundedAmount)); }
  function usableFunds(item: Settlement) { return funds.filter((fund) => fund.contract.id === item.contract.id && fund.status !== 'VOIDED' && ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'OTHER'].includes(fund.paymentStage) && availableFund(fund) > 0); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{standalone ? (receivable ? '确认销售业务应收、跟踪核销与逾期状态' : '确认采购业务应付、跟踪核销与逾期状态') : (receivable ? '销售结算、客户回款、预收款、退款与核销' : '采购结算、供应商付款、预付款、退款与核销')}</p></div>
      {can('settlement.create') && <div className="flex gap-2">{!standalone && <Button variant="outline" onClick={openFund}><WalletCards className="mr-1 h-4 w-4" />登记资金流水</Button>}<Button onClick={openSettlement}><Plus className="mr-1 h-4 w-4" />新建{title.slice(0, 2)}结算</Button></div>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={`${title.slice(0, 2)}总额`} value={money(summary.total)} icon={<CircleDollarSign className={accent} />} />
      <Metric label={`已${cashLabel}核销`} value={money(summary.settled)} icon={<CheckCircle2 className="text-emerald-600" />} />
      <Metric label={`未${cashLabel}金额`} value={money(summary.outstanding)} icon={<AccentIcon className={accent} />} />
      <Metric label="逾期未结" value={money(summary.overdue)} icon={<CircleDollarSign className="text-red-600" />} />
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      {!standalone && <div className="flex rounded-md border bg-muted/30 p-1">
        {([['SETTLEMENT', `${title}结算`], ['FUND', '资金流水'], ['CONTRACT', '合同结算台账']] as const).map(([key, label]) => <button key={key} className={`rounded px-4 py-1.5 text-sm ${tab === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>}
      {(standalone || tab === 'SETTLEMENT') && <div className="flex gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{['DRAFT', 'CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED', 'VOIDED'].map((value) => <option value={value} key={value}>{STATUS[value]}</option>)}</select><div className="flex"><Input className="w-64 rounded-r-none" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load()} placeholder="结算单号、合同或对手方"/><Button variant="outline" className="rounded-l-none px-3" onClick={() => void load()}><Search className="h-4 w-4" /></Button></div></div>}
    </div>

    <Card className="overflow-hidden">
      {loading ? <Empty text="正在加载结算数据…" /> : standalone || tab === 'SETTLEMENT' ? <SettlementTable items={items} dueDateLabel={dueDateLabel} /> : tab === 'FUND' ? <FundTable items={funds} cashLabel={cashLabel} canManage={can('settlement.reverse')} onVoid={voidFund} /> : <ContractLedger contracts={contracts} />}
    </Card>

    <Dialog open={!!selected && !allocationOpen} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">{selected && <>
      <DialogHeader><DialogTitle>{selected.settlementNo}</DialogTitle><DialogDescription>{SCOPE[selected.settlementScope]} · {selected.contract.contractNo} · {selected.contract.title}</DialogDescription></DialogHeader>
      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3"><Info label="我方签约主体" value={selected.legalEntity.name}/><Info label="交易对手方" value={selected.counterparty.name}/><Info label="业务单元" value={selected.businessUnit?.name || '—'}/><Info label="结算原金额" value={money(selected.grossAmount)}/><Info label="结算加减项" value={signedMoney(selected.adjustmentAmount)}/><Info label="结算金额" value={money(selected.totalAmount)}/><Info label="已核销" value={money(selected.settledAmount)}/><Info label="未结金额" value={money(Number(selected.totalAmount) - Number(selected.settledAmount))}/><Info label={dueDateLabel} value={day(selected.dueDate)}/></div>
      {!!selected.lines.length && <section><h3 className="mb-2 text-sm font-medium">执行批次明细</h3><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/40"><tr><th className="p-2 text-left">批次</th><th className="p-2 text-right">数量</th><th className="p-2 text-right">单价</th><th className="p-2 text-right">结算加减项</th><th className="p-2 text-left">调整原因</th><th className="p-2 text-right">结算金额</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id} className="border-t"><td className="p-2">{line.orderNo} · {line.orderName}</td><td className="p-2 text-right">{line.quantity} {line.unit || ''}</td><td className="p-2 text-right">{money(line.unitPrice)}</td><td className="p-2 text-right">{signedMoney(line.adjustmentAmount)}</td><td className="p-2">{line.remarks || '—'}</td><td className="p-2 text-right font-medium">{money(line.totalAmount)}</td></tr>)}</tbody></table></div></section>}
      <section><h3 className="mb-2 text-sm font-medium">核销记录</h3>{selected.allocations.length ? <div className="space-y-2">{selected.allocations.map((entry) => <div key={entry.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${entry.reversedAt ? 'bg-muted/40 text-muted-foreground line-through' : ''}`}><span>{entry.fundTransaction.transactionNo} · {STAGE[entry.fundTransaction.paymentStage]}</span><b>{money(entry.amount)}</b>{can('settlement.reverse') && !entry.reversedAt && <Button size="sm" variant="ghost" className="no-underline" onClick={() => void reverseAllocation(entry)}><RotateCcw className="mr-1 h-3.5 w-3.5" />撤销核销</Button>}<span className="w-full text-xs">{day(entry.fundTransaction.occurredAt)} · {entry.creator.name}{entry.reversedAt ? ` · 已由 ${entry.reverser?.name || '管理员'} 撤销：${entry.reversalReason}` : ''}</span></div>)}</div> : <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">暂无核销记录</div>}</section>
      {selected.remarks && <div className="text-sm"><span className="text-muted-foreground">备注：</span>{selected.remarks}</div>}
      <DialogFooter>{['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(selected.status) && <Button variant="outline" asChild><Link href={`/dashboard/settlements/${selected.id}/print`}><Printer className="mr-1.5 h-4 w-4" />打印存档</Link></Button>}{selected.status === 'DRAFT' && can('settlement.confirm') && <Button disabled={busy} onClick={() => void settlementAction(selected, 'confirm')}>确认形成{title.slice(0, 2)}</Button>}{['CONFIRMED', 'PARTIALLY_SETTLED'].includes(selected.status) && can('settlement.allocate') && <Button disabled={busy} onClick={() => openAllocation(selected)}>核销{cashLabel}</Button>}{!['VOIDED', 'SETTLED'].includes(selected.status) && can('settlement.reverse') && <Button variant="outline" disabled={busy} onClick={() => void settlementAction(selected, 'void')}>作废</Button>}</DialogFooter>
    </>}</DialogContent></Dialog>

    <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>新建{title.slice(0, 2)}结算单</DialogTitle><DialogDescription>可按一个或多个有效执行批次结算，也可进行合同阶段、最终或调整结算。</DialogDescription></DialogHeader><div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="关联合同 *"><select className={fieldClass} value={form.contractId} onChange={(event) => void changeContract(event.target.value)}><option value="">请选择合同</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.contractNo} · {item.title}</option>)}</select></Field><Field label="结算口径 *"><select className={fieldClass} value={form.settlementScope} onChange={(event) => setForm((old) => ({ ...old, settlementScope: event.target.value, grossAmount: '', stageRatio: '' }))}>{Object.entries(SCOPE).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>
      {selectedContract && <div className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"><Info label="合同金额" value={money(selectedContract.amount)}/><Info label="累计结算" value={money(selectedContract.settledTotal)}/><Info label="剩余可结算" value={money(selectedContract.remainingSettleable)}/><Info label="我方签约主体" value={selectedContract.signingPartner.name}/><Info label="交易对手方" value={selectedContract.counterparty.name}/><Info label="可用预收预付参考" value={money(selectedContract.advanceBalance)}/></div>}
      {form.settlementScope === 'BATCH' && <div><div className="mb-2 flex items-start justify-between gap-4"><div><h3 className="text-sm font-medium">选择执行批次 *</h3><p className="mt-1 text-xs text-muted-foreground">批次无需完成即可建立结算草稿；已取消批次不可选。请依据实际履约凭证确认本次数量和金额。</p><p className="mt-1 text-xs text-muted-foreground">结算加减项填写正数会增加结算金额，填写负数会扣减结算金额。</p></div><span className="shrink-0 text-sm font-medium">预计结算 {money(batchTotal)}</span></div>{orders.length ? <div className="space-y-2">{orders.map((order) => { const line = batchLines.find((item) => item.orderId === order.id); const adjusted = Number(line?.adjustmentAmount || 0) !== 0; return <div key={order.id} className="rounded-md border p-3"><label className="flex cursor-pointer items-start gap-3"><input className="mt-1" type="checkbox" checked={!!line} onChange={(event) => toggleOrder(order, event.target.checked)}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium">{order.orderNo} · {order.name}</span><StatusText status={order.status}>{ORDER_STATUS[order.status] || order.status}</StatusText></div><div className="mt-1 text-xs text-muted-foreground">批次数量 {order.quantity} {order.unit || ''}；剩余可结算 {order.remainingQuantity} {order.unit || ''} / {money(order.remainingAmount)}；已结算 {money(order.settledAmount)}</div></div></label>{line && <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-4"><Field label="本次数量"><Input type="number" min="0.001" max={order.remainingQuantity} step="0.001" value={line.quantity} onChange={(event) => updateBatch(order.id, 'quantity', event.target.value)}/></Field><Field label="结算单价"><Input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => updateBatch(order.id, 'unitPrice', event.target.value)}/></Field><Field label="结算加减项金额"><Input type="number" step="0.01" placeholder="正数增加，负数扣减" value={line.adjustmentAmount} onChange={(event) => updateBatch(order.id, 'adjustmentAmount', event.target.value)}/></Field><Field label={adjusted ? '调整原因 *' : '明细备注'}><Input placeholder={adjusted ? '请填写价格、质量等调整依据' : ''} value={line.remarks} onChange={(event) => updateBatch(order.id, 'remarks', event.target.value)}/></Field></div>}</div>; })}</div> : <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">该合同暂无可结算执行批次。可改用合同阶段结算。</div>}</div>}
      {form.settlementScope === 'CONTRACT_STAGE' && <div className="grid gap-4 sm:grid-cols-3"><Field label="阶段名称 *"><Input placeholder="如：发货阶段、到货阶段" value={form.stageName} onChange={(event) => setForm((old) => ({ ...old, stageName: event.target.value }))}/></Field><Field label="阶段比例（%）"><Input type="number" min="0.01" max="100" step="0.01" value={form.stageRatio} onChange={(event) => setForm((old) => ({ ...old, stageRatio: event.target.value, grossAmount: event.target.value && selectedContract ? String((selectedContract.amount * Number(event.target.value) / 100).toFixed(2)) : old.grossAmount }))}/></Field><Field label="本次原金额 *"><Input type="number" min="0.01" step="0.01" value={form.grossAmount} onChange={(event) => setForm((old) => ({ ...old, grossAmount: event.target.value, stageRatio: '' }))}/></Field></div>}
      {form.settlementScope === 'CONTRACT_FINAL' && <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">最终结算金额由系统按“合同金额－累计有效结算金额”自动计算，避免重复或超额结算。</div>}
      {form.settlementScope === 'ADJUSTMENT' && <Field label="调整结算金额 *"><Input type="number" min="0.01" step="0.01" value={form.grossAmount} onChange={(event) => setForm((old) => ({ ...old, grossAmount: event.target.value }))}/></Field>}
      {form.settlementScope !== 'BATCH' && <Field label="结算加减项金额"><Input type="number" step="0.01" placeholder="正数增加结算金额，负数扣减结算金额" value={form.adjustmentAmount} onChange={(event) => setForm((old) => ({ ...old, adjustmentAmount: event.target.value }))}/><p className="text-xs text-muted-foreground">适用于质量扣款、升贴水、价格补差或商务折扣；填写非零金额时必须说明原因。</p></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label={dueDateLabel}><Input type="date" value={form.dueDate} onChange={(event) => setForm((old) => ({ ...old, dueDate: event.target.value }))}/><p className="text-xs text-muted-foreground">超过该日期仍未完成{cashLabel}核销，将从次日起计入逾期未结。</p></Field><Field label={form.settlementScope === 'ADJUSTMENT' || (form.settlementScope !== 'BATCH' && Number(form.adjustmentAmount || 0) !== 0) ? '调整原因 *' : '备注'}><Input placeholder={form.settlementScope !== 'BATCH' && Number(form.adjustmentAmount || 0) !== 0 ? '请填写价格、质量等调整依据' : ''} value={form.remarks} onChange={(event) => setForm((old) => ({ ...old, remarks: event.target.value }))}/></Field></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setSettlementOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void submitSettlement()}>保存草稿</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={fundOpen} onOpenChange={setFundOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>登记{receivable ? '销售' : '采购'}资金流水</DialogTitle><DialogDescription>资金收付方向由采购/销售业务和款项类型自动判断，退款及保证金退回必须关联原流水。</DialogDescription></DialogHeader><div className="space-y-4">
      <Field label="关联合同 *"><select className={fieldClass} value={fundForm.contractId} onChange={(event) => setFundForm((old) => ({ ...old, contractId: event.target.value, relatedTransactionId: '' }))}><option value="">请选择合同</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.contractNo} · {item.title}</option>)}</select></Field>
      {selectedFundContract && <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2"><Info label="我方签约主体" value={selectedFundContract.signingPartner.name}/><Info label="交易对手方" value={selectedFundContract.counterparty.name}/></div>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="款项类型 *"><select className={fieldClass} value={fundForm.paymentStage} onChange={(event) => setFundForm((old) => ({ ...old, paymentStage: event.target.value, relatedTransactionId: '' }))}>{fundStageOptions(receivable).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="支付方式 *"><select className={fieldClass} value={fundForm.paymentMethod} onChange={(event) => setFundForm((old) => ({ ...old, paymentMethod: event.target.value }))}>{Object.entries(METHOD).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>
      {['REFUND', 'GUARANTEE_RETURN'].includes(fundForm.paymentStage) && <Field label="原资金流水 *"><select className={fieldClass} value={fundForm.relatedTransactionId} onChange={(event) => setFundForm((old) => ({ ...old, relatedTransactionId: event.target.value }))}><option value="">请选择原流水</option>{reverseCandidates.map((item) => <option value={item.id} key={item.id}>{item.transactionNo} · {STAGE[item.paymentStage]} · 可退 {money(availableFund(item))}</option>)}</select></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="发生金额 *"><Input type="number" min="0.01" step="0.01" value={fundForm.amount} onChange={(event) => setFundForm((old) => ({ ...old, amount: event.target.value }))}/></Field><Field label="发生日期 *"><Input type="date" value={fundForm.occurredAt} onChange={(event) => setFundForm((old) => ({ ...old, occurredAt: event.target.value }))}/></Field><Field label="我方银行账户"><Input value={fundForm.ourBankAccount} onChange={(event) => setFundForm((old) => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="对方银行账户"><Input value={fundForm.counterpartyBankAccount} onChange={(event) => setFundForm((old) => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="银行流水号"><Input value={fundForm.bankReference} onChange={(event) => setFundForm((old) => ({ ...old, bankReference: event.target.value }))}/></Field><Field label="票据/信用证编号"><Input value={fundForm.instrumentNo} onChange={(event) => setFundForm((old) => ({ ...old, instrumentNo: event.target.value }))}/></Field>{['BANK_ACCEPTANCE', 'COMMERCIAL_ACCEPTANCE', 'LETTER_OF_CREDIT'].includes(fundForm.paymentMethod) && <Field label="票据到期日"><Input type="date" value={fundForm.instrumentDueDate} onChange={(event) => setFundForm((old) => ({ ...old, instrumentDueDate: event.target.value }))}/></Field>}</div>
      <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={fundForm.remarks} onChange={(event) => setFundForm((old) => ({ ...old, remarks: event.target.value }))}/></Field>
    </div><DialogFooter><Button variant="outline" onClick={() => setFundOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void submitFund()}>确认登记</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}><DialogContent><DialogHeader><DialogTitle>核销{cashLabel}</DialogTitle><DialogDescription>仅显示同一合同、法律主体和交易对手下可核销的资金流水；保证金和退款不会出现。</DialogDescription></DialogHeader><Field label={`${cashLabel}流水`}><select className={fieldClass} value={allocation.fundTransactionId} onChange={(event) => { const fund = candidateFunds.find((item) => item.id === event.target.value); const remaining = selected ? Number(selected.totalAmount) - Number(selected.settledAmount) : 0; setAllocation({ fundTransactionId: event.target.value, amount: fund ? String(Math.min(remaining, availableFund(fund))) : '' }); }}><option value="">请选择</option>{candidateFunds.map((fund) => <option value={fund.id} key={fund.id}>{fund.transactionNo} · 可用 {money(availableFund(fund))} · {STAGE[fund.paymentStage]}</option>)}</select></Field>{!candidateFunds.length && <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">当前合同没有可用资金流水，请先登记。</div>}<Field label="本次核销金额"><Input type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => setAllocation((old) => ({ ...old, amount: event.target.value }))}/></Field><DialogFooter><Button variant="outline" onClick={() => setAllocationOpen(false)}>取消</Button><Button disabled={busy || !candidateFunds.length} onClick={() => void submitAllocation()}>确认核销</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function fundStageOptions(receivable: boolean): Array<[string, string]> {
  return receivable ? [['ADVANCE', '收到预收款'], ['PROGRESS', '收到阶段款'], ['SETTLEMENT', '收到结算款'], ['FINAL', '收到尾款'], ['GUARANTEE', '收取保证金'], ['REFUND', '退还客户款项'], ['GUARANTEE_RETURN', '退还客户保证金'], ['OTHER', '其他销售收款']] : [['ADVANCE', '支付预付款'], ['PROGRESS', '支付阶段款'], ['SETTLEMENT', '支付结算款'], ['FINAL', '支付尾款'], ['GUARANTEE', '支付保证金'], ['REFUND', '收到供应商退款'], ['GUARANTEE_RETURN', '收回保证金'], ['OTHER', '其他采购付款']];
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card className="flex items-center justify-between p-4"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div><div className="rounded-full bg-muted p-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</div></Card>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function signedMoney(value: string | number | null | undefined) { const amount = Number(value || 0); return amount === 0 ? money(0) : `${amount > 0 ? '+' : '-'}${money(Math.abs(amount))}`; }

function SettlementTable({ items, dueDateLabel }: { items: Settlement[]; dueDateLabel: string }) {
  if (!items.length) return <Empty text="暂无结算记录。可从已生效合同创建第一张结算单。"/>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">结算单号</th><th className="p-3">结算口径</th><th className="p-3">合同/来源</th><th className="p-3">状态</th><th className="p-3">交易对手方</th><th className="p-3">业务单元</th><th className="p-3 text-right">结算金额</th><th className="p-3 text-right">已核销</th><th className="p-3">{dueDateLabel}</th><th className="p-3">操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3 font-mono">{item.settlementNo}</td><td className="p-3">{SCOPE[item.settlementScope] || item.settlementScope}{item.stageName ? <div className="text-xs text-muted-foreground">{item.stageName}</div> : null}</td><td className="p-3"><div>{item.contract.contractNo}</div><div className="max-w-52 truncate text-xs text-muted-foreground">{item.sourceNo || item.contract.title}</div></td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3">{item.counterparty.name}</td><td className="p-3">{item.businessUnit?.name || '—'}</td><td className="p-3 text-right font-medium">{money(item.totalAmount)}</td><td className="p-3 text-right">{money(item.settledAmount)}</td><td className="p-3">{day(item.dueDate)}</td><td className="p-3"><Button size="sm" variant="ghost" asChild><Link href={`/dashboard/settlements/${item.id}`}>详情</Link></Button></td></tr>)}</tbody></table></div>;
}

function FundTable({ items, cashLabel, canManage, onVoid }: { items: Fund[]; cashLabel: string; canManage: boolean; onVoid: (item: Fund) => void }) {
  if (!items.length) return <Empty text={`暂无${cashLabel}、预收预付或退款记录。`}/>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">资金单号</th><th className="p-3">款项类型</th><th className="p-3">支付方式</th><th className="p-3">状态</th><th className="p-3">合同</th><th className="p-3">收付方向</th><th className="p-3 text-right">发生金额</th><th className="p-3 text-right">已核销/退回</th><th className="p-3 text-right">可用余额</th><th className="p-3">日期</th><th className="p-3">操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-mono">{item.transactionNo}</td><td className="p-3">{STAGE[item.paymentStage] || item.paymentStage}{item.relatedTransaction && <div className="text-xs text-muted-foreground">原：{item.relatedTransaction.transactionNo}</div>}</td><td className="p-3">{METHOD[item.paymentMethod] || item.paymentMethod}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3"><div>{item.contract.contractNo}</div><div className="max-w-44 truncate text-xs text-muted-foreground">{item.contract.title}</div></td><td className="p-3">{item.direction === 'RECEIPT' ? '收款' : '付款'}</td><td className="p-3 text-right font-medium">{money(item.amount)}</td><td className="p-3 text-right">{money(Number(item.allocatedAmount) + Number(item.refundedAmount))}</td><td className="p-3 text-right">{money(Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount)))}</td><td className="p-3">{day(item.occurredAt)}</td><td className="p-3">{canManage && item.status !== 'VOIDED' && <Button size="sm" variant="ghost" onClick={() => onVoid(item)}>作废</Button>}</td></tr>)}</tbody></table></div>;
}

function ContractLedger({ contracts }: { contracts: ContractOption[] }) {
  if (!contracts.length) return <Empty text="暂无可结算合同。"/>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">合同</th><th className="p-3">交易对手方</th><th className="p-3">业务单元</th><th className="p-3 text-right">合同金额</th><th className="p-3 text-right">累计结算</th><th className="p-3 text-right">剩余可结算</th><th className="p-3 text-right">预收预付参考</th></tr></thead><tbody>{contracts.map((item) => <tr key={item.id} className="border-b"><td className="p-3"><div>{item.contractNo}</div><div className="max-w-64 truncate text-xs text-muted-foreground">{item.title}</div></td><td className="p-3">{item.counterparty.name}</td><td className="p-3">{item.businessUnit.name}</td><td className="p-3 text-right">{money(item.amount)}</td><td className="p-3 text-right">{money(item.settledTotal)}</td><td className="p-3 text-right font-medium">{money(item.remainingSettleable)}</td><td className="p-3 text-right">{money(item.advanceBalance)}</td></tr>)}</tbody></table></div>;
}
