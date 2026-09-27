'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ClipboardList, Plus, Search, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { SettlementAttachments, type SettlementAttachment } from './settlement-attachments';

type CashDirection = 'RECEIPT' | 'PAYMENT';
type BusinessType = 'PURCHASE' | 'SALES';

interface ContractOption {
  id: string; contractNo: string; title: string;
  signingPartner: { name: string }; counterparty: { name: string }; businessUnit?: { name: string } | null;
}

interface Fund {
  id: string; transactionNo: string; direction: CashDirection; category: string; businessType: BusinessType;
  paymentStage: string; paymentMethod: string; status: string; amount: string; allocatedAmount: string; refundedAmount: string;
  occurredAt: string; bankReference?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null;
  actualPayerName?: string | null; actualPayeeName?: string | null; isThirdParty: boolean; thirdPartyReason?: string | null;
  instrumentNo?: string | null; instrumentDueDate?: string | null; remarks?: string | null; createdAt: string;
  contract: { id: string; contractNo: string; title: string }; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; relatedTransaction?: { id: string; transactionNo: string; paymentStage: string; amount: string } | null;
  claimer?: { name: string } | null; confirmer?: { name: string } | null;
  paymentRequest?: { id: string; requestNo: string; status: string } | null;
  attachments?: SettlementAttachment[];
  operationLogs?: BusinessOperationLog[];
  allocations: Array<{ id: string; amount: string; reversedAt?: string | null; settlement: { settlementNo: string; direction: string; totalAmount: string } }>;
}

