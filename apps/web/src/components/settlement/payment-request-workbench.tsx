'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, Pencil, Plus, Search, Send, Trash2, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { SettlementAttachments, type SettlementAttachment } from './settlement-attachments';
import { confirmAction, promptAction } from '@/lib/system-dialog';

interface ContractOption {
  id: string; contractNo: string; title: string;
  remainingPaymentAmount?: string;
  signingPartner: { id?: string; name: string; bankAccounts?: BankAccount[] }; counterparty: { id?: string; name: string; bankAccounts?: BankAccount[] }; businessUnit?: { name: string } | null;
}
interface BankAccount { id: string; accountName: string; accountNo: string; bankName: string; bankCode?: string | null; isDefault?: boolean }
interface OrderOption { id: string; orderNo: string; name?: string | null; status: string; amount: string; remainingAmount: string }
interface SettlementOption {
  id: string; settlementNo: string; contract: { id: string }; status: string; totalAmount: string; settledAmount: string;
}
interface PaymentRequest {
  id: string; requestNo: string; status: string; businessType: 'PURCHASE' | 'SALES'; paymentStage: string; paymentMethod: string; amount: string;
  order?: { id: string; orderNo: string; name?: string | null; status: string } | null;
  requestedPayDate?: string | null; ourBankAccount?: string | null; ourBankAccountName?: string | null; ourBankName?: string | null; ourBankCode?: string | null;
  counterpartyBankAccount?: string | null; counterpartyBankAccountName?: string | null; counterpartyBankName?: string | null; counterpartyBankCode?: string | null;
  actualPayeeName?: string | null; isThirdParty: boolean; thirdPartyReason?: string | null; purpose?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; settlement?: { id: string; settlementNo: string } | null;
  businessUnit?: { name: string } | null; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; submitter?: { name: string } | null; approver?: { name: string } | null; rejecter?: { name: string } | null;
  rejectionReason?: string | null; fundTransactions?: Array<{ id: string; transactionNo: string; status: string; amount: string }>;
  relatedTransaction?: { id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string } | null;
  attachments?: SettlementAttachment[];
  approvals?: Array<{
    id: string; nodeName: string; roleName?: string | null; approvalMode: string; step: number; round: number; status: string;
    comment?: string | null; actedAt?: string | null; assignee: { id: string; name: string }; actedBy?: { id: string; name: string } | null;
  }>;
}

