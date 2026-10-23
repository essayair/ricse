'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { promptAction } from '@/lib/system-dialog';

export const paymentMoney = (value: unknown) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const QUALITY_LABELS: Record<string, string> = { PENDING: '待检测', PASS: '合格接收', LEGACY: '历史验收', DEDUCTION_PENDING: '待确认扣款接收', ACCEPT_WITH_DEDUCTION: '已确认扣款接收', REJECT: '拒收', REVIEW_REQUIRED: '待人工判定' };
export interface GoodsSource {
  id: string; orderId: string; orderNo: string; orderName: string; orderStatus: string; waybillId: string; waybillNo: string; plateNo?: string;
  materialName?: string; totalQuantity: number; remainingQuantity: number; settlementQuantity?: number; unitPrice: number; deductionPerTon: number; qualityDisposition: string;
  qualityTaskId?: string; decisionVersion?: number; taskNo?: string; reportNo?: string; ticketNo?: string; weighTicketId?: string; available: boolean; reasons: string[];
  inboundNo?: string;
  signature: string; totalAmount: number; evaluation?: { items?: Array<{ name: string; reason: string; deductionPerTon?: number }> }; qualityAcceptance?: { name: string; acceptedAt: string; reason: string };
}
export interface PaymentContext {
  contract: any; orders: Array<{ id: string; orderNo: string; name: string; status: string }>;
  sources: GoodsSource[];
  settlements: Array<{ id: string; settlementNo: string; status: string; totalAmount: string; settledAmount: string; availableAmount: number; qualityDeductionAmount: string; lines: Array<{ sourceSnapshot?: GoodsSource }> }>;
  summary: { nominalAmount: number; formalAmount: number; paidAmount: number; unpaidCommitment: number; availableContract: number; availableAdvance: number; unassignedFundAmount: number };
  funds: Array<{ id: string; transactionNo: string; status: string; available: number; unassigned: number; paymentRequest?: { settlementId?: string }; earmarks: Array<{ id: string; orderId?: string; settlementId?: string; amount: string; consumedAmount: string }> }>;
}

export function GoodsEvidence({ sources, selected, onSelect, reload, canAccept = false }: {
  sources: GoodsSource[]; selected?: string[]; onSelect?: (id: string, checked: boolean) => void; reload?: () => Promise<void>; canAccept?: boolean;
}) {
  const [busy, setBusy] = useState('');
  const accept = async (source: GoodsSource) => {
    const reason = await promptAction('确认按合同扣款接收该批货物，请说明业务接收依据。磅单与检测结果保持原确认口径。', '', { title: '确认按合同扣款接收', confirmText: '确认接收' });
    if (!reason) return;
    setBusy(source.id);
    try { await api.post(`/quality-tasks/${source.qualityTaskId}/accept-contract-deduction`, { reason, decisionVersion: source.decisionVersion }); await reload?.(); }
    catch (error: any) { alert(error.message); } finally { setBusy(''); }
  };
  if (!sources.length) return <p className="py-4 text-sm text-muted-foreground">尚无相关运单货物。预付款可按合同申请，最终采购货款需先完成入库过账及质量确认。</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/40"><tr>{onSelect && <th className="p-3 w-10">选用</th>}<th className="p-3 text-left">批次 / 运单</th><th className="p-3 text-left">物料 / 车牌</th><th className="p-3 text-left">质量处置</th><th className="p-3 text-right">口径 / 本次或可用（吨）</th><th className="p-3 text-right">合同单价</th><th className="p-3 text-right">质量扣款（元/吨）</th><th className="p-3 text-left">依据与处理</th></tr></thead><tbody>{sources.map(s => <tr key={s.id} className="border-t align-top">
    {onSelect && <td className="p-3"><input aria-label={`选用${s.waybillNo}`} type="checkbox" checked={selected?.includes(s.id) || false} onChange={e => onSelect(s.id, e.target.checked)} /></td>}
    <td className="p-3"><Link className="hover:underline" href={`/dashboard/orders/${s.orderId}`}>{s.orderNo}</Link><div className="mt-1 text-xs text-muted-foreground"><Link href={`/dashboard/waybills/${s.waybillId}`}>{s.waybillNo}</Link></div></td>
    <td className="p-3">{s.materialName || '—'}<div className="mt-1 text-xs text-muted-foreground">{s.plateNo || '未登记车牌'}</div></td>
    <td className="p-3"><span className={['REJECT', 'REVIEW_REQUIRED'].includes(s.qualityDisposition) ? 'text-red-600' : ''}>{QUALITY_LABELS[s.qualityDisposition] || '待确认'}</span>{s.qualityAcceptance && <div className="mt-1 text-xs text-muted-foreground">商务确认：{s.qualityAcceptance.name}</div>}</td>
    <td className="p-3 text-right tabular-nums">{s.totalQuantity.toFixed(3)} / {(s.settlementQuantity ?? s.remainingQuantity).toFixed(3)}</td><td className="p-3 text-right">{paymentMoney(s.unitPrice)}</td><td className="p-3 text-right">{s.deductionPerTon.toFixed(4)}</td>
    <td className="max-w-xs p-3"><div className="flex flex-wrap gap-2 text-xs">{s.weighTicketId && <Link className="underline" href={`/dashboard/weighbridge/${s.weighTicketId}`}>{s.ticketNo}</Link>}{s.qualityTaskId && <Link className="underline" href={`/dashboard/quality/${s.qualityTaskId}`}>{s.reportNo || s.taskNo}</Link>}</div>{s.reasons?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{s.reasons.join('；')}</p>}{s.evaluation?.items?.length ? <details className="mt-2 text-xs"><summary className="cursor-pointer">查看合同质量计算</summary>{s.evaluation.items.map((i, index) => <p className="mt-1" key={index}>{i.name}：{i.reason}</p>)}</details> : null}{canAccept && s.qualityDisposition === 'DEDUCTION_PENDING' && <Button className="mt-2" size="sm" variant="outline" disabled={!!busy} onClick={() => void accept(s)}>{busy === s.id ? '确认中…' : '确认按合同扣款接收'}</Button>}</td>
  </tr>)}</tbody></table></div>;
}