const STATUS: Record<string, string> = { PENDING_CLAIM: '待认领', PENDING_CONFIRMATION: '待财务确认', CONFIRMED: '待核销', PARTIALLY_ALLOCATED: '部分核销', ALLOCATED: '已核销/退回', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预收/预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '退款', GUARANTEE_RETURN: '保证金退回', OTHER: '其他款项' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const today = () => new Date().toLocaleDateString('sv-SE');
const fieldClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export function FundWorkbench({ direction }: { direction: CashDirection }) {
  const receipt = direction === 'RECEIPT';
  const title = receipt ? '收款管理' : '付款管理';
  const documentName = receipt ? '收款单' : '付款单';
  const defaultBusinessType: BusinessType = receipt ? 'SALES' : 'PURCHASE';
  const Icon = receipt ? ArrowDownLeft : ArrowUpRight;
  const [items, setItems] = useState<Fund[]>([]);
  const [contracts, setContracts] = useState<Record<BusinessType, ContractOption[]>>({ PURCHASE: [], SALES: [] });
  const [originalFunds, setOriginalFunds] = useState<Fund[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Fund | null>(null);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mode, setMode] = useState<'NORMAL' | 'REVERSE'>('NORMAL');
  const [form, setForm] = useState({
    businessType: defaultBusinessType, contractId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER',
    amount: '', occurredAt: today(), relatedTransactionId: '', bankReference: '', ourBankAccount: '',
    counterpartyBankAccount: '', actualPayerName: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', instrumentNo: '', instrumentDueDate: '', remarks: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [funds, payableContracts, receivableContracts] = await Promise.all([
        api.get<Fund[]>(`/financial-settlements/funds?direction=${direction}`),
        api.get<ContractOption[]>('/financial-settlements/options/contracts?direction=PAYABLE'),
        api.get<ContractOption[]>('/financial-settlements/options/contracts?direction=RECEIVABLE'),
      ]);
      setItems(funds || []);
      setContracts({ PURCHASE: payableContracts || [], SALES: receivableContracts || [] });
    } catch (error: any) { alert(error.message || `加载${title}失败`); }
    finally { setLoading(false); }
  }, [direction, title]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);
  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');

  const available = useMemo(() => items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!search.trim()) return true;
    const text = `${item.transactionNo} ${item.contract.contractNo} ${item.contract.title} ${item.counterparty.name} ${item.bankReference || ''}`.toLowerCase();
    return text.includes(search.trim().toLowerCase());
  }), [items, search, status]);
  const activeItems = items.filter((item) => item.status !== 'VOIDED');
  const total = activeItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const used = activeItems.reduce((sum, item) => sum + Number(item.allocatedAmount) + Number(item.refundedAmount), 0);
  const remaining = Math.max(0, total - used);
  const reverse = mode === 'REVERSE';
  const reverseBusinessType: BusinessType = receipt ? 'PURCHASE' : 'SALES';
  const businessType = reverse ? reverseBusinessType : defaultBusinessType;
  const contractOptions = contracts[businessType];
  const selectedContract = contractOptions.find((item) => item.id === form.contractId);
  const originalCandidates = originalFunds.filter((item) => item.status !== 'VOIDED'
    && item.direction === (businessType === 'PURCHASE' ? 'PAYMENT' : 'RECEIPT')
    && (form.paymentStage === 'GUARANTEE_RETURN' ? item.paymentStage === 'GUARANTEE' : item.paymentStage !== 'GUARANTEE')
    && fundBalance(item) > 0);

  const changeMode = (value: 'NORMAL' | 'REVERSE') => {
    const nextBusinessType: BusinessType = value === 'REVERSE' ? reverseBusinessType : defaultBusinessType;
    setMode(value); setOriginalFunds([]);
    setForm((old) => ({ ...old, businessType: nextBusinessType, contractId: '', relatedTransactionId: '', paymentStage: value === 'REVERSE' ? 'REFUND' : 'SETTLEMENT' }));
  };

  const changeContract = async (contractId: string) => {
    setForm((old) => ({ ...old, contractId, relatedTransactionId: '' })); setOriginalFunds([]);
    if (!contractId || !reverse) return;
    try { setOriginalFunds(await api.get<Fund[]>(`/financial-settlements/funds?businessType=${businessType}&contractId=${contractId}`) || []); }
    catch (error: any) { alert(error.message || '加载原资金单失败'); }
  };

  const openCreate = () => {
    setMode('NORMAL'); setOriginalFunds([]);
    setForm({ businessType: defaultBusinessType, contractId: '', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: '', occurredAt: today(), relatedTransactionId: '', bankReference: '', ourBankAccount: '', counterpartyBankAccount: '', actualPayerName: '', actualPayeeName: '', isThirdParty: false, thirdPartyReason: '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.contractId || Number(form.amount) <= 0 || !form.occurredAt) return alert(`请选择合同并完整填写${documentName}信息`);
    if (reverse && !form.relatedTransactionId) return alert('请选择原资金单');
    if (form.isThirdParty && !form.thirdPartyReason.trim()) return alert('请填写第三方代付原因');
    setBusy(true);
    try {
      await api.post('/financial-settlements/funds', {
        ...form, businessType, amount: Number(form.amount),
        occurredAt: `${form.occurredAt}T12:00:00+08:00`,
        relatedTransactionId: reverse ? form.relatedTransactionId : undefined,
        instrumentDueDate: form.instrumentDueDate ? `${form.instrumentDueDate}T00:00:00+08:00` : undefined,
      });
      setOpen(false); await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const voidFund = async (item: Fund) => {
    if (!confirm(`确定作废${documentName} ${item.transactionNo} 吗？`)) return;
    try { await api.post(`/financial-settlements/funds/${item.id}/void`); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
  };

  const claimFund = async (item: Fund) => {
    if (!confirm(`确认将收款单 ${item.transactionNo} 认领到合同 ${item.contract.contractNo} 吗？`)) return;
    try { await api.post(`/financial-settlements/funds/${item.id}/claim`); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
  };

  const confirmFund = async (item: Fund) => {
    if (!confirm(`确认银行${receipt ? '到账' : '付款'}事实及交易双方无误吗？`)) return;
    try { await api.post(`/financial-settlements/funds/${item.id}/confirm`); setSelected(null); await load(); }
    catch (error: any) { alert(error.message); }
  };
  const openDetails = async (item: Fund) => {
    try { setSelected(await api.get<Fund>(`/financial-settlements/funds/${item.id}`)); }
    catch (error: any) { alert(error.message); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{receipt ? '出纳登记到账，业务人员认领，财务复核后再核销应收' : '展示已经实际执行的付款；采购付款须从已批准的付款申请执行'}</p></div>{receipt ? can('settlement.receipt.register') && <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />登记收款</Button> : <Button asChild><Link href="/dashboard/payment-requests"><ClipboardList className="mr-1 h-4 w-4" />前往付款申请</Link></Button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label={`${documentName}总额`} value={money(total)} icon={<Icon className={receipt ? 'text-blue-600' : 'text-orange-600'}/>} /><Metric label="已核销/退回" value={money(used)} icon={<WalletCards className="text-emerald-600"/>}/><Metric label="未核销余额" value={money(remaining)} icon={<WalletCards className="text-amber-600"/>}/></div>
    <div className="flex flex-wrap justify-end gap-2"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="flex"><Input className="w-72 rounded-r-none" placeholder={`${documentName}号、合同、对手方或银行流水`} value={search} onChange={(event) => setSearch(event.target.value)}/><Button variant="outline" className="rounded-l-none px-3"><Search className="h-4 w-4"/></Button></div></div>
    <Card className="overflow-hidden">{loading ? <Empty text={`正在加载${title}…`}/> : !available.length ? <Empty text={`暂无${documentName}`}/> : <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">{documentName}号</th><th className="p-3">业务类型</th><th className="p-3">合同</th><th className="p-3">交易对手方</th><th className="p-3">方式/流水</th><th className="p-3 text-right">发生金额</th><th className="p-3 text-right">已核销/退回</th><th className="p-3 text-right">可用余额</th><th className="p-3">发生日期</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>{available.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3 font-mono">{item.transactionNo}</td><td className="p-3">{fundType(item)}</td><td className="p-3"><div>{item.contract.contractNo}</div><div className="max-w-52 truncate text-xs text-muted-foreground">{item.contract.title}</div></td><td className="p-3">{item.counterparty.name}</td><td className="p-3"><div>{METHOD[item.paymentMethod] || item.paymentMethod}</div><div className="text-xs text-muted-foreground">{item.bankReference || '—'}</div></td><td className="p-3 text-right font-medium">{money(item.amount)}</td><td className="p-3 text-right">{money(Number(item.allocatedAmount) + Number(item.refundedAmount))}</td><td className="p-3 text-right">{money(fundBalance(item))}</td><td className="p-3">{day(item.occurredAt)}</td><td className="p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3"><Button size="sm" variant="ghost" onClick={() => void openDetails(item)}>详情</Button></td></tr>)}</tbody></table></div>}</Card>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>新建{documentName}</DialogTitle><DialogDescription>记录已经实际发生的资金收付；预收预付可先登记，待结算单确认后再核销。</DialogDescription></DialogHeader><div className="space-y-4">
      <Field label="业务场景 *"><select className={fieldClass} value={mode} onChange={(event) => changeMode(event.target.value as 'NORMAL' | 'REVERSE')}><option value="NORMAL">{receipt ? '销售收款' : '采购付款'}</option><option value="REVERSE">{receipt ? '采购退款/保证金退回' : '销售退款/保证金退回'}</option></select></Field>
      <Field label="关联合同 *"><select className={fieldClass} value={form.contractId} onChange={(event) => void changeContract(event.target.value)}><option value="">请选择合同</option>{contractOptions.map((item) => <option key={item.id} value={item.id}>{item.contractNo} · {item.title}</option>)}</select></Field>
      {selectedContract && <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"><Info label="我方签约主体" value={selectedContract.signingPartner.name}/><Info label="交易对手方" value={selectedContract.counterparty.name}/><Info label="业务单元" value={selectedContract.businessUnit?.name || '—'}/></div>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="款项类型 *"><select className={fieldClass} value={form.paymentStage} onChange={(event) => setForm((old) => ({ ...old, paymentStage: event.target.value, relatedTransactionId: '' }))}>{stageOptions(reverse, receipt).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="支付方式 *"><select className={fieldClass} value={form.paymentMethod} onChange={(event) => setForm((old) => ({ ...old, paymentMethod: event.target.value }))}>{Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      {reverse && <Field label="原资金单 *"><select className={fieldClass} value={form.relatedTransactionId} onChange={(event) => setForm((old) => ({ ...old, relatedTransactionId: event.target.value }))}><option value="">请选择原资金单</option>{originalCandidates.map((item) => <option key={item.id} value={item.id}>{item.transactionNo} · {STAGE[item.paymentStage]} · 可退 {money(fundBalance(item))}</option>)}</select></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="发生金额 *"><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((old) => ({ ...old, amount: event.target.value }))}/></Field><Field label="发生日期 *"><Input type="date" value={form.occurredAt} onChange={(event) => setForm((old) => ({ ...old, occurredAt: event.target.value }))}/></Field><Field label="我方银行账户"><Input value={form.ourBankAccount} onChange={(event) => setForm((old) => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="对方银行账户"><Input value={form.counterpartyBankAccount} onChange={(event) => setForm((old) => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="实际付款方"><Input placeholder={selectedContract?.counterparty.name || '银行流水付款户名'} value={form.actualPayerName} onChange={(event) => setForm((old) => ({ ...old, actualPayerName: event.target.value }))}/></Field><Field label="实际收款方"><Input placeholder={selectedContract?.signingPartner.name || '银行流水收款户名'} value={form.actualPayeeName} onChange={(event) => setForm((old) => ({ ...old, actualPayeeName: event.target.value }))}/></Field><Field label="银行流水号"><Input value={form.bankReference} onChange={(event) => setForm((old) => ({ ...old, bankReference: event.target.value }))}/></Field><Field label="票据/信用证编号"><Input value={form.instrumentNo} onChange={(event) => setForm((old) => ({ ...old, instrumentNo: event.target.value }))}/></Field>{['BANK_ACCEPTANCE', 'COMMERCIAL_ACCEPTANCE', 'LETTER_OF_CREDIT'].includes(form.paymentMethod) && <Field label="票据到期日"><Input type="date" value={form.instrumentDueDate} onChange={(event) => setForm((old) => ({ ...old, instrumentDueDate: event.target.value }))}/></Field>}</div>
      <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.isThirdParty} onChange={(event) => setForm((old) => ({ ...old, isThirdParty: event.target.checked }))}/>实际付款方与合同交易对手不一致（第三方代付）</label>
      {form.isThirdParty && <Field label="第三方代付原因 *"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.thirdPartyReason} onChange={(event) => setForm((old) => ({ ...old, thirdPartyReason: event.target.value }))}/></Field>}
      <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={(event) => setForm((old) => ({ ...old, remarks: event.target.value }))}/></Field>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void submit()}>确认登记</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!selected} onOpenChange={(value) => !value && setSelected(null)}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">{selected && <><DialogHeader><DialogTitle>{selected.transactionNo}</DialogTitle><DialogDescription>{fundType(selected)} · {selected.contract.contractNo}</DialogDescription></DialogHeader><div className="grid gap-3 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-3"><Info label="我方签约主体" value={selected.legalEntity.name}/><Info label="交易对手方" value={selected.counterparty.name}/><Info label="发生金额" value={money(selected.amount)}/><Info label="实际付款方" value={selected.actualPayerName || '—'}/><Info label="实际收款方" value={selected.actualPayeeName || '—'}/><Info label="是否第三方" value={selected.isThirdParty ? '是' : '否'}/><Info label="已核销/退回" value={money(Number(selected.allocatedAmount) + Number(selected.refundedAmount))}/><Info label="可用余额" value={money(fundBalance(selected))}/><Info label="发生日期" value={day(selected.occurredAt)}/><Info label="支付方式" value={METHOD[selected.paymentMethod] || selected.paymentMethod}/><Info label="银行流水号" value={selected.bankReference || '—'}/><Info label="登记人" value={selected.creator.name}/><Info label="认领人" value={selected.claimer?.name || '—'}/><Info label="财务确认人" value={selected.confirmer?.name || '—'}/></div><div className="space-y-2 text-sm"><div><span className="text-muted-foreground">我方账户：</span>{selected.ourBankAccount || '—'}</div><div><span className="text-muted-foreground">对方账户：</span>{selected.counterpartyBankAccount || '—'}</div>{selected.isThirdParty && <div><span className="text-muted-foreground">第三方原因：</span>{selected.thirdPartyReason || '—'}</div>}{selected.paymentRequest && <div><span className="text-muted-foreground">付款申请：</span>{selected.paymentRequest.requestNo}</div>}{selected.relatedTransaction && <div><span className="text-muted-foreground">原资金单：</span>{selected.relatedTransaction.transactionNo}</div>}<div><span className="text-muted-foreground">备注：</span>{selected.remarks || '—'}</div></div><SettlementAttachments attachments={selected.attachments} uploadPath={`/financial-settlements/funds/${selected.id}/attachments`} editable={selected.status === 'PENDING_CLAIM' ? can('settlement.receipt.register') : selected.status === 'PENDING_CONFIRMATION' && (receipt ? can('settlement.receipt.register') : can('settlement.payment.execute'))} onChanged={async () => { setSelected(null); await load(); }}/>{selected.allocations?.length ? <div><h3 className="mb-2 text-sm font-medium">核销记录</h3>{selected.allocations.map((entry) => <div key={entry.id} className="flex justify-between border-t py-2 text-sm"><span>{entry.settlement.settlementNo}{entry.reversedAt ? '（已撤销）' : ''}</span><b>{money(entry.amount)}</b></div>)}</div> : null}<BusinessOperationHistory logs={selected.operationLogs}/><DialogFooter>{selected.status === 'PENDING_CLAIM' && can('settlement.receipt.claim') && <Button onClick={() => void claimFund(selected)}>认领到当前合同</Button>}{selected.status === 'PENDING_CONFIRMATION' && can('settlement.fund.confirm') && <Button onClick={() => void confirmFund(selected)}>财务确认</Button>}{can('settlement.reverse') && selected.status !== 'VOIDED' && !['ALLOCATED', 'PARTIALLY_ALLOCATED'].includes(selected.status) && <Button variant="outline" onClick={() => void voidFund(selected)}>作废{documentName}</Button>}</DialogFooter></>}</DialogContent></Dialog>
  </div>;
}

function fundBalance(item: Fund) { return Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount)); }
function fundType(item: Fund) {
  if (item.paymentStage === 'REFUND') return item.businessType === 'PURCHASE' ? '供应商退款' : '客户退款';
  if (item.paymentStage === 'GUARANTEE_RETURN') return item.businessType === 'PURCHASE' ? '收回采购保证金' : '退还客户保证金';
  return `${item.businessType === 'PURCHASE' ? '采购' : '销售'}${STAGE[item.paymentStage] || item.paymentStage}`;
}
function stageOptions(reverse: boolean, receipt: boolean): Array<[string, string]> {
  if (reverse) return [['REFUND', receipt ? '供应商退款' : '客户退款'], ['GUARANTEE_RETURN', receipt ? '收回采购保证金' : '退还客户保证金']];
  return receipt
    ? [['ADVANCE', '客户预收款'], ['PROGRESS', '客户阶段款'], ['SETTLEMENT', '客户结算款'], ['FINAL', '客户尾款'], ['GUARANTEE', '收取客户保证金'], ['OTHER', '其他销售收款']]
    : [['ADVANCE', '供应商预付款'], ['PROGRESS', '供应商阶段款'], ['SETTLEMENT', '供应商结算款'], ['FINAL', '供应商尾款'], ['GUARANTEE', '支付供应商保证金'], ['OTHER', '其他采购付款']];
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <Card className="flex items-center justify-between p-4"><div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div><div className="rounded-full bg-muted p-2 [&>svg]:h-5 [&>svg]:w-5">{icon}</div></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>; }
