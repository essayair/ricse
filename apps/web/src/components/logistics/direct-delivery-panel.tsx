'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { confirmAction, promptAction } from '@/lib/system-dialog';

type Snapshot = { quantity: string; pricingQuantity: string; pricingQuantityBasis: string; ticketNo: string; reportNo: string; measuredMoisturePct?: number; crossSide?: boolean; crossSideReason?: string | null };
const CROSS_SIDE_REASONS: Record<string, string> = { NEGOTIATED_TICKET: '磅单协商', SINGLE_SIDE_REPORT: '只有一方出质检单' };
type Delivery = { id: string; version: number; status: string; snapshot: Snapshot; remarks: string; documents: Array<{ documentNo: string; direction: string; quantity: string; pricingQuantity: string; status: string }> };
type Detail = { status: string; directOutcome?: string; replacementWaybillId?: string; plannedQuantity: string; originLocation?: string; destinationLocation?: string; deliveries: Delivery[]; weighTickets: Array<{ id: string; ticketNo: string; weighingStage: string; netWeight: string; weightSelections: Array<{ purpose: string; weighTicketId: string }> }>; reports: Array<{ id: string; reportNo: string; inspectionNo: string; evidenceStage: string; indicators: Array<{ name: string; measuredValue: string | null; unit: string }> }>; qualityTask: { id: string; basisInspectionId: string | null; status: string } | null };
const fieldClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
function isAdopted(ticket: Detail['weighTickets'][number], tickets: Detail['weighTickets']) {
  const peers = tickets.filter(t => t.weighingStage === ticket.weighingStage);
  const selection = peers.flatMap(t => t.weightSelections).find(s => s.purpose === ticket.weighingStage);
  return selection ? selection.weighTicketId === ticket.id : peers.length === 1;
}

