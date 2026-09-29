'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { SettlementAttachments, type SettlementAttachment } from '@/components/settlement/settlement-attachments';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TemporalInput } from '@/components/ui/temporal-input';

interface Approval { id: string; nodeName: string; roleName?: string | null; approvalMode: string; step: number; round: number; status: string; comment?: string | null; actedAt?: string | null; assignee: { id: string; name: string }; actedBy?: { id: string; name: string } | null }
interface PaymentRequest {
  id: string; requestNo: string; status: string; businessType: 'PURCHASE' | 'SALES'; paymentStage: string; paymentMethod: string; amount: string;
  requestedPayDate?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null; actualPayeeName?: string | null;
  isThirdParty: boolean; thirdPartyReason?: string | null; purpose?: string | null; remarks?: string | null; rejectionReason?: string | null;
  contract: { id: string; contractNo: string; title: string }; settlement?: { id: string; settlementNo: string } | null;
  relatedTransaction?: { id: string; transactionNo: string } | null; businessUnit?: { name: string } | null;
  legalEntity: { name: string }; counterparty: { name: string }; creator: { name: string }; submitter?: { name: string } | null;
  approver?: { name: string } | null; fundTransaction?: { id: string; transactionNo: string; status: string } | null;
  attachments?: SettlementAttachment[]; approvals?: Approval[]; operationLogs?: BusinessOperationLog[];
}

const STATUS: Record<string, string> = { DRAFT: '草稿', PENDING_APPROVAL: '待审批', APPROVED: '已批准待创建付款单', REJECTED: '已驳回', PAID: '已创建付款单', VOIDED: '已作废' };
const APPROVAL_STATUS: Record<string, string> = { WAITING: '等待前序节点', PENDING: '待审批', APPROVED: '已通过', REJECTED: '已驳回', OTHERS_APPROVED: '他人已审批', OTHERS_REJECTED: '他人已驳回', CANCELLED: '已取消' };
const STAGE: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '客户退款', GUARANTEE_RETURN: '退还客户保证金', OTHER: '其他付款' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value?: string | null) => value ? value.slice(0, 10) : '—';
const today = () => new Date().toLocaleDateString('sv-SE');

