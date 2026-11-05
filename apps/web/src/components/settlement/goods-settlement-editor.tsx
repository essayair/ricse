'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GoodsSource, paymentMoney } from './purchase-payment-context';
import { promptAction } from '@/lib/system-dialog';

type Line = { quantity: string; adjustmentAmount: string; remarks: string; negotiatedQuantity: boolean; qualityReportId: string; weighTicketId: string };
type ContractOption = { id: string; contractNo: string; title: string; pricingType?: string; signingPartnerId?: string; counterparty?: { name: string }; seller?: { id: string; name: string }; buyer?: { id: string; name: string } };
type Saved = { id: string; contractId: string; direction: 'PAYABLE' | 'RECEIVABLE'; settlementScope: string; status: string; dueDate?: string | null; remarks?: string | null; lines: Array<{ waybillLineItemId?: string | null; quantity: string; adjustmentAmount: string; remarks?: string | null; sourceSnapshot?: { weighTicketId?: string; reportId?: string; negotiatedQuantity?: boolean; taxRatePct?: number } }> };
type WeighTicket = NonNullable<GoodsSource['availableWeighTickets']>[number];
const tons = (value: number | null | undefined) => value == null ? '—' : Number(value).toFixed(3);
const SHIPPING_REASON = '本次货款按发货侧采信磅单结算';
const ticketForStage = (source: GoodsSource, stage: 'SHIPPING' | 'RECEIVING') =>
  source.availableWeighTickets?.find(ticket => ticket.weighingStage === stage && ticket.isSelectable !== false && ticket.netWeight != null);
const weighVariance = (source: GoodsSource) => {
  const shipping = ticketForStage(source, 'SHIPPING');
  const receiving = ticketForStage(source, 'RECEIVING');
  if (shipping?.netWeight == null || receiving?.netWeight == null) return null;
  const differenceInKg = Math.round(Number(shipping.netWeight) * 1000) - Math.round(Number(receiving.netWeight) * 1000);
  return differenceInKg === 0 ? null : {
    amount: Math.abs(differenceInKg) / 1000,
    lowerStage: differenceInKg < 0 ? 'SHIPPING' as const : 'RECEIVING' as const,
  };
};
const ticketQuantity = (source: GoodsSource, ticket: WeighTicket, reportId?: string) => {
  const netWeight = Number(ticket.netWeight || 0);
  const moisture = reportId && reportId !== source.reportId
    ? source.availableQualityReports?.find(report => report.id === reportId)?.measuredMoisturePct
    : source.measuredMoisturePct;
  if (source.pricingQuantityBasis === 'DRY_MATTER' && moisture == null) return 0;
  const priced = source.pricingQuantityBasis === 'DRY_MATTER' && moisture != null
    ? netWeight * (1 - Number(moisture) / 100) : netWeight;
  return Math.max(0, Number((Number(priced.toFixed(3)) - Number(source.usedQuantity || 0)).toFixed(3)));
};
const defaultLine = (source: GoodsSource, sales = false): Line => {
  const preferred = ticketForStage(source, sales ? 'RECEIVING' : 'SHIPPING');
  const ticket = preferred || ticketForStage(source, sales ? 'SHIPPING' : 'RECEIVING');
  const shippingSelected = ticket?.weighingStage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
  return { quantity: String(ticket ? ticketQuantity(source, ticket) : source.remainingQuantity), adjustmentAmount: '0',
    remarks: shippingSelected ? SHIPPING_REASON : '', negotiatedQuantity: false,
    qualityReportId: source.defaultReportId || source.inventoryReportId || '', weighTicketId: ticket?.id || source.weighTicketId || '' };
};
const eligible = (source: GoodsSource) => source.available && source.remainingQuantity > 0;