const STATUS: Record<string, string> = { DRAFT: '业务草稿', BUSINESS_CONFIRMED: '业务已确认，待财务提交', PENDING_APPROVAL: '审批中', APPROVED: '已批准待创建付款单', PARTIALLY_PAID: '部分付款', REJECTED: '已驳回', PAID: '已全部付款', VOIDED: '已作废' };
const APPROVAL_STATUS: Record<string, string> = { WAITING: '等待前序节点', PENDING: '待审批', APPROVED: '已通过', REJECTED: '已驳回', OTHERS_APPROVED: '他人已审批', OTHERS_REJECTED: '他人已驳回', CANCELLED: '已取消' };
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
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [originalFunds, setOriginalFunds] = useState<Array<{ id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; direction: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<PaymentRequest | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [contractSearch, setContractSearch] = useState('');
  const [ourPartyId, setOurPartyId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [form, setForm] = useState({ businessType: 'PURCHASE' as 'PURCHASE' | 'SALES', contractId: '', orderId: '', settlementId: '', relatedTransactionId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', requestedPayDate: today(), ourBankAccount: '', ourBankAccountName: '', ourBankName: '', ourBankCode: '', counterpartyBankAccount: '', counterpartyBankAccountName: '', counterpartyBankName: '', counterpartyBankCode: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', purpose: '', remarks: '' });
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
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setUserId(user.id || ''); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setUserId(''); setPermissions([]); }
  }, []);

  const visible = useMemo(() => items.filter((item) => {
    if (status && item.status !== status) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${item.requestNo} ${item.contract.contractNo} ${item.contract.title} ${item.counterparty.name}`.toLowerCase().includes(needle);
  }), [items, search, status]);
  const selectedContract = contracts[form.businessType].find((item) => item.id === form.contractId);
  const ourPartyOptions = Array.from(new Map(contracts[form.businessType].filter((item) => item.signingPartner.id).map((item) => [item.signingPartner.id!, { id: item.signingPartner.id!, name: item.signingPartner.name }])).values());
  const counterpartyOptions = Array.from(new Map(contracts[form.businessType].filter((item) => item.counterparty.id && (!ourPartyId || item.signingPartner.id === ourPartyId)).map((item) => [item.counterparty.id!, { id: item.counterparty.id!, name: item.counterparty.name }])).values());
  const filteredContracts = contracts[form.businessType].filter((item) => {
    if (ourPartyId && item.signingPartner.id !== ourPartyId) return false;
    if (counterpartyId && item.counterparty.id !== counterpartyId) return false;
    return `${item.contractNo} ${item.title} ${item.signingPartner.name} ${item.counterparty.name}`.toLowerCase().includes(contractSearch.trim().toLowerCase());
  });
  const settlementOptions = settlements.filter((item) => item.contract.id === form.contractId && ['CONFIRMED', 'PARTIALLY_SETTLED'].includes(item.status));
  const originalCandidates = originalFunds.filter((item) => item.direction === 'RECEIPT' && item.status !== 'VOIDED'
    && (form.paymentStage === 'GUARANTEE_RETURN' ? item.paymentStage === 'GUARANTEE' : item.paymentStage !== 'GUARANTEE')
    && Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount) > 0);

  const openCreate = () => {
    setOriginalFunds([]); setOrders([]); setEditingId(''); setContractSearch(''); setOurPartyId(''); setCounterpartyId('');
    setForm({ businessType: 'PURCHASE', contractId: '', orderId: '', settlementId: '', relatedTransactionId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', requestedPayDate: today(), ourBankAccount: '', ourBankAccountName: '', ourBankName: '', ourBankCode: '', counterpartyBankAccount: '', counterpartyBankAccountName: '', counterpartyBankName: '', counterpartyBankCode: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', purpose: '', remarks: '' });
    setCreateOpen(true);
  };
  const changeBusinessType = (businessType: 'PURCHASE' | 'SALES') => {
    setOriginalFunds([]);
    setOrders([]); setContractSearch(''); setOurPartyId(''); setCounterpartyId('');
    setForm((old) => ({ ...old, businessType, contractId: '', orderId: '', settlementId: '', relatedTransactionId: '', paymentStage: businessType === 'PURCHASE' ? 'SETTLEMENT' : 'REFUND', amount: '', actualPayeeName: '', ourBankAccount: '', ourBankAccountName: '', ourBankName: '', ourBankCode: '', counterpartyBankAccount: '', counterpartyBankAccountName: '', counterpartyBankName: '', counterpartyBankCode: '' }));
  };
  const changeContract = async (contractId: string) => {
    setOriginalFunds([]);
    const contract = contracts[form.businessType].find((item) => item.id === contractId);
    if (contract) { setOurPartyId(contract.signingPartner.id || ''); setCounterpartyId(contract.counterparty.id || ''); }
    const our = contract?.signingPartner.bankAccounts?.[0];
    const other = contract?.counterparty.bankAccounts?.[0];
    setForm((old) => ({ ...old, contractId, orderId: '', settlementId: '', relatedTransactionId: '', amount: '',
      ourBankAccount: our?.accountNo || '', ourBankAccountName: our?.accountName || '', ourBankName: our?.bankName || '', ourBankCode: our?.bankCode || '',
      counterpartyBankAccount: other?.accountNo || '', counterpartyBankAccountName: other?.accountName || '', counterpartyBankName: other?.bankName || '', counterpartyBankCode: other?.bankCode || '',
      actualPayeeName: contract?.counterparty.name || '',
    }));
    setOrders([]);
    if (!contractId) return;
    try {
      const [orderRows, funds] = await Promise.all([
        api.get<OrderOption[]>(`/financial-settlements/options/orders?contractId=${contractId}&direction=${form.businessType === 'PURCHASE' ? 'PAYABLE' : 'RECEIVABLE'}`),
        form.businessType === 'SALES' ? api.get<Array<{ id: string; transactionNo: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; direction: string }>>(`/financial-settlements/funds?businessType=SALES&contractId=${contractId}`) : Promise.resolve([]),
      ]);
      setOrders(orderRows || []); setOriginalFunds(funds || []);
    } catch (error: any) { alert(error.message || '加载原收款单失败'); }
  };
  const save = async () => {
    if (!form.contractId || Number(form.amount) <= 0) return alert('请选择合同并填写付款金额');
    if (form.businessType === 'SALES' && !form.relatedTransactionId) return alert('请选择原收款单');
    if (form.isThirdParty && !form.thirdPartyReason.trim()) return alert('请填写第三方收款原因');
    setBusy(true);
    try {
      const payload = { ...form, amount: Number(form.amount), orderId: form.orderId || undefined, settlementId: form.settlementId || undefined, relatedTransactionId: form.relatedTransactionId || undefined, requestedPayDate: form.requestedPayDate ? `${form.requestedPayDate}T12:00:00+08:00` : undefined };
      if (editingId) await api.patch(`/financial-settlements/payment-requests/${editingId}`, payload);
      else await api.post('/financial-settlements/payment-requests', payload);
      setCreateOpen(false); await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const editDraft = async (item: PaymentRequest) => {
    setEditingId(item.id); setContractSearch('');
    const contract = contracts[item.businessType].find((row) => row.id === item.contract.id);
    setOurPartyId(contract?.signingPartner.id || ''); setCounterpartyId(contract?.counterparty.id || '');
    setForm({ businessType: item.businessType, contractId: item.contract.id, orderId: item.order?.id || '', settlementId: item.settlement?.id || '', relatedTransactionId: item.relatedTransaction?.id || '', paymentStage: item.paymentStage, paymentMethod: item.paymentMethod, amount: String(item.amount), requestedPayDate: item.requestedPayDate?.slice(0, 10) || '', ourBankAccount: item.ourBankAccount || '', ourBankAccountName: item.ourBankAccountName || '', ourBankName: item.ourBankName || '', ourBankCode: item.ourBankCode || '', counterpartyBankAccount: item.counterpartyBankAccount || '', counterpartyBankAccountName: item.counterpartyBankAccountName || '', counterpartyBankName: item.counterpartyBankName || '', counterpartyBankCode: item.counterpartyBankCode || '', actualPayeeName: item.actualPayeeName || '', isThirdParty: item.isThirdParty, thirdPartyReason: item.thirdPartyReason || '', purpose: item.purpose || '', remarks: item.remarks || '' });
    try {
      const [orderRows, funds] = await Promise.all([
        api.get<OrderOption[]>(`/financial-settlements/options/orders?contractId=${item.contract.id}&direction=${item.businessType === 'PURCHASE' ? 'PAYABLE' : 'RECEIVABLE'}`),
        item.businessType === 'SALES' ? api.get<any[]>(`/financial-settlements/funds?businessType=SALES&contractId=${item.contract.id}`) : Promise.resolve([]),
      ]);
      setOrders(orderRows || []); setOriginalFunds(funds || []);
      if (!contract) await load();
    } catch (error: any) { alert(error.message || '加载付款申请选项失败'); }
    setCreateOpen(true);
  };
  const deleteDraft = async (item: PaymentRequest) => {
    if (!await confirmAction(`确定删除草稿 ${item.requestNo} 吗？删除后不可恢复。`)) return;
    try { await api.delete(`/financial-settlements/payment-requests/${item.id}`); await load(); }
    catch (error: any) { alert(error.message); }
  };
  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    try { await api.post(path, body); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const reject = async (item: PaymentRequest) => {
    const reason = await promptAction('请输入驳回原因'); if (!reason?.trim()) return;
    await action(`/financial-settlements/payment-requests/${item.id}/reject`, { reason });
  };
  const approve = async (item: PaymentRequest) => {
    const comment = await promptAction('请输入审批意见', '同意'); if (comment === null) return;
    await action(`/financial-settlements/payment-requests/${item.id}/approve`, { comment: comment.trim() || '同意' });
  };
  const openExecute = (item: PaymentRequest) => {
    window.location.href = `/dashboard/payments/create?paymentRequestId=${item.id}`;
  };

  const total = items.filter((item) => item.status !== 'VOIDED').reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = items.filter((item) => item.status === 'PENDING_APPROVAL').reduce((sum, item) => sum + Number(item.amount), 0);
  const approved = items.filter((item) => ['APPROVED', 'PARTIALLY_PAID'].includes(item.status)).reduce((sum, item) => sum + Math.max(0, Number(item.amount) - (item.fundTransactions || []).reduce((paid, fund) => paid + Number(fund.amount), 0)), 0);
  const activeRound = selected?.approvals?.reduce((max, approval) => Math.max(max, approval.round), 0) || 0;
  const activeApprovals = selected?.approvals?.filter((approval) => approval.round === activeRound) || [];
  const canReviewSelected = Boolean(selected && selected.status === 'PENDING_APPROVAL' && can('settlement.payment.approve')
    && (isAdmin || activeApprovals.some((approval) => approval.status === 'PENDING' && approval.assignee.id === userId)));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">付款申请单</h1><p className="mt-1 text-sm text-muted-foreground">业务人员准备并确认付款资料，财务提交审批，审批通过后由出纳创建付款单</p></div>{can('settlement.payment.apply') && <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4"/>新建付款申请</Button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="申请总额" value={money(total)} icon={<WalletCards className="text-blue-600"/>}/><Metric label="待审批" value={money(pending)} icon={<Clock3 className="text-amber-600"/>}/><Metric label="待创建付款单" value={money(approved)} icon={<CheckCircle2 className="text-emerald-600"/>}/></div>
    <div className="flex flex-wrap justify-end gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="flex"><Input className="w-72 rounded-r-none" placeholder="申请单号、合同或交易对手" value={search} onChange={(event) => setSearch(event.target.value)}/><Button variant="outline" className="rounded-l-none px-3"><Search className="h-4 w-4"/></Button></div></div>
    <Card className="overflow-hidden">{loading ? <Empty text="正在加载付款申请…"/> : !visible.length ? <Empty text="暂无付款申请"/> : <div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">申请单号</th><th className="p-3">合同/执行批次</th><th className="p-3">我方付款主体</th><th className="p-3">状态</th><th className="p-3">交易对手/实际收款方</th><th className="p-3">款项类型</th><th className="p-3 text-right">申请金额</th><th className="p-3">计划付款日</th><th className="p-3">操作</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3 font-mono">{item.requestNo}</td><td className="p-3"><div>{item.contract.contractNo}</div><div className="max-w-48 truncate text-xs text-muted-foreground">{item.order ? `${item.order.orderNo} · ${item.order.name || '未命名批次'}` : item.contract.title}</div></td><td className="p-3">{item.legalEntity.name}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3"><div>{item.counterparty.name}</div><div className="text-xs text-muted-foreground">实际：{item.actualPayeeName || item.counterparty.name}</div></td><td className="p-3">{STAGE[item.paymentStage] || item.paymentStage}</td><td className="p-3 text-right font-medium">{money(item.amount)}</td><td className="p-3">{day(item.requestedPayDate)}</td><td className="p-3"><div className="flex items-center gap-1"><Button size="sm" variant="ghost" asChild><Link href={`/dashboard/payment-requests/${item.id}`}>详情</Link></Button>{item.status === 'DRAFT' && can('settlement.payment.apply') && <><Button size="icon" variant="ghost" title="修改草稿" onClick={() => void editDraft(item)}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" title="删除草稿" onClick={() => void deleteDraft(item)}><Trash2 className="h-4 w-4 text-destructive"/></Button></>}</div></td></tr>)}</tbody></table></div>}</Card>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? '修改付款申请草稿' : '新建付款申请'}</DialogTitle><DialogDescription>业务人员保存并确认资料后，由财务提交审批；审批通过并由出纳创建后才形成实际付款单。</DialogDescription></DialogHeader><div className="space-y-4">
      <Field label="付款业务 *"><select className={fieldClass} value={form.businessType} onChange={(event) => changeBusinessType(event.target.value as 'PURCHASE' | 'SALES')}><option value="PURCHASE">采购付款</option><option value="SALES">销售客户退款/保证金退回</option></select></Field>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="我方付款主体（筛选）"><select className={fieldClass} value={ourPartyId} onChange={(event) => { setOurPartyId(event.target.value); setCounterpartyId(''); setForm((old) => ({ ...old, contractId: '', orderId: '', settlementId: '' })); }}><option value="">全部我方主体</option>{ourPartyOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="交易对手方（筛选）"><select className={fieldClass} value={counterpartyId} onChange={(event) => { setCounterpartyId(event.target.value); setForm((old) => ({ ...old, contractId: '', orderId: '', settlementId: '' })); }}><option value="">全部交易对手</option>{counterpartyOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="合同/企业模糊搜索"><Input placeholder="合同号、标题或企业名称" value={contractSearch} onChange={(event) => setContractSearch(event.target.value)}/></Field></div><Field label={`${form.businessType === 'PURCHASE' ? '采购' : '销售'}合同 *`}><select className={fieldClass} value={form.contractId} onChange={(event) => void changeContract(event.target.value)}><option value="">请选择合同</option>{filteredContracts.map((item) => <option key={item.id} value={item.id}>{item.contractNo} · {item.signingPartner.name} → {item.counterparty.name} · 可计划 {money(item.remainingPaymentAmount)}</option>)}</select></Field>
      {selectedContract && <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"><Info label="我方付款主体" value={selectedContract.signingPartner.name}/><Info label="交易对手方" value={selectedContract.counterparty.name}/><Info label="业务单元" value={selectedContract.businessUnit?.name || '—'}/></div>}
      {form.contractId && <Field label="执行批次（可选）"><select className={fieldClass} value={form.orderId} onChange={(event) => setForm((old) => ({ ...old, orderId: event.target.value }))}><option value="">按合同准备，不指定执行批次</option>{orders.map((item) => <option key={item.id} value={item.id}>{item.orderNo} · {item.name || '未命名批次'} · {item.status} · 未安排 {money(item.remainingAmount)}</option>)}</select></Field>}
      {form.businessType === 'PURCHASE' ? <Field label="应付结算单（预付款可不选）"><select className={fieldClass} value={form.settlementId} onChange={(event) => { const id = event.target.value; const settlement = settlements.find((item) => item.id === id); setForm((old) => ({ ...old, settlementId: id, amount: settlement ? String(Math.max(0, Number(settlement.totalAmount) - Number(settlement.settledAmount))) : old.amount })); }}><option value="">暂不关联结算单</option>{settlementOptions.map((item) => <option key={item.id} value={item.id}>{item.settlementNo} · 未结 {money(Number(item.totalAmount) - Number(item.settledAmount))}</option>)}</select></Field> : <Field label="原收款单 *"><select className={fieldClass} value={form.relatedTransactionId} onChange={(event) => { const id = event.target.value; const original = originalCandidates.find((item) => item.id === id); setForm((old) => ({ ...old, relatedTransactionId: id, amount: original ? String(Math.max(0, Number(original.amount) - Number(original.allocatedAmount) - Number(original.refundedAmount))) : old.amount })); }}><option value="">请选择尚有可退余额的收款单</option>{originalCandidates.map((item) => <option key={item.id} value={item.id}>{item.transactionNo} · {STAGE[item.paymentStage] || item.paymentStage} · 可退 {money(Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount))}</option>)}</select></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="款项类型 *"><select className={fieldClass} value={form.paymentStage} onChange={(event) => setForm((old) => ({ ...old, paymentStage: event.target.value, relatedTransactionId: '', amount: form.businessType === 'SALES' ? '' : old.amount }))}>{(form.businessType === 'PURCHASE' ? ['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'OTHER'] : ['REFUND', 'GUARANTEE_RETURN']).map((value) => <option key={value} value={value}>{STAGE[value]}</option>)}</select></Field><Field label="支付方式 *"><select className={fieldClass} value={form.paymentMethod} onChange={(event) => setForm((old) => ({ ...old, paymentMethod: event.target.value }))}>{Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="申请金额 *"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((old) => ({ ...old, amount: event.target.value }))}/></Field><Field label="计划付款日期"><Input type="date" value={form.requestedPayDate} onChange={(event) => setForm((old) => ({ ...old, requestedPayDate: event.target.value }))}/></Field><Field label="我方付款账户"><select className={fieldClass} value={form.ourBankAccount} onChange={(event) => { const account = selectedContract?.signingPartner.bankAccounts?.find((row) => row.accountNo === event.target.value); setForm((old) => ({ ...old, ourBankAccount: event.target.value, ourBankAccountName: account?.accountName || '', ourBankName: account?.bankName || '', ourBankCode: account?.bankCode || '' })); }}><option value="">请选择或暂不填写</option>{selectedContract?.signingPartner.bankAccounts?.map((account) => <option key={account.id} value={account.accountNo}>{account.accountName} · {account.bankName} · {account.accountNo}</option>)}</select></Field><Field label="对方收款账户"><select className={fieldClass} value={form.counterpartyBankAccount} onChange={(event) => { const account = selectedContract?.counterparty.bankAccounts?.find((row) => row.accountNo === event.target.value); setForm((old) => ({ ...old, counterpartyBankAccount: event.target.value, counterpartyBankAccountName: account?.accountName || '', counterpartyBankName: account?.bankName || '', counterpartyBankCode: account?.bankCode || '' })); }}><option value="">请选择或暂不填写</option>{selectedContract?.counterparty.bankAccounts?.map((account) => <option key={account.id} value={account.accountNo}>{account.accountName} · {account.bankName} · {account.accountNo}</option>)}</select></Field><Field label="实际收款方"><Input placeholder={selectedContract?.counterparty.name || '默认使用交易对手方名称'} value={form.actualPayeeName} onChange={(event) => setForm((old) => ({ ...old, actualPayeeName: event.target.value }))}/></Field></div>
      <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.isThirdParty} onChange={(event) => setForm((old) => ({ ...old, isThirdParty: event.target.checked }))}/>实际收款方与合同交易对手不一致</label>
      {form.isThirdParty && <Field label="第三方收款原因 *"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.thirdPartyReason} onChange={(event) => setForm((old) => ({ ...old, thirdPartyReason: event.target.value }))}/></Field>}
      <Field label="付款用途"><Input value={form.purpose} onChange={(event) => setForm((old) => ({ ...old, purpose: event.target.value }))}/></Field><Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={(event) => setForm((old) => ({ ...old, remarks: event.target.value }))}/></Field>
    </div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void save()}>{editingId ? '保存修改' : '保存草稿'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!selected} onOpenChange={(value) => !value && setSelected(null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">{selected && <>
        <DialogHeader><DialogTitle>{selected.requestNo}</DialogTitle><DialogDescription>{selected.contract.contractNo} · {STATUS[selected.status]}</DialogDescription></DialogHeader>
        <div className="grid gap-3 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-3"><Info label="我方付款主体" value={selected.legalEntity.name}/><Info label="合同交易对手" value={selected.counterparty.name}/><Info label="实际收款方" value={selected.actualPayeeName || selected.counterparty.name}/><Info label="申请金额" value={money(selected.amount)}/><Info label="已创建付款单" value={money((selected.fundTransactions || []).reduce((sum, fund) => sum + Number(fund.amount), 0))}/><Info label="剩余待付" value={money(Math.max(0, Number(selected.amount) - (selected.fundTransactions || []).reduce((sum, fund) => sum + Number(fund.amount), 0)))}/><Info label="款项类型" value={STAGE[selected.paymentStage] || selected.paymentStage}/><Info label="支付方式" value={METHOD[selected.paymentMethod] || selected.paymentMethod}/><Info label="业务单元" value={selected.businessUnit?.name || '—'}/><Info label={selected.businessType === 'PURCHASE' ? '应付结算单' : '原收款单'} value={selected.businessType === 'PURCHASE' ? selected.settlement?.settlementNo || '预付款/暂未关联' : selected.relatedTransaction?.transactionNo || '—'}/><Info label="申请人" value={selected.creator.name}/><Info label="提交人" value={selected.submitter?.name || '—'}/><Info label="最终审批人" value={selected.approver?.name || '—'}/></div>
        {selected.isThirdParty && <p className="text-sm"><span className="text-muted-foreground">第三方收款原因：</span>{selected.thirdPartyReason}</p>}
        {selected.rejectionReason && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">驳回原因：{selected.rejectionReason}</p>}
        {activeApprovals.length > 0 && <div className="space-y-2"><h3 className="text-sm font-medium">审批进度（第 {activeRound} 轮）</h3>{activeApprovals.map((approval) => <div key={approval.id} className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_1fr_auto]"><div><span className="text-muted-foreground">第 {approval.step} 级：</span>{approval.nodeName}</div><div>{approval.assignee.name}{approval.actedBy && approval.actedBy.id !== approval.assignee.id ? `（由 ${approval.actedBy.name} 处理）` : ''}</div><StatusText status={approval.status}>{APPROVAL_STATUS[approval.status] || approval.status}</StatusText>{approval.comment && <div className="text-muted-foreground sm:col-span-3">意见：{approval.comment}</div>}</div>)}</div>}
        <SettlementAttachments attachments={selected.attachments} uploadPath={`/financial-settlements/payment-requests/${selected.id}/attachments`} editable={['DRAFT', 'REJECTED', 'BUSINESS_CONFIRMED'].includes(selected.status) && (can('settlement.payment.apply') || can('settlement.payment.submit'))} onChanged={async () => { const refreshed = await api.get<PaymentRequest>(`/financial-settlements/payment-requests/${selected.id}`); setSelected(refreshed); await load(); }}/>
        <DialogFooter className="flex-wrap">{['DRAFT', 'REJECTED'].includes(selected.status) && can('settlement.payment.apply') && <Button onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/business-confirm`)}><CheckCircle2 className="mr-1 h-4 w-4"/>确认资料并交财务</Button>}{selected.status === 'BUSINESS_CONFIRMED' && can('settlement.payment.submit') && <Button onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/submit`)}><Send className="mr-1 h-4 w-4"/>提交审批</Button>}{canReviewSelected && <><Button variant="outline" onClick={() => void reject(selected)}>驳回</Button><Button onClick={() => void approve(selected)}>批准付款</Button></>}{['APPROVED', 'PARTIALLY_PAID'].includes(selected.status) && can('settlement.payment.execute') && <Button onClick={() => openExecute(selected)}>创建付款单</Button>}{!['PARTIALLY_PAID', 'PAID', 'VOIDED'].includes(selected.status) && can('settlement.payment.apply') && <Button variant="outline" onClick={() => void action(`/financial-settlements/payment-requests/${selected.id}/void`)}>作废</Button>}</DialogFooter>
      </>}</DialogContent>
    </Dialog>

  </div>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card className="flex items-center justify-between p-4"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div><div className="rounded-full bg-muted p-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</div></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
