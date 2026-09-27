'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Plus, Search, Send, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { SettlementAttachments, type SettlementAttachment } from './settlement-attachments';

interface ContractOption {
  id: string; contractNo: string; title: string;
  signingPartner: { name: string }; counterparty: { name: string }; businessUnit?: { name: string } | null;
}
interface SettlementOption {
  id: string; settlementNo: string; contract: { id: string }; status: string; totalAmount: string; settledAmount: string;
}
interface PaymentRequest {
  id: string; requestNo: string; status: string; businessType: 'PURCHASE' | 'SALES'; paymentStage: string; paymentMethod: string; amount: string;
  requestedPayDate?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null;
  actualPayeeName?: string | null; isThirdParty: boolean; thirdPartyReason?: string | null; purpose?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; settlement?: { id: string; settlementNo: string } | null;
  businessUnit?: { name: string } | null; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; submitter?: { name: string } | null; approver?: { name: string } | null; rejecter?: { name: string } | null;
  rejectionReason?: string | null; fundTransaction?: { id: string; transactionNo: string; status: string } | null;
  relatedTransaction?: { id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string } | null;
  attachments?: SettlementAttachment[];
}

const STATUS: Record<string, string> = { DRAFT: '草稿', PENDING_APPROVAL: '待审批', APPROVED: '已批准待付款', REJECTED: '已驳回', PAID: '已执行付款', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '客户退款', GUARANTEE_RETURN: '退还客户保证金', OTHER: '其他付款' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const fieldClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const today = () => new Date().toLocaleDateString('sv-SE');

export function PaymentRequestWorkbench() {
  const [items, setItems] = useState<PaymentRequest[]>([]);
  const [contracts, setContracts] = useState<Record<'PURCHASE' | 'SALES', ContractOption[]>>({ PURCHASE: [], SALES: [] });
  const [settlements, setSettlements] = useState<SettlementOption[]>([]);
  const [originalFunds, setOriginalFunds] = useState<Array<{ id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; direction: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<PaymentRequest | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [form, setForm] = useState({ businessType: 'PURCHASE' as 'PURCHASE' | 'SALES', contractId: '', settlementId: '', relatedTransactionId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', requestedPayDate: today(), ourBankAccount: '', counterpartyBankAccount: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', purpose: '', remarks: '' });
  const [execute, setExecute] = useState({ occurredAt: today(), bankReference: '', ourBankAccount: '', counterpartyBankAccount: '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requests, purchaseContracts, salesContracts, payable] = await Promise.all([
        api.get<PaymentRequest[]>('/financial-settlements/payment-requests'),
        api.get<ContractOption[]>('/financial-settlements/options/contracts?direction=PAYABLE'),
        api.get<ContractOption[]>('/financial-settlements/options/contracts?direction=RECEIVABLE'),
        api.get<{ items: SettlementOption[] }>('/financial-settlements?direction=PAYABLE'),
      ]);
      setItems(requests || []); setContracts({ PURCHASE: purchaseContracts || [], SALES: salesContracts || [] }); setSettlements(payable?.items || []);
    } catch (error: any) { alert(error.message || '加载付款申请失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);

  const visible = useMemo(() => items.filter((item) => {
    if (status && item.status !== status) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${item.requestNo} ${item.contract.contractNo} ${item.contract.title} ${item.counterparty.name}`.toLowerCase().includes(needle);
  }), [items, search, status]);
  const selectedContract = contracts[form.businessType].find((item) => item.id === form.contractId);
  const settlementOptions = settlements.filter((item) => item.contract.id === form.contractId && ['CONFIRMED', 'PARTIALLY_SETTLED'].includes(item.status));
  const originalCandidates = originalFunds.filter((item) => item.direction === 'RECEIPT' && item.status !== 'VOIDED'
    && (form.paymentStage === 'GUARANTEE_RETURN' ? item.paymentStage === 'GUARANTEE' : item.paymentStage !== 'GUARANTEE')
    && Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount) > 0);

  const openCreate = () => {
    setOriginalFunds([]);
    setForm({ businessType: 'PURCHASE', contractId: '', settlementId: '', relatedTransactionId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', requestedPayDate: today(), ourBankAccount: '', counterpartyBankAccount: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', purpose: '', remarks: '' });
    setCreateOpen(true);
  };
  const changeBusinessType = (businessType: 'PURCHASE' | 'SALES') => {
    setOriginalFunds([]);
    setForm((old) => ({ ...old, businessType, contractId: '', settlementId: '', relatedTransactionId: '', paymentStage: businessType === 'PURCHASE' ? 'SETTLEMENT' : 'REFUND', amount: '', actualPayeeName: '' }));
  };
  const changeContract = async (contractId: string) => {
    setOriginalFunds([]);
    setForm((old) => ({ ...old, contractId, settlementId: '', relatedTransactionId: '', amount: '' }));
    if (!contractId || form.businessType !== 'SALES') return;
    try {
      setOriginalFunds(await api.get<Array<{ id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; direction: string }>>(`/financial-settlements/funds?businessType=SALES&contractId=${contractId}`) || []);
    } catch (error: any) { alert(error.message || '加载原收款单失败'); }
  };
  const create = async () => {
    if (!form.contractId || Number(form.amount) <= 0) return alert('请选择合同并填写付款金额');
    if (form.businessType === 'SALES' && !form.relatedTransactionId) return alert('请选择原收款单');
    if (form.isThirdParty && !form.thirdPartyReason.trim()) return alert('请填写第三方收款原因');
    setBusy(true);
    try {
      await api.post('/financial-settlements/payment-requests', { ...form, amount: Number(form.amount), settlementId: form.settlementId || undefined, relatedTransactionId: form.relatedTransactionId || undefined, requestedPayDate: form.requestedPayDate ? `${form.requestedPayDate}T12:00:00+08:00` : undefined });
      setCreateOpen(false); await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    try { await api.post(path, body); setSelected(null); setExecuteOpen(false); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const reject = async (item: PaymentRequest) => {
    const reason = prompt('请输入驳回原因'); if (!reason?.trim()) return;
    await action(`/financial-settlements/payment-requests/${item.id}/reject`, { reason });
  };
  const openExecute = (item: PaymentRequest) => {
    setSelected(item); setExecute({ occurredAt: today(), bankReference: '', ourBankAccount: item.ourBankAccount || '', counterpartyBankAccount: item.counterpartyBankAccount || '', instrumentNo: '', instrumentDueDate: '', remarks: '' }); setExecuteOpen(true);
  };
  const executePayment = async () => {
    if (!selected || !execute.occurredAt) return;
    await action(`/financial-settlements/payment-requests/${selected.id}/execute`, { ...execute, occurredAt: `${execute.occurredAt}T12:00:00+08:00`, instrumentDueDate: execute.instrumentDueDate ? `${execute.instrumentDueDate}T00:00:00+08:00` : undefined });
  };

  const total = items.filter((item) => item.status !== 'VOIDED').reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = items.filter((item) => item.status === 'PENDING_APPROVAL').reduce((sum, item) => sum + Number(item.amount), 0);
  const approved = items.filter((item) => item.status === 'APPROVED').reduce((sum, item) => sum + Number(item.amount), 0);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">付款申请</h1><p className="mt-1 text-sm text-muted-foreground">业务发起、财务或管理人员审批、出纳执行，实际付款后自动生成付款单</p></div>{can('settlement.payment.apply') && <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4"/>新建付款申请</Button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="申请总额" value={money(total)} icon={<WalletCards className="text-blue-600"/>}/><Metric label="待审批" value={money(pending)} icon={<Clock3 className="text-amber-600"/>}/><Metric label="已批准待付款" value={money(approved)} icon={<CheckCircle2 className="text-emerald-600"/>}/></div>
    <div className="flex flex-wrap justify-end gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="flex"><Input className="w-72 rounded-r-none" placeholder="申请单号、合同或交易对手" value={search} onChange={(event) => setSearch(event.target.value)}/><Button variant="outline" className="rounded-l-none px-3"><Search className="h-4 w-4"/></Button></div></div>
    <Card className="overflow-hidden">{loading ? <Empty text="正在加载付款申请…"/> : !visible.length ? <Empty text="暂无付款申请"/> : <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">申请单号</th><th className="p-3">合同</th><th className="p-3">我方付款主体</th><th className="p-3">交易对手/实际收款方</th><th className="p-3">款项类型</th><th className="p-3 text-right">申请金额</th><th className="p-3">计划付款日</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3 font-mono">{item.requestNo}</td><td className="p-3"><div>{item.contract.contractNo}</div><div className="max-w-48 truncate text-xs text-muted-foreground">{item.contract.title}</div></td><td className="p-3">{item.legalEntity.name}</td><td className="p-3"><div>{item.counterparty.name}</div><div className="text-xs text-muted-foreground">实际：{item.actualPayeeName || item.counterparty.name}</div></td><td className="p-3">{STAGE[item.paymentStage] || item.paymentStage}</td><td className="p-3 text-right font-medium">{money(item.amount)}</td><td className="p-3">{day(item.requestedPayDate)}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3"><Button size="sm" variant="ghost" onClick={() => setSelected(item)}>详情</Button></td></tr>)}</tbody></table></div>}</Card>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>新建付款申请</DialogTitle><DialogDescription>付款申请只代表拟付款；审批通过并由出纳执行后才形成实际付款单。</DialogDescription></DialogHeader><div className="space-y-4">
      <Field label="付款业务 *"><select className={fieldClass} value={form.businessType} onChange={(event) => changeBusinessType(event.target.value as 'PURCHASE' | 'SALES')}><option value="PURCHASE">采购付款</option><option value="SALES">销售客户退款/保证金退回</option></select></Field>
      <Field label={`${form.businessType === 'PURCHASE' ? '采购' : '销售'}合同 *`}><select className={fieldClass} value={form.contractId} onChange={(event) => void changeContract(event.target.value)}><option value="">请选择合同</option>{contracts[form.businessType].map((item) => <option key={item.id} value={item.id}>{item.contractNo} · {item.title}</option>)}</select></Field>
      {selectedContract && <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"><Info label="我方付款主体" value={selectedContract.signingPartner.name}/><Info label="交易对手方" value={selectedContract.counterparty.name}/><Info label="业务单元" value={selectedContract.businessUnit?.name || '—'}/></div>}
      {form.businessType === 'PURCHASE' ? <Field label="应付结算单（预付款可不选）"><select className={fieldClass} value={form.settlementId} onChange={(event) => { const id = event.target.value; const settlement = settlements.find((item) => item.id === id); setForm((old) => ({ ...old, settlementId: id, amount: settlement ? String(Math.max(0, Number(settlement.totalAmount) - Number(settlement.settledAmount))) : old.amount })); }}><option value="">暂不关联结算单</option>{settlementOptions.map((item) => <option key={item.id} value={item.id}>{item.settlementNo} · 未结 {money(Number(item.totalAmount) - Number(item.settledAmount))}</option>)}</select></Field> : <Field label="原收款单 *"><select className={fieldClass} value={form.relatedTransactionId} onChange={(event) => { const id = event.target.value; const original = originalCandidates.find((item) => item.id === id); setForm((old) => ({ ...old, relatedTransactionId: id, amount: original ? String(Math.max(0, Number(original.amount) - Number(original.allocatedAmount) - Number(original.refundedAmount))) : old.amount })); }}><option value="">请选择尚有可退余额的收款单</option>{originalCandidates.map((item) => <option key={item.id} value={item.id}>{item.transactionNo} · {STAGE[item.paymentStage] || item.paymentStage} · 可退 {money(Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount))}</option>)}</select></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="款项类型 *"><select className={fieldClass} value={form.paymentStage} onChange={(event) => setForm((old) => ({ ...old, paymentStage: event.target.value, relatedTransactionId: '', amount: form.businessType === 'SALES' ? '' : old.amount }))}>{(form.businessType === 'PURCHASE' ? ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'OTHER'] : ['REFUND', 'GUARANTEE_RETURN']).map((value) => <option key={value} value={value}>{STAGE[value]}</option>)}</select></Field><Field label="支付方式 *"><select className={fieldClass} value={form.paymentMethod} onChange={(event) => setForm((old) => ({ ...old, paymentMethod: event.target.value }))}>{Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="申请金额 *"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((old) => ({ ...old, amount: event.target.value }))}/></Field><Field label="计划付款日期"><Input type="date" value={form.requestedPayDate} onChange={(event) => setForm((old) => ({ ...old, requestedPayDate: event.target.value }))}/></Field><Field label="我方付款账户"><Input value={form.ourBankAccount} onChange={(event) => setForm((old) => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="对方收款账户"><Input value={form.counterpartyBankAccount} onChange={(event) => setForm((old) => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="实际收款方"><Input placeholder={selectedContract?.counterparty.name || '默认使用交易对手方名称'} value={form.actualPayeeName} onChange={(event) => setForm((old) => ({ ...old, actualPayeeName: event.target.value }))}/></Field></div>
      <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.isThirdParty} onChange={(event) => setForm((old) => ({ ...old, isThirdParty: event.target.checked }))}/>实际收款方与合同交易对手不一致</label>
      {form.isThirdParty && <Field label="第三方收款原因 *"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.thirdPartyReason} onChange={(event) => setForm((old) => ({ ...old, thirdPartyReason: event.target.value }))}/></Field>}
      <Field label="付款用途"><Input value={form.purpose} onChange={(event) => setForm((old) => ({ ...old, purpose: event.target.value }))}/></Field><Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={(event) => setForm((old) => ({ ...old, remarks: event.target.value }))}/></Field>
    </div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void create()}>保存草稿</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!selected && !executeOpen} onOpenChange={(value) => !value && setSelected(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">{selected && <><DialogHeader><DialogTitle>{selected.requestNo}</DialogTitle><DialogDescription>{selected.contract.contractNo} · {STATUS[selected.status]}</DialogDescription></DialogHeader><div className="grid gap-3 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-3"><Info label="我方付款主体" value={selected.legalEntity.name}/><Info label="合同交易对手" value={selected.counterparty.name}/><Info label="实际收款方" value={selected.actualPayeeName || selected.counterparty.name}/><Info label="申请金额" value={money(selected.amount)}/><Info label="款项类型" value={STAGE[selected.paymentStage] || selected.paymentStage}/><Info label="支付方式" value={METHOD[selected.paymentMethod] || selected.paymentMethod}/><Info label="业务单元" value={selected.businessUnit?.name || '—'}/><Info label={selected.businessType === 'PURCHASE' ? '应付结算单' : '原收款单'} value={selected.businessType === 'PURCHASE' ? selected.settlement?.settlementNo || '预付款/暂未关联' : selected.relatedTransaction?.transactionNo || '—'}/><Info label="申请人" value={selected.creator.name}/><Info label="提交人" value={selected.submitter?.name || '—'}/><Info label="审批人" value={selected.approver?.name || '—'}/><Info label="付款单" value={selected.fundTransaction?.transactionNo || '—'}/></div>{selected.isThirdParty && <p className="text-sm"><span className="text-muted-foreground">第三方收款原因：</span>{selected.thirdPartyReason}</p>}{selected.rejectionReason && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">驳回原因：{selected.rejectionReason}</p>}<SettlementAttachments attachments={selected.attachments} uploadPath={`/financial-settlements/payment-requests/${selected.id}/attachments`} editable={['DRAFT', 'REJECTED'].includes(selected.status) && can('settlement.payment.apply')} onChanged={async () => { setSelected(null); await load(); }}/><DialogFooter className="flex-wrap">{['DRAFT', 'REJECTED'].includes(selected.status) && can('settlement.payment.apply') && <Button onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/submit`)}><Send className="mr-1 h-4 w-4"/>提交审批</Button>}{selected.status === 'PENDING_APPROVAL' && can('settlement.payment.approve') && <><Button variant="outline" onClick={() => void reject(selected)}>驳回</Button><Button onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/approve`)}>批准付款</Button></>}{selected.status === 'APPROVED' && can('settlement.payment.execute') && <Button onClick={() => openExecute(selected)}>执行付款</Button>}{!['PAID', 'VOIDED'].includes(selected.status) && can('settlement.payment.apply') && <Button variant="outline" onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/void`)}>作废</Button>}</DialogFooter></>}</DialogContent></Dialog>

    <Dialog open={executeOpen} onOpenChange={setExecuteOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>执行付款</DialogTitle><DialogDescription>请依据银行实际付款结果登记，提交后生成待财务确认的付款单。</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="实际付款日期 *"><Input type="date" value={execute.occurredAt} onChange={(event) => setExecute((old) => ({ ...old, occurredAt: event.target.value }))}/></Field><Field label="银行流水号"><Input value={execute.bankReference} onChange={(event) => setExecute((old) => ({ ...old, bankReference: event.target.value }))}/></Field><Field label="我方付款账户"><Input value={execute.ourBankAccount} onChange={(event) => setExecute((old) => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="对方收款账户"><Input value={execute.counterpartyBankAccount} onChange={(event) => setExecute((old) => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="票据/信用证编号"><Input value={execute.instrumentNo} onChange={(event) => setExecute((old) => ({ ...old, instrumentNo: event.target.value }))}/></Field><Field label="票据到期日"><Input type="date" value={execute.instrumentDueDate} onChange={(event) => setExecute((old) => ({ ...old, instrumentDueDate: event.target.value }))}/></Field></div><Field label="付款备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={execute.remarks} onChange={(event) => setExecute((old) => ({ ...old, remarks: event.target.value }))}/></Field><DialogFooter><Button variant="outline" onClick={() => setExecuteOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void executePayment()}>确认已付款</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card className="flex items-center justify-between p-4"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div><div className="rounded-full bg-muted p-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</div></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