export function DirectDeliveryPanel({ waybillId, onChanged }: { waybillId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail>();
  const [ticketId, setTicketId] = useState('');
  const [reportId, setReportId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [exception, setException] = useState(false);
  const [crossSideReason, setCrossSideReason] = useState('');
  const [preview, setPreview] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; address: string }>>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [conversionOrigin, setConversionOrigin] = useState('');
  const [conversionQuantity, setConversionQuantity] = useState('');
  const [conversionReason, setConversionReason] = useState('');
  const [permissions, setPermissions] = useState({ manage: false, logistics: false, review: false });
  const load = useCallback(async () => {
    const d = await api.get<Detail>(`/bilateral-direct/waybills/${waybillId}`); setDetail(d);
    const adopted = d.weighTickets.filter(t => isAdopted(t, d.weighTickets));
    // 默认与最终采用报告同侧的采信磅单；无同侧磅单时才回退到唯一采信磅单。
    const basisReport = d.reports.find(r => r.id === d.qualityTask?.basisInspectionId);
    const sameSide = basisReport ? adopted.find(t => t.weighingStage === basisReport.evidenceStage) : undefined;
    setTicketId(old => old || sameSide?.id || (adopted.length === 1 ? adopted[0].id : ''));
    setReportId(old => old || d.qualityTask?.basisInspectionId || (d.reports.length === 1 ? d.reports[0].id : ''));
  }, [waybillId]);
  useEffect(() => {
    void load().catch(e => setError(e.message));
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}'); const admin = u.role === 'ADMIN' || u.roleCodes?.includes('ADMIN');
      setPermissions({ manage: admin || u.permissions?.includes('inventory.manage'), logistics: admin || u.permissions?.includes('logistics.manage'), review: admin || u.roleCodes?.includes('BUSINESS_MANAGER') || u.role === 'BUSINESS_MANAGER' });
    } catch { /* default deny */ }
  }, [load]);
  const selectedTicketStage = detail?.weighTickets.find(t => t.id === ticketId)?.weighingStage;
  const selectedReportStage = detail?.reports.find(r => r.id === reportId)?.evidenceStage;
  const crossSide = Boolean(selectedTicketStage && selectedReportStage && selectedTicketStage !== selectedReportStage);
  const body = { weighTicketId: ticketId, qualityReportId: reportId, remarks, acceptQualityException: exception, ...(crossSide && crossSideReason ? { crossSideReason } : {}) };
  const active = detail?.deliveries.find(d => ['CONFIRMED', 'PENDING_REVIEW'].includes(d.status));
  const act = async (action: string, payload: unknown) => {
    setBusy(true); setError('');
    try { await api.post(`/bilateral-direct/waybills/${waybillId}/${action}`, payload); setPreview(undefined); setConversionOpen(false); await load(); onChanged(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  async function calculate() {
    setBusy(true); setError('');
    try { const r = await api.post<{ snapshot: Snapshot }>(`/bilateral-direct/waybills/${waybillId}/preview`, body); setPreview(r.snapshot); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '预览失败'); }
    finally { setBusy(false); }
  }
  async function reasonAction(action: string) {
    const reason = await promptAction('请填写原因；系统将检查下游单据引用。', '', { title: action === 'reverse' ? '撤销直拨交付' : action === 'reject-return' ? '整车拒收退回供应商' : '取消直拨运单' });
    if (reason?.trim()) await act(action, { reason });
  }
  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">直拨交付</h2><span className="text-sm text-muted-foreground">两向数量一致 · 不形成仓库库存</span></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {detail?.directOutcome === 'REJECT_RETURN' && <p className="text-sm text-warning">已登记整车拒收退回供应商，两向均未形成交付。</p>}
    {detail?.replacementWaybillId && <p className="text-sm">已转常规采购入库，请处理 <Link className="text-primary underline" href={`/dashboard/waybills/${detail.replacementWaybillId}`}>后续入库运输单</Link>；销售需从库存重新安排。</p>}
    {conversionOpen && <div className="space-y-3 rounded-md border p-4"><h3 className="text-sm font-medium">整车转我方仓库</h3><select className={fieldClass} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}><option value="">选择入库仓库 *</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name} · {w.address || '未维护地址'}</option>)}</select><input aria-label="转运起运地点" className={fieldClass} value={conversionOrigin} onChange={e => setConversionOrigin(e.target.value)} placeholder="实际转运起运地点" /><input aria-label="转入库计划参考数量" className={fieldClass} type="number" min="0.001" step="0.001" value={conversionQuantity} onChange={e => setConversionQuantity(e.target.value)} placeholder="计划参考数量（吨）" /><textarea className="min-h-20 w-full rounded-md border p-3 text-sm" value={conversionReason} onChange={e => setConversionReason(e.target.value)} placeholder="转入库原因 *" /><p className="text-xs text-muted-foreground">保留原运输记录，生成常规采购通知与待发运运单；实际到仓后重新确认我方计量及质量，不会立即形成库存。</p><div className="flex gap-2"><Button disabled={busy || !warehouseId || !conversionReason.trim()} onClick={() => void act('to-warehouse', { warehouseId, reason: conversionReason, originLocation: conversionOrigin || undefined, plannedQuantity: Number(conversionQuantity) || undefined })}>确认整车转入库</Button><Button variant="outline" onClick={() => setConversionOpen(false)}>返回修改</Button></div></div>}
    {active ? <>
      <p className="text-sm">第 {active.version} 版 · {active.status === 'CONFIRMED' ? '销售与采购交付均已完成' : '等待运营经理复核'}</p>
      <Summary snapshot={active.snapshot} />
      {active.documents.map(d => <p key={d.documentNo} className="text-sm"><span className={d.direction === 'PURCHASE' ? 'text-destructive' : 'text-primary'}>{d.direction === 'PURCHASE' ? '采购业务入库' : '销售出库'}</span> · {d.documentNo}</p>)}
      <p className="text-sm">{active.remarks}</p>
      <div className="flex flex-wrap gap-2">
        {permissions.manage && <Button variant="outline" disabled={busy} onClick={() => void reasonAction('reverse')}>{active.status === 'PENDING_REVIEW' ? '撤回复核' : '撤销交付'}</Button>}
        {permissions.review && active.status === 'PENDING_REVIEW' && [true, false].map(approved => <Button variant={approved ? 'default' : 'outline'} key={String(approved)} disabled={busy} onClick={async () => { const reason = await promptAction('请填写复核意见', '', { title: approved ? '通过交付复核' : '退回修改' }); if (reason?.trim()) await act('review', { approved, reason }); }}>{approved ? '复核通过' : '退回修改'}</Button>)}
      </div>
    </> : detail && <>
      <div className="grid gap-3 md:grid-cols-2">{['SHIPPING', 'RECEIVING'].map(stage => <div key={stage} className="space-y-2 rounded-md border p-4 text-sm">
        <h3 className="font-medium">{stage === 'SHIPPING' ? '发货侧依据' : '收货侧依据'}</h3>
        {detail.weighTickets.filter(t => t.weighingStage === stage).map(t => <p key={t.id}>{t.ticketNo} · <span className={ticketId === t.id ? 'font-medium text-primary' : ''}>{t.netWeight} 吨</span>{isAdopted(t, detail.weighTickets) ? ' · 已采信' : ' · 未采信'}</p>)}
        {detail.reports.filter(r => r.evidenceStage === stage).map(r => <div key={r.id}><p className={reportId === r.id ? 'font-medium text-primary' : ''}>{r.reportNo || r.inspectionNo}{detail.qualityTask?.basisInspectionId === r.id ? ' · 最终采用' : ''}</p><p className="text-xs text-muted-foreground">{r.indicators.map(i => `${i.name} ${i.measuredValue ?? '未填'}${i.unit || ''}`).join('；')}</p></div>)}
        {!detail.weighTickets.some(t => t.weighingStage === stage) && <p className="text-muted-foreground">未提供有效磅单</p>}
        {!detail.reports.some(r => r.evidenceStage === stage) && <p className="text-muted-foreground">未提供有效检测报告</p>}
      </div>)}</div>
      {(() => { const shipping = detail.weighTickets.find(t => t.weighingStage === 'SHIPPING' && isAdopted(t, detail.weighTickets)); const receiving = detail.weighTickets.find(t => t.weighingStage === 'RECEIVING' && isAdopted(t, detail.weighTickets)); return shipping && receiving && Number(shipping.netWeight) !== Number(receiving.netWeight) ? <p className="text-sm text-warning">两侧净重差异：{(Number(receiving.netWeight) - Number(shipping.netWeight)).toFixed(3)} 吨（收货－发货），请核对采用依据。</p> : null; })()}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm"><span>交付采用磅单 *</span><select className={fieldClass} value={ticketId} onChange={e => { setTicketId(e.target.value); setPreview(undefined); }}><option value="">请选择有效采信磅单</option>{detail.weighTickets.map(t => <option key={t.id} value={t.id} disabled={!isAdopted(t, detail.weighTickets)}>{t.weighingStage === 'SHIPPING' ? '发货' : '收货'} · {t.ticketNo} · {t.netWeight} 吨{!isAdopted(t, detail.weighTickets) ? '（请先确认采信）' : ''}</option>)}</select></label>
        <label className="space-y-2 text-sm"><span>交付采用检测报告 *</span><select className={fieldClass} value={reportId} onChange={e => { setReportId(e.target.value); setPreview(undefined); }}><option value="">请选择有效报告</option>{detail.reports.map(r => <option key={r.id} value={r.id} disabled={r.id !== detail.qualityTask?.basisInspectionId}>{r.evidenceStage === 'SHIPPING' ? '发货' : '收货'} · {r.reportNo || r.inspectionNo}{r.id !== detail.qualityTask?.basisInspectionId ? '（尚未最终采用）' : ''}</option>)}</select></label>
      </div>
      {detail.qualityTask && <Link className="inline-block text-sm text-primary underline" href={`/dashboard/quality/${detail.qualityTask.id}`}>查看质检任务及最终采用报告</Link>}
      <label className="block space-y-2 text-sm"><span>采用依据及差异处理说明 *</span><textarea className="min-h-20 w-full rounded-md border border-input bg-background p-3" value={remarks} onChange={e => { setRemarks(e.target.value); setPreview(undefined); }} /></label>
      {crossSide && <label className="block space-y-2 text-sm"><span className="text-warning">交付磅单与水分报告来自不同环节，请选择原因 *</span><select className={fieldClass} value={crossSideReason} onChange={e => { setCrossSideReason(e.target.value); setPreview(undefined); }}><option value="">请选择原因</option>{Object.entries(CROSS_SIDE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={exception} onChange={e => { setException(e.target.checked); setPreview(undefined); }} />已核对质量异常，确认按说明接收</label>
      {preview && <Summary snapshot={preview} />}
      <div className="flex flex-wrap gap-2">
        {permissions.manage && <><Button variant="outline" disabled={busy || detail.status !== 'SIGNED'} onClick={() => void calculate()}>预览交付数量</Button><Button disabled={busy || !preview || (crossSide && !crossSideReason)} onClick={async () => { if (await confirmAction('将以同一组依据生成采购业务入库和销售出库，完成两向交付。', { title: '确认直拨交付' })) await act('confirm', body); }}>确认销售交付并同步采购</Button><Button variant="outline" disabled={busy || !preview || (crossSide && !crossSideReason)} onClick={() => void act('confirm', { ...body, requestReview: true })}>提交运营经理复核</Button></>}
        {permissions.logistics && detail.status !== 'CANCELLED' && <Button variant="outline" disabled={busy} onClick={() => void reasonAction('cancel')}>取消运单</Button>}
        {permissions.manage && detail.status !== 'CANCELLED' && <>{['ARRIVED', 'SIGNED'].includes(detail.status) && <Button variant="outline" disabled={busy} onClick={() => void reasonAction('reject-return')}>整车拒收退回</Button>}<Button variant="outline" disabled={busy} onClick={async () => { try { setWarehouses(await api.get('/bilateral-direct/warehouses')); setConversionOrigin((detail.status === 'PENDING' ? detail.originLocation : detail.destinationLocation) || ''); setConversionQuantity(detail.plannedQuantity || ''); setConversionOpen(true); } catch (e: any) { setError(e.message); } }}>转我方仓库</Button></>}
      </div>
      {detail.status !== 'SIGNED' && <p className="text-sm text-muted-foreground">客户签收后可确认交付；至少一张有效磅单和一份报告，不要求两侧齐全。</p>}
    </>}
    {(detail?.deliveries.length || 0) > 0 && <details className="border-t pt-3 text-sm"><summary className="cursor-pointer">交付版本记录（{detail!.deliveries.length}）</summary>{detail!.deliveries.map(d => <p key={d.id} className="mt-2">第 {d.version} 版 · {{ CONFIRMED: '已确认', PENDING_REVIEW: '待复核', REJECTED: '已退回', REVERSED: '已撤销' }[d.status] || d.status} · 实物 {d.snapshot.quantity} / 辅助 {d.snapshot.pricingQuantity} 吨</p>)}</details>}
  </Card>;
}

function Summary({ snapshot: s }: { snapshot: Snapshot }) { return <div className="grid gap-3 rounded-md border bg-muted/30 p-4 text-sm sm:grid-cols-2"><p>实物数量：{s.quantity} 吨</p><p>{s.pricingQuantityBasis === 'DRY_MATTER' ? '折干' : '计价'}数量：{s.pricingQuantity} 吨</p><p>磅单：{s.ticketNo}</p><p>报告：{s.reportNo}</p>{s.crossSide && <p className="text-warning sm:col-span-2">磅单与水分来自不同环节{s.crossSideReason ? `：${CROSS_SIDE_REASONS[s.crossSideReason] || s.crossSideReason}` : ''}</p>}<p className="sm:col-span-2">采购业务入库数量＝销售出库数量</p></div>; }
