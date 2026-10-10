'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { SettlementAttachments, type SettlementAttachment } from '@/components/settlement/settlement-attachments';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/lib/system-dialog';

interface Fund {
  id: string; transactionNo: string; direction: 'RECEIPT' | 'PAYMENT'; category: string; businessType: 'PURCHASE' | 'SALES';
  paymentStage: string; paymentMethod: string; status: string; amount: string; allocatedAmount: string; refundedAmount: string;
  occurredAt: string; bankReference?: string | null; currency?: string | null; paymentPurpose?: string | null; ourBankAccount?: string | null; ourBankAccountName?: string | null; ourBankName?: string | null; ourBankCode?: string | null;
  counterpartyBankAccount?: string | null; counterpartyBankAccountName?: string | null; counterpartyBankName?: string | null; counterpartyBankCode?: string | null;
  actualPayerName?: string | null; actualPayeeName?: string | null; isThirdParty: boolean; thirdPartyReason?: string | null; bankAccountDifferenceReason?: string | null;
  instrumentNo?: string | null; instrumentDueDate?: string | null; remarks?: string | null;
  contract?: { id: string; contractNo: string; title: string } | null; legalEntity: { id: string; name: string }; counterparty?: { name: string } | null;
  creator: { name: string }; claimer?: { name: string } | null; confirmer?: { name: string } | null;
  paymentRequest?: { id: string; requestNo: string; status: string } | null; relatedTransaction?: { id: string; transactionNo: string } | null;
  attachments?: SettlementAttachment[]; operationLogs?: BusinessOperationLog[];
  allocations: Array<{ id: string; amount: string; reversedAt?: string | null; settlement: { id: string; settlementNo: string; direction: string; totalAmount: string } }>;
  claims: Array<{ id: string; paymentStage: string; amount: string; status: string; remarks?: string | null; contract: { id: string; contractNo: string; title: string }; order?: { id: string; orderNo: string; name?: string | null; status: string } | null; businessUnit?: { name: string } | null; counterparty: { name: string }; creator: { name: string }; confirmer?: { name: string } | null }>;
}
interface ContractOption { id: string; contractNo: string; title: string; signingPartner: { id: string; name: string }; counterparty: { name: string }; businessUnit?: { name: string } | null }
interface OrderOption { id: string; orderNo: string; name?: string | null; status: string }