export function PaymentBalancePanel({ context, settlementId, canAllocate = false, reload }: { context: PaymentContext; settlementId?: string; canAllocate?: boolean; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const settlement = context.settlements.find(s => s.id === settlementId);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await reload(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const allocate = async (fund: PaymentContext['funds'][number]) => {
    if (!settlement) return;
    const value = await promptAction('填写本次抵扣金额，确认后生成真实核销记录。', String(Math.min(fund.available, Number(settlement.totalAmount) - Number(settlement.settledAmount))), { title: '核销预付款或已付款' });
    if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0) return;
    await act(() => api.post(`/financial-settlements/${settlement.id}/allocate`, { fundTransactionId: fund.id, amount: Number(value) }));
  };
  const reserve = async (fund: PaymentContext['funds'][number]) => {
    const orderId = targets[fund.id]; if (!orderId) return alert('请选择资金保留用于的执行批次');
    const amount = await promptAction('填写保留金额。保留只指定用途，不改变应付金额，也不替代核销。', String(fund.unassigned), { title: '指定已付款用途' });
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    const reason = await promptAction('请填写保留给该执行批次的原因', '', { title: '资金用途说明' });
    if (reason) await act(() => api.post(`/financial-settlements/funds/${fund.id}/earmarks`, { orderId, amount: Number(amount), reason }));
  };
  return <Card className="space-y-4 p-5"><h2 className="font-semibold">付款余额与预付款抵扣</h2><div className="grid gap-4 text-sm sm:grid-cols-4">{[
    ['合同基准金额', context.summary.nominalAmount], ['已登记货款', context.summary.paidAmount], ['其他有效申请待付', context.summary.unpaidCommitment], ['合同当前可再申请', context.summary.availableContract],
    ...(settlement ? [['本结算净额', Number(settlement.totalAmount)], ['本结算已核销', Number(settlement.settledAmount)], ['本结算可再申请', settlement.availableAmount]] : []),
  ].map(([name, value]) => <div key={String(name)}><p className="text-xs text-muted-foreground">{name}</p><p className="mt-1 font-medium">{paymentMoney(value)}</p></div>)}</div>
    {context.funds.filter(f => f.available > 0).map(f => <div key={f.id} className="space-y-2 border-t pt-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><Link className="underline" href={`/dashboard/funds/${f.id}?direction=PAYMENT`}>{f.transactionNo}</Link><span>待核销 {paymentMoney(f.available)} · 未指定用途 {paymentMoney(f.unassigned)}</span></div>
      {f.status === 'PENDING_CONFIRMATION' && <p className="text-xs text-muted-foreground">已登记银行付款，待财务确认；该金额已计入付款占用。</p>}
      {canAllocate && ['CONFIRMED', 'PARTIALLY_ALLOCATED'].includes(f.status) && <div className="flex flex-wrap gap-2">{settlement && <Button size="sm" disabled={busy} variant="outline" onClick={() => void allocate(f)}>核销抵扣本结算</Button>}{f.unassigned > 0 && <><select className="h-8 max-w-xs rounded border px-2 text-xs" value={targets[f.id] || ''} onChange={e => setTargets(v => ({ ...v, [f.id]: e.target.value }))}><option value="">选择保留用于的批次</option>{context.orders.map(o => <option key={o.id} value={o.id}>{o.orderNo} · {o.name}</option>)}</select><Button size="sm" variant="outline" disabled={busy} onClick={() => void reserve(f)}>保留至该批次</Button></>}</div>}
      {f.earmarks.filter(e => Number(e.amount) > Number(e.consumedAmount)).map(e => <div className="flex items-center gap-2 text-xs text-muted-foreground" key={e.id}>已指定 {context.orders.find(o => o.id === e.orderId)?.name || context.settlements.find(s => s.id === e.settlementId)?.settlementNo || '业务用途'}：{paymentMoney(Number(e.amount) - Number(e.consumedAmount))}{canAllocate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => api.post(`/financial-settlements/funds/${f.id}/earmarks/${e.id}/release`))}>解除剩余用途</Button>}</div>)}
    </div>)}
  </Card>;
}
