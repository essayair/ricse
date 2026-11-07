'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { settlementColumnTotal } from '@/lib/settlement-table-totals';
import { BusinessOperationHistory, type BusinessOperationLog } from '@/components/business-operation-history';
import { GoodsEvidence, GoodsSource, paymentMoney } from '@/components/settlement/purchase-payment-context';
import { SettlementAttachments, type SettlementAttachment } from '@/components/settlement/settlement-attachments';
import { SettlementInvoicePanel } from '@/components/settlement/settlement-invoice-panel';
import { QuantityReviewSummary } from '@/components/settlement/settlement-quantity-review';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { confirmAction, promptAction } from '@/lib/system-dialog';

interface Fund { id: string; transactionNo: string; direction: string; paymentStage: string; amount: string; allocatedAmount: string; refundedAmount: string; status: string; occurredAt: string }
interface Allocation { id: string; amount: string; reversedAt?: string | null; reversalReason?: string | null; fundTransaction: Fund; creator: { name: string }; reverser?: { name: string } | null }
interface SettlementLine { sourceSnapshot?: GoodsSource; qualityDeductionAmount?: string; pricingMethod?: string | null; measuredGradePct?: string | null; measuredRecoveryPct?: string | null; gradeRateExTax?: string | null; recoveryDeductionPerTonExTax?: string | null; id: string; orderId?: string | null; orderNo?: string | null; orderName?: string | null; quantity?: string | null; unit?: string | null; unitPrice?: string | null; adjustmentAmount: string; totalAmount: string; remarks?: string | null; order?: { id: string; status: string } | null }
interface Settlement {
  id: string; settlementNo: string; direction: 'RECEIVABLE' | 'PAYABLE'; settlementScope: string; stageName?: string | null; status: string; createdBy: string;
  qualityDeductionAmount?: string;
  grossAmount: string; adjustmentAmount: string; totalAmount: string; settledAmount: string; dueDate?: string | null; remarks?: string | null;
  contract: { id: string; contractNo: string; title: string }; businessUnit?: { name: string } | null;
  legalEntity: { name: string }; counterparty: { name: string }; creator: { name: string }; confirmer?: { name: string } | null;
  lines: SettlementLine[]; allocations: Allocation[]; attachments?: SettlementAttachment[]; operationLogs?: BusinessOperationLog[];
  approvalTasks?: Array<{ id: string; step: number; round: number; nodeName: string; roleName?: string | null; status: string; comment?: string | null; assignee: { id: string; name: string }; actedBy?: { name: string } | null; actedAt?: string | null }>;
}