export default function PaymentRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [execute, setExecute] = useState({ occurredAt: today(), bankReference: '', ourBankAccount: '', counterpartyBankAccount: '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
  const can = (code: string) => isAdmin || permissions.includes(code) || permissions.includes('settlement.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try { setItem(await api.get<PaymentRequest>(`/financial-settlements/payment-requests/${id}`)); }
    catch (error: any) { alert(error.message || '加载付款申请失败'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setUserId(user.id || ''); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setUserId(''); setPermissions([]); }
  }, []);

  const activeRound = item?.approvals?.reduce((max, approval) => Math.max(max, approval.round), 0) || 0;
  const activeApprovals = useMemo(() => item?.approvals?.filter((approval) => approval.round === activeRound) || [], [item, activeRound]);
  const canReview = Boolean(item && item.status === 'PENDING_APPROVAL' && can('settlement.payment.approve')
    && (isAdmin || activeApprovals.some((approval) => approval.status === 'PENDING' && approval.assignee.id === userId)));

  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    try { await api.post(path, body); setExecuteOpen(false); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    const comment = prompt('请输入审批意见', '同意');
    if (comment === null) return;
    await action(`/financial-settlements/payment-requests/${id}/approve`, { comment: comment.trim() || '同意' });
  };
  const reject = async () => {
    const reason = prompt('请输入驳回原因');
    if (!reason?.trim()) return;
    await action(`/financial-settlements/payment-requests/${id}/reject`, { reason: reason.trim() });
  };
  const openExecute = () => {
    if (!item) return;
    setExecute({ occurredAt: today(), bankReference: '', ourBankAccount: item.ourBankAccount || '', counterpartyBankAccount: item.counterpartyBankAccount || '', instrumentNo: '', instrumentDueDate: '', remarks: '' });
    setExecuteOpen(true);
  };
  const createPayment = async () => {
    if (!execute.occurredAt) return alert('请选择实际付款日期');
    await action(`/financial-settlements/payment-requests/${id}/execute`, { ...execute, occurredAt: `${execute.occurredAt}T12:00:00+08:00`, instrumentDueDate: execute.instrumentDueDate ? `${execute.instrumentDueDate}T00:00:00+08:00` : undefined });
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">正在加载付款申请…</div>;
  if (!item) return <div className="p-12 text-center text-muted-foreground">付款申请不存在或无权访问</div>;
  const printable = ['APPROVED', 'PAID'].includes(item.status);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="font-mono text-2xl font-bold">{item.requestNo}</h1><p className="mt-1 text-sm text-muted-foreground">{item.contract.contractNo} · {item.contract.title}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText>{printable && <Button variant="outline" asChild><Link href={`/dashboard/payment-requests/${item.id}/print`}><Printer className="mr-1.5 h-4 w-4"/>打印存档</Link></Button>}{['DRAFT', 'REJECTED'].includes(item.status) && can('settlement.payment.apply') && <Button disabled={busy} onClick={() => void action(`/financial-settlements/payment-requests/${id}/submit`)}><Send className="mr-1 h-4 w-4"/>提交审批</Button>}{canReview && <><Button variant="outline" disabled={busy} onClick={() => void reject()}>驳回</Button><Button disabled={busy} onClick={() => void approve()}>审批通过</Button></>}{item.status === 'APPROVED' && can('settlement.payment.execute') && <Button disabled={busy} onClick={openExecute}>创建付款单</Button>}{!['PAID', 'VOIDED'].includes(item.status) && can('settlement.payment.apply') && <Button variant="outline" disabled={busy} onClick={() => void action(`/financial-settlements/payment-requests/${id}/void`)}>作废</Button>}</div>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">付款申请信息</h2><div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="我方付款主体" value={item.legalEntity.name}/><Info label="合同交易对手" value={item.counterparty.name}/><Info label="实际收款方" value={item.actualPayeeName || item.counterparty.name}/><Info label="业务单元（事业部）" value={item.businessUnit?.name || '—'}/><Info label="申请金额" value={money(item.amount)} emphasis/><Info label="款项类型" value={STAGE[item.paymentStage] || item.paymentStage}/><Info label="支付方式" value={METHOD[item.paymentMethod] || item.paymentMethod}/><Info label="计划付款日期" value={day(item.requestedPayDate)}/><Info label={item.businessType === 'PURCHASE' ? '应付结算单' : '原收款单'} value={item.businessType === 'PURCHASE' ? item.settlement?.settlementNo || '预付款/暂未关联' : item.relatedTransaction?.transactionNo || '—'}/><Info label="申请人" value={item.creator.name}/><Info label="提交人" value={item.submitter?.name || '—'}/><Info label="付款单" value={item.fundTransaction?.transactionNo || '—'}/></div>{item.settlement && <div className="mt-4"><Button size="sm" variant="outline" asChild><Link href={`/dashboard/settlements/${item.settlement.id}`}>查看关联结算单及执行批次状态</Link></Button></div>}<div className="mt-5 grid gap-3 border-t pt-4 text-sm"><div><span className="text-muted-foreground">付款用途：</span>{item.purpose || '—'}</div><div><span className="text-muted-foreground">我方付款账户：</span>{item.ourBankAccount || '—'}</div><div><span className="text-muted-foreground">对方收款账户：</span>{item.counterpartyBankAccount || '—'}</div>{item.isThirdParty && <div><span className="text-muted-foreground">第三方收款原因：</span>{item.thirdPartyReason || '—'}</div>}<div><span className="text-muted-foreground">备注：</span>{item.remarks || '—'}</div></div></Card>

    {item.rejectionReason && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">驳回原因：{item.rejectionReason}</div>}
    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">审批进度{activeRound ? `（第 ${activeRound} 轮）` : ''}</h2>{activeApprovals.length ? <div className="space-y-3">{activeApprovals.map((approval) => <div key={approval.id} className="grid items-center gap-3 rounded-md border p-4 text-sm md:grid-cols-[100px_1fr_1fr_auto]"><div>第 {approval.step} 级</div><div><div className="font-medium">{approval.nodeName}</div><div className="text-xs text-muted-foreground">{approval.roleName || '审批角色'} · {approval.approvalMode === 'ANY' ? '或签' : '会签'}</div></div><div>{approval.assignee.name}{approval.actedBy && approval.actedBy.id !== approval.assignee.id ? `（由 ${approval.actedBy.name} 处理）` : ''}{approval.comment && <div className="mt-1 text-xs text-muted-foreground">意见：{approval.comment}</div>}</div><StatusText status={approval.status}>{APPROVAL_STATUS[approval.status] || approval.status}</StatusText></div>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">尚未提交审批</div>}</Card>
    <Card className="p-6"><SettlementAttachments attachments={item.attachments} uploadPath={`/financial-settlements/payment-requests/${item.id}/attachments`} editable={['DRAFT', 'REJECTED'].includes(item.status) && can('settlement.payment.apply')} onChanged={load}/></Card>
    <BusinessOperationHistory logs={item.operationLogs}/>

    <Dialog open={executeOpen} onOpenChange={setExecuteOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>创建付款单</DialogTitle><DialogDescription>依据实际银行付款结果登记，创建后进入付款管理的待财务确认状态。</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="实际付款日期 *"><TemporalInput type="date" value={execute.occurredAt} onChange={(event) => setExecute((old) => ({ ...old, occurredAt: event.target.value }))}/></Field><Field label="银行流水号"><Input value={execute.bankReference} onChange={(event) => setExecute((old) => ({ ...old, bankReference: event.target.value }))}/></Field><Field label="我方付款账户"><Input value={execute.ourBankAccount} onChange={(event) => setExecute((old) => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="对方收款账户"><Input value={execute.counterpartyBankAccount} onChange={(event) => setExecute((old) => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="票据/信用证编号"><Input value={execute.instrumentNo} onChange={(event) => setExecute((old) => ({ ...old, instrumentNo: event.target.value }))}/></Field><Field label="票据到期日"><TemporalInput type="date" value={execute.instrumentDueDate} onChange={(event) => setExecute((old) => ({ ...old, instrumentDueDate: event.target.value }))}/></Field></div><Field label="付款备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={execute.remarks} onChange={(event) => setExecute((old) => ({ ...old, remarks: event.target.value }))}/></Field><DialogFooter><Button variant="outline" onClick={() => setExecuteOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void createPayment()}>确认创建付款单</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