export function GoodsSettlementEditor({ direction = 'PAYABLE', editId }: { direction?: 'PAYABLE' | 'RECEIVABLE'; editId?: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const sales = direction === 'RECEIVABLE';
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sources, setSources] = useState<GoodsSource[]>([]);
  const [contractId, setContractId] = useState(query.get('contractId') || '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, Line>>({});
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [batchFilter, setBatchFilter] = useState('');
  const [canAccept, setCanAccept] = useState(false);

  useEffect(() => {
    if (previewOpen) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewOpen]);

  useEffect(() => {
    void api.get<ContractOption[]>(`/financial-settlements/options/contracts?direction=${direction}`).then(setContracts).catch(e => setError(e.message));
    if (editId) void api.get<Saved>(`/financial-settlements/${editId}`).then(item => {
      if (item.direction !== direction || item.status !== 'DRAFT' || item.settlementScope !== 'GOODS') throw new Error('这张结算单不能编辑');
      setSaved(item); setContractId(item.contractId); setDueDate(item.dueDate?.slice(0, 10) || ''); setRemarks(item.remarks || '');
      const tax = item.lines.find(line => line.sourceSnapshot?.taxRatePct != null)?.sourceSnapshot?.taxRatePct;
      if (tax != null) setTaxRatePct(String(tax));
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanAccept(user.role === 'ADMIN' || user.permissions?.includes('settlement.quality.accept') || user.permissions?.includes('settlement.manage')); } catch { /* 无本地用户信息时由服务端鉴权 */ }
  }, [direction, editId]);

  const refresh = useCallback(async () => {
    if (!contractId) return;
    const editQuery = editId ? `&editId=${editId}` : '';
    setSources(await api.get<GoodsSource[]>(`/financial-settlements/options/goods-sources?contractId=${contractId}&direction=${direction}${editQuery}`));
  }, [contractId, direction, editId]);

  useEffect(() => {
    setSources([]); setSelected({}); setPreview(null); setBatchFilter(''); setTaxRatePct('');
    if (contractId && (!editId || saved?.contractId === contractId)) void refresh().catch(e => setError(e.message));
  }, [contractId, editId, saved, refresh]);

  useEffect(() => {
    if (!sources.length) return;
    const savedRate = saved?.lines.find(line => line.sourceSnapshot?.taxRatePct != null)?.sourceSnapshot?.taxRatePct;
    const contractRates = [...new Set(sources.map(source => source.contractTaxRatePct).filter(rate => rate != null))];
    if (savedRate != null) setTaxRatePct(String(savedRate));
    else if (contractRates.length === 1) setTaxRatePct(String(contractRates[0]));
    else if (contractRates.length > 1) setError('合同物料存在不同税率，请分开结算或先核对合同税率');
  }, [sources, saved]);

  useEffect(() => {
    if (!sources.length) return;
    if (saved) {
      const existing: Record<string, Line> = {};
      for (const line of saved.lines) {
        const source = sources.find(row => row.id === line.waybillLineItemId);
        if (!source) continue;
        existing[source.id] = { ...defaultLine(source, sales), quantity: line.quantity, adjustmentAmount: line.adjustmentAmount,
          remarks: line.remarks || '', weighTicketId: line.sourceSnapshot?.weighTicketId || source.weighTicketId || '',
          qualityReportId: line.sourceSnapshot?.reportId || source.defaultReportId || '', negotiatedQuantity: Boolean(line.sourceSnapshot?.negotiatedQuantity) };
      }
      setSelected(existing);
    } else setSelected(Object.fromEntries(sources.filter(eligible).map(source => [source.id, defaultLine(source, sales)])));
  }, [sources, saved, sales]);

  const contract = contracts.find(item => item.id === contractId);
  const counterpartyName = (item: ContractOption) => item.counterparty?.name || (item.signingPartnerId === item.buyer?.id ? item.seller?.name : item.buyer?.name) || item.seller?.name || '—';
  const gradeTier = contract?.pricingType === 'GRADE_TIER';
  const batches = useMemo(() => [...new Map(sources.map(source => [source.orderId, { id: source.orderId, label: `${source.orderNo} · ${source.orderName}`, status: source.orderStatus }])).values()], [sources]);
  const filtered = sources.filter(source => !batchFilter || source.orderId === batchFilter);
  const selectedRows = sources.filter(source => selected[source.id]);
  const selectedInView = filtered.filter(source => selected[source.id]);
  const commonReports = selectedInView.length ? (selectedInView[0].availableQualityReports || []).filter(report =>
    selectedInView.every(source => source.availableQualityReports?.some(candidate => candidate.id === report.id))) : [];
  const selectedTotals = useMemo(() => {
    const rows = sources.filter(source => selected[source.id]);
    const weight = (stage: 'SHIPPING' | 'RECEIVING') => rows.reduce((sum, source) => sum + Number(ticketForStage(source, stage)?.netWeight || 0), 0);
    const chosenWeight = rows.reduce((sum, source) => sum + Number(source.availableWeighTickets?.find(ticket => ticket.id === selected[source.id].weighTicketId)?.netWeight || 0), 0);
    return { count: rows.length, shippingWeight: weight('SHIPPING'), receivingWeight: weight('RECEIVING'), chosenWeight,
      varianceCount: rows.filter(source => weighVariance(source)).length,
      absoluteVariance: rows.reduce((sum, source) => sum + (weighVariance(source)?.amount || 0), 0),
      quantity: rows.reduce((sum, source) => sum + Number(selected[source.id].quantity || 0), 0) };
  }, [selected, sources]);
  const setField = (id: string, patch: Partial<Line>) => { setSelected(rows => ({ ...rows, [id]: { ...rows[id], ...patch } })); setPreview(null); setError(''); };
  const toggle = (rows: GoodsSource[], checked: boolean) => {
    setSelected(current => { const next = { ...current }; for (const row of rows) { if (checked && eligible(row)) next[row.id] = next[row.id] || defaultLine(row, sales); if (!checked) delete next[row.id]; } return next; });
    setPreview(null);
  };
  const selectTicket = (source: GoodsSource, ticket: WeighTicket) => {
    if (!selected[source.id] || ticket.isSelectable === false || ticket.netWeight == null) return;
    setSelected(current => {
      const line = current[source.id];
      if (!line) return current;
      const shippingReason = ticket.weighingStage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
      return { ...current, [source.id]: { ...line, weighTicketId: ticket.id,
        quantity: line.negotiatedQuantity ? line.quantity : String(ticketQuantity(source, ticket, line.qualityReportId)),
        remarks: shippingReason ? line.remarks || SHIPPING_REASON : line.remarks === SHIPPING_REASON ? '' : line.remarks } };
    });
    setPreview(null); setError('');
  };
  const selectReport = (source: GoodsSource, reportId: string) => {
    setSelected(current => {
      const line = current[source.id]; if (!line) return current;
      const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
      return { ...current, [source.id]: { ...line, qualityReportId: reportId,
        quantity: ticket && !line.negotiatedQuantity ? String(ticketQuantity(source, ticket, reportId)) : line.quantity } };
    });
    setPreview(null);
    const report = source.availableQualityReports?.find(candidate => candidate.id === reportId);
    setError(source.pricingQuantityBasis === 'DRY_MATTER' && reportId !== source.reportId && report && report.measuredMoisturePct == null ? `${source.waybillNo}所选检测报告缺少水分实测值，无法计算折干数量` : '');
  };
  const bulkSide = async (stage: 'SHIPPING' | 'RECEIVING') => {
    const changes = selectedInView.flatMap(source => {
      const ticket = ticketForStage(source, stage);
      return ticket ? [{ source, ticket }] : [];
    });
    if (!changes.length) { setError(`当前范围内没有可选的${stage === 'SHIPPING' ? '发货' : '收货'}磅单`); return; }
    const needsReason = stage === 'SHIPPING' && changes.some(({ source, ticket }) => (sales || ticket.id !== source.weighTicketId) && !selected[source.id]?.remarks?.trim());
    const reason = needsReason ? (await promptAction('请填写统一采用发货侧磅单的依据说明', SHIPPING_REASON, { title: '批量切换货款磅单' }))?.trim() : undefined;
    if (needsReason && !reason) return;
    setSelected(current => { const next = { ...current }; for (const { source, ticket } of changes) {
      const line = next[source.id]; if (!line) continue;
      const shippingReason = stage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
      next[source.id] = { ...line, weighTicketId: ticket.id,
        quantity: line.negotiatedQuantity ? line.quantity : String(ticketQuantity(source, ticket, line.qualityReportId)),
        remarks: shippingReason ? reason || line.remarks || SHIPPING_REASON : line.remarks === SHIPPING_REASON ? '' : line.remarks };
    } return next; });
    setPreview(null);
    setError(selectedInView.length > changes.length ? `已切换 ${changes.length} 车；其余车辆该侧没有已确认的采信磅单，请逐车核对。` : '');
  };
  const bulkReport = async (mode: string) => {
    if (!mode) return;
    if (!selectedInView.length) { setError('请先选用需要切换检测报告的车辆'); return; }
    const changes = selectedInView.flatMap(source => {
      const reportId = mode === 'DEFAULT'
        ? source.defaultReportId || source.inventoryReportId || source.reportId
        : mode.startsWith('REPORT:') ? mode.slice('REPORT:'.length)
          : (() => {
            const candidates = source.availableQualityReports?.filter(report => report.evidenceStage === mode) || [];
            return candidates.length === 1 ? candidates[0].id : '';
          })();
      const report = source.availableQualityReports?.find(candidate => candidate.id === reportId);
      if (!report || source.pricingQuantityBasis === 'DRY_MATTER' && report.measuredMoisturePct == null) return [];
      return [{ source, report }];
    });
    if (!changes.length) { setError('当前范围内没有可统一选用的检测报告；同侧多份报告请逐车选择'); return; }
    const changed = changes.filter(({ source, report }) => selected[source.id]?.qualityReportId !== report.id);
    const needsReason = changed.some(({ source, report }) => report.id !== (sales ? source.defaultReportId : source.inventoryReportId));
    const reason = needsReason ? (await promptAction('请填写批量改选检测报告的依据说明', '按双方确认的检测报告作为本次货款结算依据', { title: '批量切换检测报告' }))?.trim() : undefined;
    if (needsReason && !reason) return;
    setSelected(current => {
      const next = { ...current };
      for (const { source, report } of changed) {
        const line = next[source.id]; if (!line) continue;
        const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
        next[source.id] = { ...line, qualityReportId: report.id,
          quantity: ticket && !line.negotiatedQuantity ? String(ticketQuantity(source, ticket, report.id)) : line.quantity,
          remarks: reason ? [line.remarks.trim(), reason].filter(Boolean).join('；') : line.remarks };
      }
      return next;
    });
    setPreview(null);
    setError(selectedInView.length > changes.length ? `已切换 ${changes.length} 车；其余车辆缺少该侧唯一报告或折干所需水分，请逐车核对。` : '');
  };
  const payload = () => ({ contractId, direction, settlementScope: 'GOODS', dueDate: dueDate ? `${dueDate}T12:00:00+08:00` : undefined,
    remarks, taxRatePct: gradeTier && taxRatePct !== '' ? Number(taxRatePct) : undefined,
    lines: selectedRows.map(source => { const line = selected[source.id]; return { orderId: source.orderId, waybillLineItemId: source.id,
      weighTicketId: line.weighTicketId || undefined, qualityReportId: line.qualityReportId || undefined,
      quantity: Number(line.quantity), adjustmentAmount: Number(line.adjustmentAmount || 0), remarks: line.remarks,
      negotiatedQuantity: line.negotiatedQuantity }; }) });

  useEffect(() => {
    setPreview(null);
    setPreviewOpen(false);
    if (!contractId || !selectedRows.length || (gradeTier && taxRatePct === '')) return;
    if (selectedRows.some(source => !Number.isFinite(Number(selected[source.id].quantity)) || Number(selected[source.id].quantity) <= 0)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.post<any>(editId ? `/financial-settlements/${editId}/preview-goods` : '/financial-settlements/preview-goods', payload())
        .then(value => { if (!cancelled) { setPreview(value); setError(''); } }).catch(cause => { if (!cancelled) { setPreview(null); setError(cause.message || '实时试算失败，请检查逐车依据'); } });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // 仅数量、磅单、报告和税率变化触发试算；备注与日期在提交时一并保存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, selected, sources, gradeTier, taxRatePct, editId]);

  const submit = async (save: boolean) => {
    setBusy(true); setError('');
    try {
      if (!contractId) throw new Error('请选择合同');
      if (!selectedRows.length) throw new Error('请选择至少一车货物');
      if (gradeTier && (taxRatePct === '' || Number(taxRatePct) < 0 || Number(taxRatePct) > 100)) throw new Error('请填写本次结算税率');
      const url = editId ? `/financial-settlements/${editId}` : '/financial-settlements';
      const value = save ? editId ? await api.patch<{ id: string }>(url, payload()) : await api.post<{ id: string }>(url, payload())
        : await api.post<any>(editId ? `${url}/preview-goods` : '/financial-settlements/preview-goods', payload());
      if (save) router.push(`/dashboard/settlements/${value.id}`);
      else {
        setPreview(value);
        setPreviewOpen(true);
      }
    } catch (cause: any) { setError(cause.message || '结算单处理失败'); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="p-8 text-sm text-muted-foreground">正在加载结算草稿…</p>;
  return <div className="space-y-5 pb-28">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">{editId ? '编辑' : '新建'}{sales ? '销售' : '采购'}结算单</h1><p className="mt-1 text-sm text-muted-foreground">改选磅单仅影响本次结算，不改出入库记录。</p></div><Button variant="outline" onClick={() => router.back()}>返回</Button></div>
    {error && <div role="alert" className="rounded border border-warning-border bg-warning-bg p-3 text-sm text-warning">{error}</div>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-1 text-sm"><span>{sales ? '销售' : '采购'}合同 *</span><select className="h-10 w-full rounded border bg-background px-2" value={contractId} disabled={Boolean(editId)} onChange={e => setContractId(e.target.value)}><option value="">请选择合同</option>{contracts.filter(item => item.id === contractId || `${item.contractNo} ${item.title} ${item.counterparty?.name} ${item.seller?.name} ${item.buyer?.name}`.includes(search.trim())).map(item => <option key={item.id} value={item.id}>{item.contractNo} · {item.title} · {counterpartyName(item)}</option>)}</select></label><label className="space-y-1 text-sm"><span>查找合同</span><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="合同编号、标题、企业名称" /></label></Card>
    {sources.length > 0 && <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">逐车货款计量与质量依据</h2>
        <p className="mt-1 text-xs text-muted-foreground">采购默认选发货侧；无可用发货磅单时沿用收货侧。销售沿用客户收货侧。切换磅单后，本次数量会按选用依据重算。</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <BasisMetric label="已选车辆" value={`${selectedTotals.count} / ${sources.length} 车`} />
        <BasisMetric label="发货侧净重合计" value={`${tons(selectedTotals.shippingWeight)} 吨`} />
        <BasisMetric label="收货侧净重合计" value={`${tons(selectedTotals.receivingWeight)} 吨`} />
        <BasisMetric label="选用磅单净重" value={`${tons(selectedTotals.chosenWeight)} 吨`} />
        <BasisMetric label="本次结算数量" value={`${tons(selectedTotals.quantity)} 吨`} emphasis />
        <BasisMetric label="试算结算金额" value={preview ? paymentMoney(preview.totalAmount) : !selectedTotals.count ? '未选车辆' : gradeTier && !taxRatePct ? '待填写税率' : '计算中…'} emphasis />
      </div>
      {selectedTotals.varianceCount > 0 && <p className="text-xs text-warning">{selectedTotals.varianceCount} 车发货与收货净重不同，逐车磅差绝对值合计 {tons(selectedTotals.absoluteVariance)} 吨；请核对并选定结算磅单。</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1260px] text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground"><tr>
            <th className="min-w-52 p-3">批次 / 运单</th>
            <th className="min-w-36 p-3">货物 / 车牌</th>
            <th className="min-w-48 p-3">发货磅单</th>
            <th className="min-w-48 p-3">收货磅单</th>
            <th className="min-w-48 p-3">检测报告</th>
            <th className="min-w-36 p-3 text-right">本次 / 当前口径可结算</th>
          </tr><tr className="border-t bg-surface-2 align-top text-xs font-normal text-foreground">
            <th className="space-y-2 p-2 font-normal">
              <select aria-label="筛选执行批次" className="h-8 w-full rounded border bg-background px-2" value={batchFilter} onChange={event => setBatchFilter(event.target.value)}>
                <option value="">全部批次（{batches.length}）</option>
                {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.label} · {batch.status}</option>)}
              </select>
              <div className="flex gap-1"><Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" onClick={() => toggle(filtered, true)}>全选</Button><Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" onClick={() => toggle(filtered, false)}>全取消</Button></div>
            </th>
            <th className="p-2 text-center align-top text-xs font-medium text-foreground"><span className="flex h-8 items-center justify-center">当前已选 {selectedInView.length} / {filtered.length} 车</span></th>
            <th className="p-2 font-normal"><Button size="sm" variant="outline" className="h-8 w-full text-xs" disabled={!selectedInView.length} onClick={() => void bulkSide('SHIPPING')}>全部选发货磅单</Button></th>
            <th className="p-2 font-normal"><Button size="sm" variant="outline" className="h-8 w-full text-xs" disabled={!selectedInView.length} onClick={() => void bulkSide('RECEIVING')}>全部选收货磅单</Button></th>
            <th className="p-2 font-normal"><select aria-label="批量选择检测报告" className="h-8 w-full rounded border bg-background px-2 text-xs" defaultValue="" disabled={!selectedInView.length} onChange={event => { const mode = event.target.value; event.target.value = ''; void bulkReport(mode); }}>
              <option value="">批量选择检测报告</option><option value="DEFAULT">沿用默认报告</option><option value="SHIPPING">选发货侧报告</option><option value="RECEIVING">选收货侧报告</option>
              {commonReports.map(report => <option key={report.id} value={`REPORT:${report.id}`}>共用报告 · {report.reportNo}</option>)}
            </select></th>
            <th className="p-2 text-right font-normal text-muted-foreground">仅调整当前筛选中已选车辆</th>
          </tr></thead>
          <tbody>{filtered.map(source => {
            const line = selected[source.id];
            const selectedTicket = source.availableWeighTickets?.find(ticket => ticket.id === line?.weighTicketId);
            const basisRemaining = selectedTicket ? ticketQuantity(source, selectedTicket, line?.qualityReportId) : source.remainingQuantity;
            const variance = weighVariance(source);
            return <tr key={source.id} className={line ? 'border-t align-top bg-primary-bg/30' : 'border-t align-top'}>
              <td className="p-3"><label className="flex cursor-pointer items-center gap-2 font-medium"><input type="checkbox" aria-label={`选用运单 ${source.waybillNo}`} checked={Boolean(line)} disabled={!eligible(source) && !line} onChange={event => toggle([source], event.target.checked)} />{source.orderNo}</label><div className="mt-1 pl-6 text-xs text-muted-foreground">{source.waybillNo}</div></td>
              <td className="p-3">{source.materialName || '—'}<div className="mt-1 text-xs text-muted-foreground">{source.plateNo || '未录车牌'}</div>{variance && <div className="mt-1 text-xs font-medium text-warning">两侧相差 {tons(variance.amount)} 吨</div>}</td>
              <td className="p-3"><WeighSideChoice source={source} stage="SHIPPING" selectedId={line?.weighTicketId} lower={variance?.lowerStage === 'SHIPPING'} disabled={!line} onSelect={ticket => selectTicket(source, ticket)} /></td>
              <td className="p-3"><WeighSideChoice source={source} stage="RECEIVING" selectedId={line?.weighTicketId} lower={variance?.lowerStage === 'RECEIVING'} disabled={!line} onSelect={ticket => selectTicket(source, ticket)} /></td>
              <td className="p-3"><select aria-label={`${source.waybillNo}本次检测报告`} className="h-9 w-full min-w-44 rounded border bg-background px-2" disabled={!line} value={line?.qualityReportId || ''} onChange={event => selectReport(source, event.target.value)}><option value="">沿用默认报告</option>{source.availableQualityReports?.map(report => <option key={report.id} value={report.id}>{report.evidenceStage === 'SHIPPING' ? '发货侧' : '收货侧'} · {report.reportNo}</option>)}</select></td>
              <td className="p-3 text-right tabular-nums"><div className="font-medium">{line ? tons(Number(line.quantity)) : '—'} / {tons(basisRemaining)} 吨</div>{!source.available && <div className="mt-1 text-xs text-warning">{source.reasons.join('；')}</div>}{!sales && canAccept && source.qualityDisposition === 'DEDUCTION_PENDING' && <Button size="sm" variant="outline" className="mt-2" onClick={async () => { const reason = await promptAction('请填写按合同扣款接收的业务依据', '', { title: '确认扣款接收' }); if (!reason?.trim()) return; try { await api.post(`/quality-tasks/${source.qualityTaskId}/accept-contract-deduction`, { reason, decisionVersion: source.decisionVersion }); await refresh(); } catch (cause: any) { setError(cause.message); } }}>确认扣款接收</Button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </Card>}
    {selectedRows.length > 0 && <Card className="space-y-3 p-5"><h2 className="font-semibold">逐车结算明细</h2><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-2">运单 / 车牌</th><th className="p-2">净重 / 水分 / 折干</th><th className="p-2">本次数量（吨）</th><th className="p-2">协商数量</th><th className="p-2">参考单价</th><th className="p-2">其他加减（元）</th><th className="p-2">依据与调整说明</th><th className="p-2">含税金额</th></tr></thead><tbody>{selectedRows.map(source => { const line = selected[source.id]; const result = preview?.lines?.find((item: any) => item.waybillLineItemId === source.id); return <tr key={source.id} className="border-t align-top"><td className="p-2">{source.waybillNo}<div className="text-xs text-muted-foreground">{source.plateNo}</div></td><td className="p-2">{tons(result?.sourceSnapshot?.netWeight ?? source.netWeight)} / {result?.sourceSnapshot?.measuredMoisturePct ?? source.measuredMoisturePct ?? '—'}% / {tons(result?.sourceSnapshot?.dryQuantity ?? source.dryQuantity)}</td><td className="p-2"><Input aria-label={`${source.waybillNo}本次数量`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={e => setField(source.id, { quantity: e.target.value })} /></td><td className="p-2"><input type="checkbox" checked={line.negotiatedQuantity} onChange={e => setField(source.id, { negotiatedQuantity: e.target.checked })} /></td><td className="p-2">{paymentMoney(result?.unitPrice ?? source.unitPrice)}</td><td className="p-2"><Input type="number" step="0.01" value={line.adjustmentAmount} onChange={e => setField(source.id, { adjustmentAmount: e.target.value })} /></td><td className="p-2"><Input value={line.remarks} placeholder="改选依据、协商或调整时必填" onChange={e => setField(source.id, { remarks: e.target.value })} /></td><td className="p-2 font-medium">{result ? paymentMoney(result.totalAmount) : '待试算'}</td></tr>; })}</tbody></table></div></Card>}
    {gradeTier && <Card className="p-5"><label className="block max-w-xs space-y-1 text-sm">{sources.some(source => source.contractTaxRatePct != null) ? '合同税率（%）' : '本次结算税率（%）*'}<Input type="number" min="0" max="100" step="0.01" value={taxRatePct} readOnly={sources.some(source => source.contractTaxRatePct != null)} onChange={e => setTaxRatePct(e.target.value)} /></label></Card>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-1 text-sm">约定{sales ? '收款' : '付款'}到期日<Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label className="space-y-1 text-sm">结算说明<Input value={remarks} onChange={e => setRemarks(e.target.value)} /></label></Card>
    {previewOpen && preview && <Card ref={previewRef} className="space-y-4 p-5" id="goods-settlement-preview">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">结算单预览</h2><p className="text-xs text-muted-foreground">预览稿未保存；正式结算单在确认后打印并交双方签章。</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>收起</Button></div>
      <GoodsSettlementDocumentPreview contract={contract} preview={preview} sources={sources} sales={sales} remarks={remarks} />
    </Card>}
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-lg"><div className="text-sm">已选 <b>{selectedTotals.count}</b> 车 · 本次数量 <b>{tons(selectedTotals.quantity)}</b> 吨 · {preview ? <>货物原金额 {paymentMoney(preview.grossAmount)} · 质量扣款 {paymentMoney(preview.qualityDeductionAmount)} · 其他加减 {paymentMoney(preview.adjustmentAmount)} · 结算金额 <b>{paymentMoney(preview.totalAmount)}</b></> : <span className="text-muted-foreground">金额待试算</span>}{error && <div role="alert" className="mt-1 text-warning">{error}</div>}</div><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void submit(false)}>{busy ? '生成预览中…' : '预览结算单'}</Button><Button type="button" disabled={busy} onClick={() => void submit(true)}>{busy ? '处理中…' : editId ? '保存草稿修改' : '保存结算草稿'}</Button></div></div>
  </div>;
}

function GoodsSettlementDocumentPreview({ contract, preview, sources, sales, remarks }: {
  contract?: ContractOption; preview: any; sources: GoodsSource[]; sales: boolean; remarks: string;
}) {
  const supplier = contract?.seller?.name || (!sales ? contract?.counterparty?.name : undefined) || '—';
  const purchaser = contract?.buyer?.name || (sales ? contract?.counterparty?.name : undefined) || '—';
  const lines: any[] = preview.lines || [];
  const number = (value: unknown, digits = 2) => value == null || value === '' ? '—'
    : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
  const totalKnown = (key: 'grossWeight' | 'tareWeight' | 'netWeight' | 'dryQuantity') =>
    lines.length && lines.every(line => line.sourceSnapshot?.[key] != null)
      ? lines.reduce((sum, line) => sum + Number(line.sourceSnapshot[key]), 0) : null;
  return <div className="overflow-x-auto rounded-md border bg-slate-100 p-3 sm:p-5">
    <article className="mx-auto w-[1120px] bg-white p-8 text-black shadow-sm">
      <h3 className="text-center text-xl font-bold tracking-wider">{sales ? `${supplier}销售结算单` : `${purchaser}采购结算单`}</h3>
      <div className="mt-1 text-center text-xs">预览稿 · 未保存</div>
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-xs"><div>供方：{supplier}</div><div>需方：{purchaser}</div><div>合同编号：{contract?.contractNo || '—'}</div><div>结算单号：保存后生成</div><div>合同名称：{contract?.title || '—'}</div><div>结算日期：确认后生成</div></div>
      <table className="mt-5 w-full table-fixed border-collapse text-[11px] leading-tight">
        <colgroup>{[3, 8, 8, 13, 6, 7, 7, 7, 7, 8, 9, 8, 9].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{['序号', sales ? '交付日期' : '入库日期', '车牌', '货物', '水分（%）', '毛重（吨）', '皮重（吨）', '净重（吨）', '干基（吨）', '结算数量（吨）', '含税单价（元/吨）', '扣款/调整净额（元）', '含税金额（元）'].map(label => <th key={label} className="border border-black p-1 text-center">{label}</th>)}</tr></thead>
        <tbody>{lines.map((line, index) => {
          const source = line.sourceSnapshot || {};
          const vehicle = sources.find(item => item.id === line.waybillLineItemId);
          const adjustment = Number(line.adjustmentAmount || 0) - Number(line.qualityDeductionAmount || 0);
          const values = [index + 1, date(sales ? source.salesCompletionConfirmedAt : source.inboundDate), source.plateNo || vehicle?.plateNo || '—', source.materialName || vehicle?.materialName || '—', number(source.measuredMoisturePct), number(source.grossWeight), number(source.tareWeight), number(source.netWeight), number(source.dryQuantity), number(line.quantity, 3), number(line.unitPrice, 4), adjustment ? number(adjustment) : '—', number(line.totalAmount)];
          return <tr key={line.waybillLineItemId || index}>{values.map((value, cellIndex) => <td key={cellIndex} className={`border border-black p-1 ${cellIndex === 3 ? '' : 'text-center tabular-nums'}`}>{value}</td>)}</tr>;
        })}<tr className="font-semibold">{['合计', '', '', '', '', number(totalKnown('grossWeight')), number(totalKnown('tareWeight')), number(totalKnown('netWeight')), number(totalKnown('dryQuantity')), number(preview.quantity, 3), '见明细', number(Number(preview.adjustmentAmount || 0) - Number(preview.qualityDeductionAmount || 0)), number(preview.totalAmount)].map((value, index) => <td key={index} className="border border-black p-1 text-center tabular-nums">{value}</td>)}</tr></tbody>
      </table>
      <div className="mt-3 flex justify-end gap-6 border-b border-black pb-2 text-xs"><span>质量扣款：{number(preview.qualityDeductionAmount)} 元</span><span>其他加减：{number(preview.adjustmentAmount)} 元</span><strong>本次结算金额：{number(preview.totalAmount)} 元</strong></div>
      <div className="mt-3 min-h-12 border border-black p-2 text-xs"><strong>备注／双方确认事项：</strong>{remarks || '　'}</div>
      {lines.some(line => line.remarks) && <div className="mt-2 text-[11px]">逐车说明：{lines.filter(line => line.remarks).map(line => `${line.sourceSnapshot?.plateNo || line.sourceSnapshot?.waybillNo || '车辆'}：${line.remarks}`).join('；')}</div>}
      <div className="mt-6 grid grid-cols-2 gap-12 text-xs"><div><strong>供方确认：{supplier}</strong><p className="mt-5">经办人签字：____________　盖章：____________</p><p className="mt-4">日期：______年____月____日</p></div><div><strong>需方确认：{purchaser}</strong><p className="mt-5">经办人签字：____________　盖章：____________</p><p className="mt-4">日期：______年____月____日</p></div></div>
    </article>
  </div>;
}

function BasisMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="rounded-md border bg-background px-3 py-2.5"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 tabular-nums ${emphasis ? 'font-semibold text-primary' : 'font-medium'}`}>{value}</div></div>;
}

function WeighSideChoice({ source, stage, selectedId, lower, disabled, onSelect }: {
  source: GoodsSource; stage: 'SHIPPING' | 'RECEIVING'; selectedId?: string; lower: boolean; disabled: boolean; onSelect: (ticket: WeighTicket) => void;
}) {
  const tickets = source.availableWeighTickets?.filter(ticket => ticket.weighingStage === stage) || [];
  if (!tickets.length) return <span className="text-xs text-muted-foreground">暂无磅单</span>;
  return <div className="space-y-1.5">{tickets.map(ticket => {
    const selected = ticket.id === selectedId;
    const unavailable = ticket.isSelectable === false || ticket.netWeight == null;
    const isLower = lower && ticket.id === ticketForStage(source, stage)?.id;
    return <button key={ticket.id} type="button" aria-pressed={selected} aria-label={`${source.waybillNo}选用${stage === 'SHIPPING' ? '发货' : '收货'}磅单 ${ticket.ticketNo}`}
      disabled={disabled || unavailable} onClick={() => onSelect(ticket)}
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${selected ? 'border-primary bg-primary-bg text-primary' : isLower ? 'border-warning-border bg-warning-bg' : 'border-border bg-background hover:border-primary-border hover:bg-muted/30'} disabled:cursor-not-allowed disabled:opacity-60`}>
      <span className="min-w-0 truncate">{ticket.ticketNo}{unavailable && ' · 待采信'}</span>
      <span className={`shrink-0 tabular-nums ${isLower ? 'font-semibold text-warning' : ''}`}>{tons(ticket.netWeight)} 吨{isLower && ' · 较低'}</span>
    </button>;
  })}</div>;
}