const STATUS: Record<string, string> = { DRAFT: '草稿', PENDING_APPROVAL: '结算待审批', REJECTED: '结算已驳回', CONFIRMED: '待收付', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清', VOIDED: '已作废' };
const SCOPE: Record<string, string> = { GOODS: '实际货物结算', BATCH: '执行批次结算', CONTRACT_STAGE: '合同阶段结算', CONTRACT_FINAL: '合同最终结算', ADJUSTMENT: '调整结算' };
const ORDER_STATUS: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', DISPATCHED: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const STAGE: Record<string, string> = { ADVANCE: '预收预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', OTHER: '其他款项' };
const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tons = (value: string | number | null | undefined) => value == null ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const inboundDay = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
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
  const [userId, setUserId] = useState('');
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
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdmin(user.role === 'ADMIN'); setUserId(user.id || ''); setPermissions(user.permissions || []); }
    catch { setIsAdmin(false); setPermissions([]); }
  }, []);

  const candidates = useMemo(() => funds.filter((fund) => item
    && fund.direction === (item.direction === 'PAYABLE' ? 'PAYMENT' : 'RECEIPT')
    && ['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(fund.status)
    && !['GUARANTEE', 'REFUND', 'GUARANTEE_RETURN'].includes(fund.paymentStage)
    && availableFund(fund) > 0), [funds, item]);

  const doAction = async (action: 'confirm' | 'void') => {
    if (!item) return;
    if (action === 'void' && !await confirmAction(`确定作废结算单 ${item.settlementNo} 吗？`)) return;
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
    const reason = await promptAction('请输入撤销核销原因');
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/allocations/${entry.id}/reverse`, { reason: reason.trim() }); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };
  const review = async (decision: 'approve' | 'reject') => {
    if (!item) return;
    const reason = decision === 'reject' ? await promptAction('请输入结算审批驳回原因') : undefined;
    if (decision === 'reject' && !reason?.trim()) return;
    if (decision === 'approve' && !await confirmAction(`确认批准结算单 ${item.settlementNo}？`)) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/${item.id}/${decision}`, decision === 'reject' ? { reason: reason?.trim() } : { comment: '同意' }); await load(); }
    catch (error: any) { alert(error.message || '结算审批失败'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">正在加载结算单…</div>;
  if (!item) return <div className="p-12 text-center text-muted-foreground">结算单不存在或无权访问</div>;
  const cashLabel = item.direction === 'PAYABLE' ? '付款' : '收款';
  const dueDateLabel = item.direction === 'PAYABLE' ? '约定付款到期日' : '约定收款到期日';
  const outstanding = Number(item.totalAmount) - Number(item.settledAmount);
  const goodsPurchase = item.settlementScope === 'GOODS';
  const quantityReview = item.lines.find(line => line.sourceSnapshot?.settlementQuantityReview)?.sourceSnapshot?.settlementQuantityReview;
  const canReview = item.status === 'PENDING_APPROVAL' && can('settlement.approve')
    && (isAdmin || item.approvalTasks?.some(task => task.status === 'PENDING' && task.assignee.id === userId));

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="font-mono text-2xl font-bold">{item.direction === 'PAYABLE' ? '采购结算单 · ' : ''}{item.settlementNo}</h1><p className="mt-1 text-sm text-muted-foreground">{SCOPE[item.settlementScope]} · {item.contract.contractNo} · {item.contract.title}</p></div></div>
      <div className="flex flex-wrap items-center gap-2">{item.direction === 'PAYABLE' && ['CONFIRMED', 'PARTIALLY_SETTLED'].includes(item.status) && can('settlement.payment.apply') && <Button asChild><Link href={`/dashboard/payment-requests/new?contractId=${item.contract.id}&settlementId=${item.id}`}>按本结算申请付款</Link></Button>}<StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText>{item.status === 'DRAFT' && item.settlementScope === 'GOODS' && (isAdmin || item.createdBy === userId) && can('settlement.create') && <Button variant="outline" asChild><Link href={`/dashboard/settlements/${item.id}/edit`}>编辑草稿</Link></Button>}{['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status) && <Button variant="outline" asChild><Link href={`/dashboard/settlements/${item.id}/print`}><Printer className="mr-1.5 h-4 w-4"/>打印存档</Link></Button>}{item.status === 'DRAFT' && can('settlement.confirm') && <Button disabled={busy} onClick={() => void doAction('confirm')}>确认或提交审批</Button>}{canReview && <><Button disabled={busy} onClick={() => void review('approve')}>批准结算</Button><Button variant="outline" disabled={busy} onClick={() => void review('reject')}>驳回</Button></>}{['CONFIRMED', 'PARTIALLY_SETTLED'].includes(item.status) && can('settlement.allocate') && <Button disabled={busy} onClick={openAllocation}>核销{cashLabel}</Button>}{!['VOIDED', 'SETTLED'].includes(item.status) && can('settlement.reverse') && <Button variant="outline" disabled={busy} onClick={() => void doAction('void')}>作废</Button>}</div>
    </div>

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">基本信息</h2><div className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="我方签约主体" value={item.legalEntity.name}/><Info label="交易对手方" value={item.counterparty.name}/><Info label="业务单元（事业部）" value={item.businessUnit?.name || '—'}/><Info label={dueDateLabel} value={day(item.dueDate)}/><Info label="结算原金额" value={money(item.grossAmount)}/><Info label="价格/质量等加减项" value={money(item.adjustmentAmount)}/><Info label="结算金额" value={money(item.totalAmount)} emphasis/><Info label="未结金额" value={money(outstanding)} emphasis/><Info label="制单人" value={item.creator.name}/><Info label="确认人" value={item.confirmer?.name || '—'}/></div>{item.remarks && <div className="mt-5 border-t pt-4 text-sm"><span className="text-muted-foreground">备注：</span>{item.remarks}</div>}</Card>
    {Boolean(item.approvalTasks?.length) && <Card className="space-y-3 p-5"><h2 className="font-semibold">结算审批记录</h2><p className="text-xs text-muted-foreground">协商数量、改用其他计量或检测依据、其他加减项复用现有审批节点；全部通过后才形成正式应收应付。</p><div className="space-y-2">{item.approvalTasks?.map(task => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div>第 {task.round} 轮 · {task.step}. {task.nodeName}（{task.roleName || '审批人'}）· {task.assignee.name}</div><div>{task.status === 'PENDING' ? '待审批' : task.status === 'APPROVED' ? '已通过' : task.status === 'REJECTED' ? '已驳回' : task.status === 'WAITING' ? '待前序节点' : task.status === 'CANCELLED' ? '已取消' : '他人已处理'}{task.comment ? ` · ${task.comment}` : ''}</div></div>)}</div></Card>}

    {goodsPurchase && item.lines.length > 0 && <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">逐车结算明细</h2><p className="mt-1 text-xs text-muted-foreground">重量与水分来自制单时的业务依据快照；未保存过的历史字段显示“—”。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="p-2">{item.direction === 'PAYABLE' ? '入库' : '交付'}日期 / 运单</th><th className="p-2">车牌 / 物料</th><th className="p-2 text-right">水分（%）</th><th className="p-2 text-right">毛重（吨）</th><th className="p-2 text-right">皮重（吨）</th><th className="p-2 text-right">净重（吨）</th><th className="p-2 text-right">参考干基（吨）</th><th className="p-2 text-right">结算数量（吨）</th><th className="p-2 text-right">含税单价（元/吨）</th><th className="p-2 text-right">质量扣款（元）</th><th className="p-2 text-right">其他加减项（元）</th><th className="p-2 text-right">含税金额（元）</th></tr></thead><tbody>{item.lines.map(line => { const source = line.sourceSnapshot; return <tr key={line.id} className="border-t"><td className="p-2">{inboundDay(item.direction === 'PAYABLE' ? source?.inboundDate : source?.salesCompletionConfirmedAt)}<div className="text-xs text-muted-foreground">{source?.waybillNo || '—'}</div></td><td className="p-2">{source?.plateNo || '—'}<div className="text-xs text-muted-foreground">{source?.materialName || '—'}</div></td><td className="p-2 text-right">{source?.measuredMoisturePct ?? '—'}</td><td className="p-2 text-right">{tons(source?.grossWeight)}</td><td className="p-2 text-right">{tons(source?.tareWeight)}</td><td className="p-2 text-right">{tons(source?.netWeight)}</td><td className="p-2 text-right">{tons(source?.dryQuantity)}</td><td className="p-2 text-right">{tons(line.quantity)}</td><td className="p-2 text-right">{money(line.unitPrice)}{line.pricingMethod === 'GRADE_TIER' && line.measuredGradePct != null && <div className="text-xs text-muted-foreground">CaF₂ {Number(line.measuredGradePct)}% · {Number(line.gradeRateExTax)} 元/度</div>}</td><td className="p-2 text-right">{money(line.qualityDeductionAmount)}{line.measuredRecoveryPct != null && <div className="text-xs text-muted-foreground">含回收率扣价：回收率 {Number(line.measuredRecoveryPct)}%，{Number(line.recoveryDeductionPerTonExTax || 0)} 元/吨（不含税）</div>}</td><td className="p-2 text-right">{money(line.adjustmentAmount)}</td><td className="p-2 text-right font-medium">{money(line.totalAmount)}</td></tr>; })}</tbody><tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={3} className="p-3">合计（{item.lines.length} 车）</td>{(['grossWeight', 'tareWeight', 'netWeight', 'dryQuantity'] as const).map(key => <td key={key} className="p-3 text-right">{tons(settlementColumnTotal(item.lines.map(line => line.sourceSnapshot?.[key])))}</td>)}<td className="p-3 text-right">{tons(settlementColumnTotal(item.lines.map(line => line.quantity)))}</td><td className="p-3 text-right text-muted-foreground">—</td><td className="p-3 text-right">{money(item.qualityDeductionAmount)}</td><td className="p-3 text-right">{money(item.adjustmentAmount)}</td><td className="p-3 text-right">{money(item.totalAmount)}</td></tr></tfoot></table></div></Card>}
    {!goodsPurchase && item.lines.length > 0 && <Card className="overflow-hidden"><div className="border-b p-4 font-semibold">执行批次明细</div><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">批次</th><th className="p-3">当前状态</th><th className="p-3 text-right">数量</th><th className="p-3 text-right">单价</th><th className="p-3 text-right">加减项</th><th className="p-3">调整原因</th><th className="p-3 text-right">结算金额</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id} className="border-t"><td className="p-3">{line.orderId ? <Link className="font-medium text-primary hover:underline" href={`/dashboard/orders/${line.orderId}`}>{line.orderNo} · {line.orderName}</Link> : `${line.orderNo || '—'} · ${line.orderName || '—'}`}</td><td className="p-3">{line.order ? <StatusText status={line.order.status}>{ORDER_STATUS[line.order.status] || line.order.status}</StatusText> : '—'}</td><td className="p-3 text-right">{line.quantity || '—'} {line.unit || ''}</td><td className="p-3 text-right">{money(line.unitPrice)}</td><td className="p-3 text-right">{money(line.adjustmentAmount)}</td><td className="p-3">{line.remarks || '—'}</td><td className="p-3 text-right font-medium">{money(line.totalAmount)}</td></tr>)}</tbody><tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={2} className="p-3">合计（{item.lines.length} 项）</td><td className="p-3 text-right">{[...new Set(item.lines.map(line => line.unit || '未标单位'))].map(unit => <div key={unit}>{tons(settlementColumnTotal(item.lines.filter(line => (line.unit || '未标单位') === unit).map(line => line.quantity)))} {unit}</div>)}</td><td className="p-3 text-right text-muted-foreground">—</td><td className="p-3 text-right">{money(item.adjustmentAmount)}</td><td className="p-3"/><td className="p-3 text-right">{money(item.totalAmount)}</td></tr></tfoot></table></div></Card>}

    {item.direction === 'PAYABLE' && <Card className="space-y-4 p-5"><div className="grid gap-4 text-sm sm:grid-cols-4"><div>货物原金额<p className="mt-1 font-medium">{paymentMoney(item.grossAmount)}</p></div><div>质量价格扣款<p className="mt-1 font-medium">{paymentMoney(item.qualityDeductionAmount)}</p></div><div>其他加减项<p className="mt-1 font-medium">{paymentMoney(item.adjustmentAmount)}</p></div><div>结算净额<p className="mt-1 font-medium">{paymentMoney(item.totalAmount)}</p></div></div>{item.lines.some(l => l.sourceSnapshot) && <GoodsEvidence sources={item.lines.map(l => l.sourceSnapshot).filter(Boolean) as GoodsSource[]}/>}</Card>}
    {quantityReview?.differences.length ? <Card className="space-y-3 p-5"><h2 className="font-semibold">数量差异确认</h2><QuantityReviewSummary review={quantityReview} /><p className="whitespace-pre-wrap text-sm"><span className="text-muted-foreground">双方确认说明：</span>{quantityReview.reason}</p><p className="text-xs text-muted-foreground">{quantityReview.recordedByName || '经办人'} · {quantityReview.recordedAt ? new Date(quantityReview.recordedAt).toLocaleString('zh-CN') : '—'} · 按实际数量生成，线下签字盖章</p></Card> : null}
    <SettlementAttachments title="结算依据与双方盖章文件" attachments={item.attachments} uploadPath={`/financial-settlements/${item.id}/attachments`} editable={['DRAFT', 'CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status) && can('settlement.create')} canDelete={item.status === 'DRAFT' && can('settlement.create')} onChanged={load} />

    {item.status !== 'VOIDED' && <SettlementInvoicePanel settlementId={item.id} status={item.status} canCreate={can('settlement.create')} canVoid={can('settlement.reverse')} materialName={item.lines[0]?.sourceSnapshot?.materialName} />}

    <Card className="p-6"><h2 className="mb-4 text-base font-semibold">核销记录</h2>{item.allocations.length ? <div className="space-y-3">{item.allocations.map((entry) => <div key={entry.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 text-sm ${entry.reversedAt ? 'bg-muted/40 text-muted-foreground' : ''}`}><div><div className="font-medium">{entry.fundTransaction.transactionNo} · {STAGE[entry.fundTransaction.paymentStage] || entry.fundTransaction.paymentStage}</div><div className="mt-1 text-xs text-muted-foreground">{day(entry.fundTransaction.occurredAt)} · 经办人 {entry.creator.name}{entry.reversedAt ? ` · 已撤销：${entry.reversalReason || '—'}` : ''}</div></div><div className="flex items-center gap-3"><b>{money(entry.amount)}</b>{can('settlement.reverse') && !entry.reversedAt && <Button size="sm" variant="outline" disabled={busy} onClick={() => void reverse(entry)}><RotateCcw className="mr-1 h-3.5 w-3.5"/>撤销核销</Button>}</div></div>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无核销记录</div>}</Card>
    <BusinessOperationHistory logs={item.operationLogs}/>

    <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}><DialogContent><DialogHeader><DialogTitle>核销{cashLabel}</DialogTitle><DialogDescription>仅显示当前合同、法律主体和交易对手一致的可用资金流水。</DialogDescription></DialogHeader><Field label={`${cashLabel}流水`}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={allocation.fundTransactionId} onChange={(event) => { const fund = candidates.find((candidate) => candidate.id === event.target.value); setAllocation({ fundTransactionId: event.target.value, amount: fund ? String(Math.min(outstanding, availableFund(fund))) : '' }); }}><option value="">请选择</option>{candidates.map((fund) => <option key={fund.id} value={fund.id}>{fund.transactionNo} · 可用 {money(availableFund(fund))}</option>)}</select></Field>{!candidates.length && <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">当前没有可核销的资金流水</div>}<Field label="本次核销金额"><Input type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => setAllocation((old) => ({ ...old, amount: event.target.value }))}/></Field><DialogFooter><Button variant="outline" onClick={() => setAllocationOpen(false)}>取消</Button><Button disabled={busy || !candidates.length} onClick={() => void allocate()}>确认核销</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