const STATUS: Record<string, string> = { PENDING_CLAIM: '待认领', PARTIALLY_CLAIMED: '部分认领', PENDING_CONFIRMATION: '待财务确认', CONFIRMED: '待核销', PARTIALLY_ALLOCATED: '部分核销', ALLOCATED: '已核销/退回', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预收/预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '退款', GUARANTEE_RETURN: '保证金退回', OTHER: '其他款项' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [claimSearch, setClaimSearch] = useState('');
  const [claim, setClaim] = useState({ contractId: '', orderId: '', paymentStage: 'SETTLEMENT', amount: '', remarks: '' });
  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItem(await api.get<Fund>(`/financial-settlements/funds/${id}`)); }
    catch (error: any) { alert(error.message || '加载资金单失败'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);

  const action = async (name: 'confirm' | 'void') => {
    if (!item) return;
    const labels = { confirm: `确认银行${item.direction === 'RECEIPT' ? '到账' : '付款'}事实`, void: `作废${item.direction === 'RECEIPT' ? '收款单' : '付款单'}` };
    if (!await confirmAction(`确定${labels[name]}吗？`, { title: `${labels[name]}确认` })) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/funds/${item.id}/${name}`); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const openClaim = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const rows = await api.get<ContractOption[]>('/financial-settlements/options/contracts?direction=RECEIVABLE');
      const eligible = (rows || []).filter((row) => row.signingPartner.id === item.legalEntity.id);
      setContracts(eligible);
      setClaimSearch('');
      const contractId = item.contract?.id && eligible.some((row) => row.id === item.contract?.id) ? item.contract.id : '';
      const claimed = item.claims.reduce((sum, row) => sum + Number(row.amount), 0);
      setClaim({ contractId, orderId: '', paymentStage: item.paymentStage || 'SETTLEMENT', amount: String(Math.max(0, Number(item.amount) - claimed)), remarks: '' });
      setOrders([]);
      if (contractId) setOrders(await api.get<OrderOption[]>(`/financial-settlements/options/orders?contractId=${contractId}&direction=RECEIVABLE`) || []);
      setClaimOpen(true);
    } catch (error: any) { alert(error.message || '加载可认领合同失败'); }
    finally { setBusy(false); }
  };
  const changeClaimContract = async (contractId: string) => {
    setClaim((old) => ({ ...old, contractId, orderId: '' })); setOrders([]);
    if (!contractId) return;
    try { setOrders(await api.get<OrderOption[]>(`/financial-settlements/options/orders?contractId=${contractId}&direction=RECEIVABLE`) || []); }
    catch (error: any) { alert(error.message || '加载执行批次失败'); }
  };
  const submitClaim = async () => {
    if (!item || !claim.contractId || Number(claim.amount) <= 0) return alert('请选择销售合同并填写认领金额');
    setBusy(true);
    try { await api.post(`/financial-settlements/funds/${item.id}/claim`, { ...claim, amount: Number(claim.amount), orderId: claim.orderId || undefined }); setClaimOpen(false); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const copyText = async (value?: string | null) => { if (value) await navigator.clipboard.writeText(value); };

  if (loading) return <div className="p-12 text-center text-muted-foreground">正在加载资金单…</div>;
  if (!item) return <div className="p-12 text-center text-muted-foreground">资金单不存在或无权访问</div>;
  const documentName = item.direction === 'RECEIPT' ? '收款单' : '付款单';
  const balance = Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount));
  const claimedAmount = item.claims?.reduce((sum, row) => sum + Number(row.amount), 0) || 0;
  const claimBalance = Math.max(0, Number(item.amount) - claimedAmount);
  const filteredClaimContracts = contracts.filter((row) => `${row.contractNo} ${row.title} ${row.counterparty.name}`.toLowerCase().includes(claimSearch.trim().toLowerCase()));
  const editableAttachment = ['PENDING_CLAIM', 'PARTIALLY_CLAIMED'].includes(item.status)
    ? can('settlement.receipt.register')
    : item.status === 'PENDING_CONFIRMATION' && (item.direction === 'RECEIPT' ? can('settlement.receipt.register') : can('settlement.payment.execute'));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="font-mono text-2xl font-bold">{item.transactionNo}</h1><p className="mt-1 text-sm text-muted-foreground">{documentName} · {item.contract ? `${item.contract.contractNo} · ${item.contract.title}` : '尚未认领到合同'}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText>{item.direction === 'RECEIPT' && ['PENDING_CLAIM', 'PARTIALLY_CLAIMED'].includes(item.status) && can('settlement.receipt.claim') && <Button disabled={busy} onClick={() => void openClaim()}><Plus className="mr-1 h-4 w-4"/>新增认领</Button>}{item.status === 'PENDING_CONFIRMATION' && can('settlement.fund.confirm') && <Button disabled={busy} onClick={() => void action('confirm')}>财务确认</Button>}{can('settlement.reverse') && item.status !== 'VOIDED' && !['ALLOCATED', 'PARTIALLY_ALLOCATED'].includes(item.status) && <Button variant="outline" disabled={busy} onClick={() => void action('void')}>作废{documentName}</Button>}</div>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">{documentName}信息</h2><div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="我方签约主体" value={item.legalEntity.name}/><Info label="交易对手方" value={item.counterparty?.name || '待认领'}/><Info label="实际付款方" value={item.actualPayerName || '—'}/><Info label="实际收款方" value={item.actualPayeeName || '—'}/><Info label="发生金额" value={money(item.amount)} emphasis/><Info label="币种" value={item.currency || 'CNY'}/><Info label="已认领金额" value={money(claimedAmount)}/><Info label="待认领金额" value={money(claimBalance)} emphasis/><Info label="已核销/退回" value={money(Number(item.allocatedAmount) + Number(item.refundedAmount))}/><Info label="可用余额" value={money(balance)} emphasis/><Info label="实际付款时间" value={dateTime(item.occurredAt)}/><Info label="款项类型" value={fundType(item)}/><Info label="支付方式" value={METHOD[item.paymentMethod] || item.paymentMethod}/><Info label="电子回单号/银行流水号" value={item.bankReference || '—'}/><Info label="票据到期日" value={day(item.instrumentDueDate)}/><Info label="登记人" value={item.creator.name}/><Info label="认领人" value={item.claimer?.name || '—'}/><Info label="财务确认人" value={item.confirmer?.name || '—'}/><Info label="第三方收付" value={item.isThirdParty ? '是' : '否'}/></div><div className="mt-5 grid gap-3 border-t pt-4 text-sm"><CopyLine label="付款户名" value={item.ourBankAccountName} onCopy={copyText}/><CopyLine label="付款开户行" value={item.ourBankName} onCopy={copyText}/><CopyLine label="付款账号" value={item.ourBankAccount} onCopy={copyText}/><CopyLine label="收款户名" value={item.counterpartyBankAccountName} onCopy={copyText}/><CopyLine label="收款开户行" value={item.counterpartyBankName} onCopy={copyText}/><CopyLine label="收款账号" value={item.counterpartyBankAccount} onCopy={copyText}/><div><span className="text-muted-foreground">付款用途：</span>{item.paymentPurpose || '—'}</div>{item.bankAccountDifferenceReason && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800"><span className="font-medium">账户差异说明：</span>{item.bankAccountDifferenceReason}</div>}{item.isThirdParty && <div><span className="text-muted-foreground">第三方原因：</span>{item.thirdPartyReason || '—'}</div>}{item.paymentRequest && <div><span className="text-muted-foreground">付款申请：</span><Link className="text-primary hover:underline" href={`/dashboard/payment-requests/${item.paymentRequest.id}`}>{item.paymentRequest.requestNo}</Link></div>}{item.relatedTransaction && <div><span className="text-muted-foreground">原资金单：</span><Link className="text-primary hover:underline" href={`/dashboard/funds/${item.relatedTransaction.id}`}>{item.relatedTransaction.transactionNo}</Link></div>}<div><span className="text-muted-foreground">备注：</span>{item.remarks || '—'}</div></div></Card>

    {item.direction === 'RECEIPT' && <Card className="p-6"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">收款认领明细</h2><span className="text-sm text-muted-foreground">已认领 {money(claimedAmount)} / {money(item.amount)}</span></div>{item.claims?.length ? <div className="space-y-3">{item.claims.map((row) => <div key={row.id} className="grid gap-3 rounded-md border p-4 text-sm md:grid-cols-[1.5fr_1fr_1fr_auto]"><div><Link className="font-medium text-primary hover:underline" href={`/dashboard/contracts/${row.contract.id}`}>{row.contract.contractNo} · {row.contract.title}</Link><div className="mt-1 text-xs text-muted-foreground">{row.counterparty.name} · {row.businessUnit?.name || '未分配业务单元'}</div></div><div>{row.order ? `${row.order.orderNo} · ${row.order.name || '未命名批次'}` : '按合同认领'}</div><div>{STAGE[row.paymentStage] || row.paymentStage}<div className="mt-1 text-xs text-muted-foreground">{row.remarks || '无备注'}</div></div><div className="text-right"><b>{money(row.amount)}</b><div className="mt-1 text-xs text-muted-foreground">{row.status === 'CONFIRMED' ? '财务已确认' : '待财务确认'}</div></div></div>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">尚未认领到具体销售合同</div>}</Card>}

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">核销记录</h2>{item.allocations?.length ? <div className="space-y-3">{item.allocations.map((entry) => <Link key={entry.id} href={`/dashboard/settlements/${entry.settlement.id}`} className="flex items-center justify-between rounded-md border p-4 text-sm hover:bg-muted/30"><div><div className="font-medium">{entry.settlement.settlementNo}{entry.reversedAt ? '（已撤销）' : ''}</div><div className="mt-1 text-xs text-muted-foreground">{entry.settlement.direction === 'PAYABLE' ? '应付结算' : '应收结算'}</div></div><b>{money(entry.amount)}</b></Link>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无核销记录</div>}</Card>
    <Card className="p-6"><SettlementAttachments attachments={item.attachments} uploadPath={`/financial-settlements/funds/${item.id}/attachments`} editable={editableAttachment} onChanged={load}/></Card>
    <BusinessOperationHistory logs={item.operationLogs}/>

    <Dialog open={claimOpen} onOpenChange={setClaimOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>新增收款认领</DialogTitle><DialogDescription>一笔到账可分多次认领到不同合同或执行批次；全部认领后由财务确认。</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-[1fr_2fr]"><Field label="合同/客户搜索"><Input placeholder="合同号、标题或客户名称" value={claimSearch} onChange={(event) => setClaimSearch(event.target.value)}/></Field><Field label="销售合同 *"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={claim.contractId} onChange={(event) => void changeClaimContract(event.target.value)}><option value="">请选择合同</option>{filteredClaimContracts.map((row) => <option key={row.id} value={row.id}>{row.contractNo} · {row.counterparty.name} · {row.title}</option>)}</select></Field></div><Field label="执行批次（可选）"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={claim.orderId} onChange={(event) => setClaim((old) => ({ ...old, orderId: event.target.value }))}><option value="">按合同认领</option>{orders.map((row) => <option key={row.id} value={row.id}>{row.orderNo} · {row.name || '未命名批次'} · {row.status}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="款项类型 *"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={claim.paymentStage} onChange={(event) => setClaim((old) => ({ ...old, paymentStage: event.target.value }))}>{['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'OTHER'].map((value) => <option key={value} value={value}>{STAGE[value]}</option>)}</select></Field><Field label={`认领金额（剩余 ${money(claimBalance)}）*`}><Input type="number" min="0.01" max={claimBalance} step="0.01" value={claim.amount} onChange={(event) => setClaim((old) => ({ ...old, amount: event.target.value }))}/></Field></div><Field label="认领备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" placeholder="部分认领或特殊情况建议填写" value={claim.remarks} onChange={(event) => setClaim((old) => ({ ...old, remarks: event.target.value }))}/></Field></div><DialogFooter><Button variant="outline" onClick={() => setClaimOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void submitClaim()}>确认认领</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function fundType(item: Fund) {
  if (item.paymentStage === 'REFUND') return item.businessType === 'PURCHASE' ? '供应商退款' : '客户退款';
  if (item.paymentStage === 'GUARANTEE_RETURN') return item.businessType === 'PURCHASE' ? '收回采购保证金' : '退还客户保证金';
  return `${item.businessType === 'PURCHASE' ? '采购' : '销售'}${STAGE[item.paymentStage] || item.paymentStage}`;
}
function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function CopyLine({ label, value, onCopy }: { label: string; value?: string | null; onCopy: (value?: string | null) => Promise<void> }) { return <div className="flex items-center gap-2"><span className="text-muted-foreground">{label}：</span><span className="min-w-0 flex-1 break-all">{value || '—'}</span>{value && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={`复制${label}`} onClick={() => void onCopy(value)}><Copy className="h-3.5 w-3.5"/></Button>}</div>; }
