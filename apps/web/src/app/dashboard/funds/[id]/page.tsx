'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { SettlementAttachments, type SettlementAttachment } from '@/components/settlement/settlement-attachments';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Fund {
  id: string; transactionNo: string; direction: 'RECEIPT' | 'PAYMENT'; category: string; businessType: 'PURCHASE' | 'SALES';
  paymentStage: string; paymentMethod: string; status: string; amount: string; allocatedAmount: string; refundedAmount: string;
  occurredAt: string; bankReference?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null;
  actualPayerName?: string | null; actualPayeeName?: string | null; isThirdParty: boolean; thirdPartyReason?: string | null;
  instrumentNo?: string | null; instrumentDueDate?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; claimer?: { name: string } | null; confirmer?: { name: string } | null;
  paymentRequest?: { id: string; requestNo: string; status: string } | null; relatedTransaction?: { id: string; transactionNo: string } | null;
  attachments?: SettlementAttachment[]; operationLogs?: BusinessOperationLog[];
  allocations: Array<{ id: string; amount: string; reversedAt?: string | null; settlement: { id: string; settlementNo: string; direction: string; totalAmount: string } }>;
}

const STATUS: Record<string, string> = { PENDING_CLAIM: '待认领', PENDING_CONFIRMATION: '待财务确认', CONFIRMED: '待核销', PARTIALLY_ALLOCATED: '部分核销', ALLOCATED: '已核销/退回', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预收/预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '退款', GUARANTEE_RETURN: '保证金退回', OTHER: '其他款项' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';

export default function FundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
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

  const action = async (name: 'claim' | 'confirm' | 'void') => {
    if (!item) return;
    const labels = { claim: '认领当前收款单', confirm: `确认银行${item.direction === 'RECEIPT' ? '到账' : '付款'}事实`, void: `作废${item.direction === 'RECEIPT' ? '收款单' : '付款单'}` };
    if (!confirm(`确定${labels[name]}吗？`)) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/funds/${item.id}/${name}`); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">正在加载资金单…</div>;
  if (!item) return <div className="p-12 text-center text-muted-foreground">资金单不存在或无权访问</div>;
  const documentName = item.direction === 'RECEIPT' ? '收款单' : '付款单';
  const balance = Math.max(0, Number(item.amount) - Number(item.allocatedAmount) - Number(item.refundedAmount));
  const editableAttachment = item.status === 'PENDING_CLAIM'
    ? can('settlement.receipt.register')
    : item.status === 'PENDING_CONFIRMATION' && (item.direction === 'RECEIPT' ? can('settlement.receipt.register') : can('settlement.payment.execute'));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="font-mono text-2xl font-bold">{item.transactionNo}</h1><p className="mt-1 text-sm text-muted-foreground">{documentName} · {item.contract.contractNo} · {item.contract.title}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText>{item.status === 'PENDING_CLAIM' && can('settlement.receipt.claim') && <Button disabled={busy} onClick={() => void action('claim')}>认领到当前合同</Button>}{item.status === 'PENDING_CONFIRMATION' && can('settlement.fund.confirm') && <Button disabled={busy} onClick={() => void action('confirm')}>财务确认</Button>}{can('settlement.reverse') && item.status !== 'VOIDED' && !['ALLOCATED', 'PARTIALLY_ALLOCATED'].includes(item.status) && <Button variant="outline" disabled={busy} onClick={() => void action('void')}>作废{documentName}</Button>}</div>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">{documentName}信息</h2><div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="我方签约主体" value={item.legalEntity.name}/><Info label="交易对手方" value={item.counterparty.name}/><Info label="实际付款方" value={item.actualPayerName || '—'}/><Info label="实际收款方" value={item.actualPayeeName || '—'}/><Info label="发生金额" value={money(item.amount)} emphasis/><Info label="已核销/退回" value={money(Number(item.allocatedAmount) + Number(item.refundedAmount))}/><Info label="可用余额" value={money(balance)} emphasis/><Info label="发生日期" value={day(item.occurredAt)}/><Info label="款项类型" value={fundType(item)}/><Info label="支付方式" value={METHOD[item.paymentMethod] || item.paymentMethod}/><Info label="银行流水号" value={item.bankReference || '—'}/><Info label="票据到期日" value={day(item.instrumentDueDate)}/><Info label="登记人" value={item.creator.name}/><Info label="认领人" value={item.claimer?.name || '—'}/><Info label="财务确认人" value={item.confirmer?.name || '—'}/><Info label="第三方收付" value={item.isThirdParty ? '是' : '否'}/></div><div className="mt-5 grid gap-3 border-t pt-4 text-sm"><div><span className="text-muted-foreground">我方账户：</span>{item.ourBankAccount || '—'}</div><div><span className="text-muted-foreground">对方账户：</span>{item.counterpartyBankAccount || '—'}</div>{item.isThirdParty && <div><span className="text-muted-foreground">第三方原因：</span>{item.thirdPartyReason || '—'}</div>}{item.paymentRequest && <div><span className="text-muted-foreground">付款申请：</span><Link className="text-primary hover:underline" href={`/dashboard/payment-requests/${item.paymentRequest.id}`}>{item.paymentRequest.requestNo}</Link></div>}{item.relatedTransaction && <div><span className="text-muted-foreground">原资金单：</span><Link className="text-primary hover:underline" href={`/dashboard/funds/${item.relatedTransaction.id}`}>{item.relatedTransaction.transactionNo}</Link></div>}<div><span className="text-muted-foreground">备注：</span>{item.remarks || '—'}</div></div></Card>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">核销记录</h2>{item.allocations?.length ? <div className="space-y-3">{item.allocations.map((entry) => <Link key={entry.id} href={`/dashboard/settlements/${entry.settlement.id}`} className="flex items-center justify-between rounded-md border p-4 text-sm hover:bg-muted/30"><div><div className="font-medium">{entry.settlement.settlementNo}{entry.reversedAt ? '（已撤销）' : ''}</div><div className="mt-1 text-xs text-muted-foreground">{entry.settlement.direction === 'PAYABLE' ? '应付结算' : '应收结算'}</div></div><b>{money(entry.amount)}</b></Link>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无核销记录</div>}</Card>
    <Card className="p-6"><SettlementAttachments attachments={item.attachments} uploadPath={`/financial-settlements/funds/${item.id}/attachments`} editable={editableAttachment} onChanged={load}/></Card>
    <BusinessOperationHistory logs={item.operationLogs}/>
  </div>;
}

function fundType(item: Fund) {
  if (item.paymentStage === 'REFUND') return item.businessType === 'PURCHASE' ? '供应商退款' : '客户退款';
  if (item.paymentStage === 'GUARANTEE_RETURN') return item.businessType === 'PURCHASE' ? '收回采购保证金' : '退还客户保证金';
  return `${item.businessType === 'PURCHASE' ? '采购' : '销售'}${STAGE[item.paymentStage] || item.paymentStage}`;
}
function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</div></div>; }
