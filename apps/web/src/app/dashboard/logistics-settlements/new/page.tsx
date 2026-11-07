'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { promptAction } from '@/lib/system-dialog';
import { settlementColumnTotal } from '@/lib/settlement-table-totals';
import { candidateMatches, emptyCandidateFilters, logisticsDateError, logisticsSelectionGroup, retainCandidateSelection } from '@/lib/logistics-settlement-filters';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FreightWeightOption } from '@/components/logistics/freight-weight-option';
import { freightWeightChoices, freightWeightSelectionStage, switchFreightWeightStage } from '@/lib/logistics-weight';
import { LogisticsCandidate, LogisticsRate, LogisticsPartner, LogisticsField as Field, logisticsField, num, time, useLogisticsPermission, useLogisticsError } from '@/components/logistics/logistics-shared';

interface Line { rateId: string; ticketId: string; weightBasis: 'TICKET' | 'CONFIRMED'; confirmedWeight: string; weightReason: string; unitPrice: string; overrideReason: string; pricingBasis: string }
const firstRate = (w: LogisticsCandidate) => { const best = w.priceTerms.filter(t => Boolean(t.originLocation) === Boolean(w.priceTerms[0]?.originLocation)); return best.length === 1 ? best[0] : undefined; };
// 合同参考口径用于判断是否需要说明，不决定新建界面的默认勾选。
const contractTicketFor = (w: LogisticsCandidate, rate?: LogisticsRate) => rate && rate.contract.defaultWeightBasis !== 'SETTLEMENT' ? w.tickets.find(t => t.weighingStage === rate.contract.defaultWeightBasis)?.id || '' : w.defaultTicketId || '';
const defaultLine = (w: LogisticsCandidate): Line => {
  const rate = firstRate(w);
  return { rateId: rate?.id || '', ticketId: freightWeightChoices(w.tickets).defaultTicketId, weightBasis: 'TICKET', confirmedWeight: '', weightReason: '', unitPrice: rate?.unitPrice || '', overrideReason: '', pricingBasis: rate?.contract.settlementBasis || 'NET_WEIGHT' };
};
const uniqueOptions = (values: Array<{ id: string; name: string } | null | undefined>) => [...new Map(values.filter((value): value is { id: string; name: string } => Boolean(value)).map(value => [value.id, value])).values()];
export default function NewLogisticsSettlementPage() {
  const router = useRouter(), can = useLogisticsPermission();
  const canManage = can('logistics.settlement.manage');
  const [filters, setFilters] = useState(emptyCandidateFilters), [remarks, setRemarks] = useState('');
  const { from, to } = filters;
  const putFilter = (key: keyof typeof filters, value: string | boolean) => setFilters(current => ({ ...current, [key]: value, ...(key === 'contractId' ? { orderId: '' } : {}) }));
  const [candidates, setCandidates] = useState<LogisticsCandidate[]>([]), [lines, setLines] = useState<Record<string, Line>>({});
  const selectedRef = useRef(lines);
  selectedRef.current = lines;
  const [refreshNote, setRefreshNote] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [payers, setPayers] = useState<LogisticsPartner[]>([]), [payerId, setPayerId] = useState(''), [changePayer, setChangePayer] = useState(false), [payerReason, setPayerReason] = useState('');
  const [carriers, setCarriers] = useState<LogisticsPartner[]>([]), [pendingWaybillId, setPendingWaybillId] = useState(''), [bindingCarrierId, setBindingCarrierId] = useState('');
  const [error, setError] = useLogisticsError('请检查物流结算信息'), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  useEffect(() => { if (canManage) void api.get<{ payers: LogisticsPartner[]; carriers: LogisticsPartner[] }>('/logistics-settlements/options').then(r => { setPayers(r.payers); setCarriers(r.carriers || []); }).catch(e => setError(e.message)); }, [canManage, setError]);
  const selectedRows = candidates.filter(w => lines[w.id]), first = selectedRows[0];
  const filteredCandidates = candidates.filter(w => candidateMatches(w, filters, Boolean(lines[w.id]) || pendingWaybillId === w.id));
  const selectedInView = filteredCandidates.filter(w => lines[w.id]);
  const weighSelection = freightWeightSelectionStage(selectedInView, lines);
  const selectableInView = filteredCandidates.filter(w => logisticsSelectionGroup(w) && freightWeightChoices(w.tickets).defaultTicketId && (!first || logisticsSelectionGroup(w) === logisticsSelectionGroup(first)));
  const allSelectedInView = selectableInView.length > 0 && selectableInView.every(w => Boolean(lines[w.id]));
  const owners = uniqueOptions(candidates.map(w => w.payerPartner)), units = uniqueOptions(candidates.map(w => w.businessUnit));
  const carrierOptions = uniqueOptions(candidates.map(w => w.carrierPartnerId ? { id: w.carrierPartnerId, name: w.carrierName || '未填名称' } : null));
  const contractOptions = uniqueOptions(candidates.map(w => w.tradeContract ? { id: w.tradeContract.id, name: `${w.tradeContract.contractNo} · ${w.tradeContract.title}` } : null));
  const orderOptions = uniqueOptions(candidates.filter(w => !filters.contractId || w.tradeContract?.id === filters.contractId).map(w => w.order ? { id: w.order.id, name: `${w.order.orderNo} · ${w.order.name}` } : null));
  const dateError = logisticsDateError(from, to);
  const query = useCallback(async () => {
    setError(''); setRefreshNote(''); setBusy(true);
    try {
      const rows = await api.get<LogisticsCandidate[]>('/logistics-settlements/candidate-waybills');
      const ids = new Set(rows.map(row => row.id));
      const removed = Object.keys(selectedRef.current).filter(id => !ids.has(id));
      if (removed.length) setRefreshNote(`${removed.length} 张已选运单已被结算或失效，已移出本次选择，请核对剩余运单。`);
      setCandidates(rows);
      setLines(current => retainCandidateSelection(rows, current));
      setPendingWaybillId(current => rows.some(row => row.id === current && row.carrierPending) ? current : '');
      setSearched(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }, [setError]);
  useEffect(() => { if (canManage) void query(); }, [canManage, query]);
  const selectBoundWaybill = (w: LogisticsCandidate) => {
    setLines(rows => ({ ...rows, [w.id]: defaultLine(w) }));
    if (!first && w.payerPartner) { setPayerId(w.payerPartner.id); setChangePayer(false); setPayerReason(''); }
  };
  const toggle = (w: LogisticsCandidate) => {
    setError(''); setBulkNote('');
    if (pendingWaybillId === w.id) { setPendingWaybillId(''); setBindingCarrierId(''); return; }
    if (lines[w.id]) { setLines(rows => { const next = { ...rows }; delete next[w.id]; return next; }); return; }
    if (!w.payerPartner || !w.businessUnit || !freightWeightChoices(w.tickets).defaultTicketId) { setError('请先补齐货主、事业部及至少一张已复核的有效磅单'); return; }
    if (first && (first.payerPartner?.id !== w.payerPartner.id || first.businessUnit?.id !== w.businessUnit.id)) { setError('同一结算单请按同一货主、同一事业部选择运单'); return; }
    if (!w.carrierPartnerId) {
      if (w.freightMode !== 'SOCIAL') { setError('该运单尚未绑定承运方，请先在运单详情处理'); return; }
      setPendingWaybillId(w.id); setBindingCarrierId(first?.carrierPartnerId || ''); return;
    }
    if (first && first.carrierPartnerId !== w.carrierPartnerId) { setError('同一结算单请按同一承运方选择运单'); return; }
    selectBoundWaybill(w);
  };
  const bindAndSelect = async (w: LogisticsCandidate) => {
    if (!bindingCarrierId) { setError('请先选择物流承运商'); return; }
    if (first && (first.payerPartner?.id !== w.payerPartner?.id || first.businessUnit?.id !== w.businessUnit?.id)) { setError('同一结算单请按同一货主、同一事业部选择运单'); return; }
    if (first && first.carrierPartnerId !== bindingCarrierId) { setError('同一结算单请按同一承运方选择运单'); return; }
    setBusy(true); setError('');
    try {
      await api.post(`/logistics-settlements/candidate-waybills/${encodeURIComponent(w.id)}/carrier`, { carrierPartnerId: bindingCarrierId });
      const rows = await api.get<LogisticsCandidate[]>('/logistics-settlements/candidate-waybills');
      setCandidates(rows);
      setLines(current => retainCandidateSelection(rows, current));
      setPendingWaybillId(''); setBindingCarrierId('');
      const updated = rows.find(item => item.id === w.id);
      if (!updated) throw new Error('承运商已绑定，请重新查询可结算运单');
      selectBoundWaybill(updated);
    } catch (e: any) { setError(e.message || '绑定物流承运商失败'); } finally { setBusy(false); }
  };
  const put = (id: string, key: keyof Line, value: string) => setLines(rows => ({ ...rows, [id]: { ...rows[id], [key]: value } }));
  const changeRate = (w: LogisticsCandidate, id: string) => { const rate = w.priceTerms.find(t => t.id === id); setLines(rows => ({ ...rows, [w.id]: { ...rows[w.id], rateId: id, unitPrice: rate?.unitPrice || '', overrideReason: '', pricingBasis: rate?.contract.settlementBasis || 'NET_WEIGHT', ticketId: rows[w.id].ticketId || freightWeightChoices(w.tickets).defaultTicketId, ...(rate?.contract.settlementBasis === 'TRIP' ? { weightBasis: 'TICKET', confirmedWeight: '' } : {}) } })); };
  const selectTicket = (w: LogisticsCandidate, ticketId: string) => { setBulkNote(''); setLines(rows => rows[w.id] ? ({ ...rows, [w.id]: { ...rows[w.id], ticketId, weightBasis: 'TICKET', confirmedWeight: '' } }) : rows); };
  const bulkWeight = async (stage: 'SHIPPING' | 'RECEIVING') => {
    if (busy || !selectedInView.length) return;
    const label = stage === 'SHIPPING' ? '发货' : '收货';
    const plan = switchFreightWeightStage(selectedInView, lines, stage);
    if (!plan.switched.length) { setBulkNote(`当前已选运单均无有效${label}磅单，原选用口径保持不变。`); return; }
    const needsReason = selectedInView.some(w => {
      if (!plan.switched.includes(w.id)) return false;
      const line = lines[w.id], expected = contractTicketFor(w, w.priceTerms.find(rate => rate.id === line.rateId));
      return line.weightBasis === 'CONFIRMED' || (plan.lines[w.id].ticketId !== expected && !line.weightReason.trim());
    });
    let reason = '';
    if (needsReason) {
      const answer = await promptAction('部分运单将偏离合同参考口径，或替换手工确认重量。请填写本次统一选用依据。', '', { title: `统一选用${label}净重`, confirmText: '确认切换' });
      if (answer == null) return;
      reason = answer.trim();
      if (!reason) { setError('请填写统一选用重量的依据说明'); return; }
    }
    setLines(current => switchFreightWeightStage(selectedInView, current, stage, reason).lines);
    setBulkNote(`${plan.switched.length} 车已选用${label}净重${plan.missing.length ? `；${plan.missing.length} 车缺少有效${label}磅单，保留原口径` : ''}。`);
  };
  const amount = (w: LogisticsCandidate) => { const l = lines[w.id]; if (!l) return 0; const ticket = w.tickets.find(t => t.id === l.ticketId); const qty = l.pricingBasis === 'TRIP' ? 1 : l.weightBasis === 'CONFIRMED' ? Number(l.confirmedWeight) : Number(l.pricingBasis === 'GROSS_WEIGHT' ? ticket?.grossWeight : ticket?.netWeight); return Math.round((qty * Number(l.unitPrice) + Number.EPSILON) * 100) / 100 || 0; };
  const selectGroup = () => {
    setBulkNote('');
    if (pendingWaybillId) { setError('请先完成待绑定运单的承运商确认'); return; }
    const rows = filteredCandidates.filter(w => logisticsSelectionGroup(w) && freightWeightChoices(w.tickets).defaultTicketId);
    const groups = new Set(rows.map(logisticsSelectionGroup));
    if (!first && groups.size > 1) { setError('当前结果包含多个货主、事业部或承运方，请先筛选，或勾选一辆车确定本次结算分组'); return; }
    const anchor = first || rows[0];
    if (!anchor) { setError('当前结果没有可直接选择的运单，请先补齐承运方及有效磅单'); return; }
    const group = logisticsSelectionGroup(anchor);
    const compatible = rows.filter(w => logisticsSelectionGroup(w) === group);
    if (!compatible.length) { setError('当前筛选结果中没有属于本次结算分组的可选运单'); return; }
    setLines(current => ({ ...current, ...Object.fromEntries(compatible.map(w => [w.id, current[w.id] || defaultLine(w)])) }));
    if (!first && anchor.payerPartner) { setPayerId(anchor.payerPartner.id); setChangePayer(false); setPayerReason(''); }
  };
  const clearAll = () => {
    setLines({}); setPendingWaybillId(''); setBindingCarrierId(''); setPayerId(''); setChangePayer(false); setPayerReason(''); setBulkNote('');
  };
  const save = async () => { setBusy(true); setError(''); try {
    if (pendingWaybillId) throw new Error('请先为已勾选运单选择并保存物流承运商');
    if (!first) throw new Error('请至少选择一张运单');
    const payload = selectedRows.map(w => { const l = lines[w.id]; if (!l.ticketId) throw new Error(w.waybillNo + ' 请选择运费计费磅单'); if (w.priceTerms.length > 1 && !l.rateId) throw new Error(w.waybillNo + ' 请选择使用的合同运价');
      if ((l.weightBasis === 'CONFIRMED' || l.ticketId !== contractTicketFor(w, w.priceTerms.find(rate => rate.id === l.rateId))) && !l.weightReason.trim()) throw new Error(w.waybillNo + '：所选计费磅单与合同参考口径不同或使用双方确认重量，请补充重量依据说明');
      return { waybillId: w.id, contractPriceTermId: l.rateId || undefined, weighTicketId: l.ticketId, weightBasis: l.weightBasis, confirmedWeight: l.weightBasis === 'CONFIRMED' ? Number(l.confirmedWeight) : undefined, weightReason: l.weightReason || undefined, manualUnitPrice: l.unitPrice ? Number(l.unitPrice) : undefined, overrideReason: l.overrideReason || undefined, pricingBasis: l.pricingBasis === 'GROSS_WEIGHT' ? undefined : l.pricingBasis };
    });
    const created = await api.post<{ id: string }>('/logistics-settlements', { payerPartnerId: payerId || first.payerPartner?.id, payerChangeReason: payerReason || undefined, remarks, lines: payload });
    router.push('/dashboard/logistics-settlements/' + created.id);
  } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">新建物流结算单</h1><Button variant="outline" onClick={() => router.push('/dashboard/logistics-settlements')}>返回列表</Button></div>
    {error && <div role="alert" className="rounded-md border border-destructive-border bg-destructive-bg p-4 text-sm text-destructive">{error}</div>}
    {refreshNote && <div role="status" className="rounded-md border border-warning-border bg-warning-bg p-3 text-sm text-warning">{refreshNote}</div>}
    <Card className="p-4"><details><summary className="cursor-pointer text-sm font-medium">筛选运单（可选）{Object.values(filters).some(Boolean) && <span className="ml-2 text-xs text-primary">筛选中</span>}</summary><div className="mt-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div className="md:col-span-2"><Field label="关键词"><Input value={filters.search} onChange={e => putFilter('search', e.target.value)} placeholder="运单、车牌、物料、路线、合同或批次"/></Field></div>
        <Field label="业务方向"><select className={logisticsField} value={filters.businessType} onChange={e => putFilter('businessType', e.target.value)}><option value="">全部采购／销售</option><option value="PURCHASE">采购收货</option><option value="SALES">销售发货</option></select></Field>
        <Field label="物流承运方"><select className={logisticsField} value={filters.carrierId} onChange={e => putFilter('carrierId', e.target.value)}><option value="">全部承运方</option><option value="UNBOUND">待绑定承运方</option>{carrierOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="业务货主"><select className={logisticsField} value={filters.ownerId} onChange={e => putFilter('ownerId', e.target.value)}><option value="">全部货主</option>{owners.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="业务单元（事业部）"><select className={logisticsField} value={filters.businessUnitId} onChange={e => putFilter('businessUnitId', e.target.value)}><option value="">全部事业部</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="贸易合同"><select className={logisticsField} value={filters.contractId} onChange={e => putFilter('contractId', e.target.value)}><option value="">全部贸易合同</option>{contractOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="执行批次"><select className={logisticsField} value={filters.orderId} onChange={e => putFilter('orderId', e.target.value)}><option value="">全部执行批次</option>{orderOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="签收开始日期"><Input type="date" value={from} onChange={e => putFilter('from', e.target.value)}/></Field>
        <Field label="签收结束日期"><Input type="date" value={to} onChange={e => putFilter('to', e.target.value)}/></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.selectedOnly} onChange={e => putFilter('selectedOnly', e.target.checked)}/>仅看已选</label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setFilters(emptyCandidateFilters())}>重置筛选</Button><Button size="sm" variant="outline" disabled={busy || !canManage} onClick={() => void query()}>{busy ? '刷新中…' : '刷新运单'}</Button></div></div>
      {dateError && <p role="alert" className="text-sm text-destructive">{dateError}</p>}
      <p className="text-xs text-muted-foreground">仅展示已签收、未加入有效物流结算单的运单。同一结算单须为同一货主、事业部和承运方；筛选不清空已选，结算周期按全部已选运单自动生成。</p>
    </div></details></Card>
    {first && <Card className="space-y-4 p-5"><h2 className="font-semibold">结算主体</h2><div className="grid gap-4 text-sm md:grid-cols-2"><div><p className="text-muted-foreground">业务货主</p><p className="mt-1">{first.payerPartner?.name}</p></div><div><p className="text-muted-foreground">事业部 / 承运方</p><p className="mt-1">{first.businessUnit?.name} / {first.carrierName}</p></div></div><div className="flex items-center gap-3 text-sm"><span>本次付款主体：{payers.find(p => p.id === payerId)?.name || first.payerPartner?.name}</span><Button size="sm" variant="outline" onClick={() => setChangePayer(!changePayer)}>修改</Button></div>{changePayer && <div className="grid gap-4 md:grid-cols-2"><Field label="付款主体"><select className={logisticsField} value={payerId} onChange={e => setPayerId(e.target.value)}>{payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="修改原因 / 付款安排说明"><Input value={payerReason} onChange={e => setPayerReason(e.target.value)} placeholder="说明代付或其他约定，不改变原业务货主"/></Field></div>}{selectedRows.some(w => { const t = w.priceTerms.find(t => t.id === lines[w.id].rateId); return t && t.contract.signingPartnerId !== payerId; }) && <p className="text-sm text-warning">付款主体与所选物流合同签约主体不同，请点击“修改”填写付款安排说明，提交后由复核人员核对。</p>}</Card>}
    {searched && <Card className="overflow-hidden"><div className="space-y-3 border-b p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">可结算运单</h2><p className="mt-1 text-xs text-muted-foreground">当前结果 {filteredCandidates.length} / {candidates.length} 车 · 当前已选 {selectedInView.length} 车 · 全部已选 {selectedRows.length} 车</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={!selectedRows.length} onClick={() => setFilters({ ...emptyCandidateFilters(), selectedOnly: true })}>查看全部已选</Button></div></div><p className="text-xs text-muted-foreground">未绑定承运方的社会运力可逐车补绑，确认绑定会立即更新运单。默认选收货磅单；“较低”仅作重量比较提示。</p>{bulkNote && <p role="status" className="text-xs text-muted-foreground">{bulkNote}</p>}</div><div className="overflow-x-auto"><table className="w-full min-w-[1520px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>{['选择', '运单 / 车牌', '货物 / 业务方向', '货主 / 事业部', '承运方 / 路线', '发货净重（吨）', '收货净重（吨）', '发货 / 签收时间'].map(t => <th key={t} className="whitespace-nowrap p-3">{t}</th>)}</tr><tr className="border-t bg-surface-2 text-xs font-normal"><th className="min-w-40 p-3"><div className="flex gap-2"><Button size="sm" variant={allSelectedInView ? 'default' : 'outline'} aria-pressed={allSelectedInView} disabled={busy || !selectableInView.length} title="选中当前范围内同货主、同事业部、同承运方的可选运单" onClick={selectGroup}>{allSelectedInView ? '已全选' : '全选'}</Button><Button size="sm" variant="outline" disabled={busy || (!selectedRows.length && !pendingWaybillId)} title="取消全部已选运单，包含当前筛选外的选择" onClick={clearAll}>全部取消</Button></div></th><th colSpan={4} className="p-3 text-center font-normal">当前已选 {selectedInView.length} 车 · 可选 {selectableInView.length} 车 · 选用净重 {num(settlementColumnTotal(selectedInView.map(w => w.tickets.find(ticket => ticket.id === lines[w.id].ticketId)?.netWeight)))} 吨</th><th className="p-3"><Button size="sm" className="w-full whitespace-nowrap text-xs" variant={weighSelection === 'SHIPPING' ? 'default' : 'outline'} aria-pressed={weighSelection === 'SHIPPING'} disabled={busy || !selectedInView.length} title="统一修改当前表格中已选运单，不修改筛选外的选择" onClick={() => void bulkWeight('SHIPPING')}>{weighSelection === 'SHIPPING' ? '已选发货净重' : '统一选发货净重'}</Button></th><th className="p-3"><Button size="sm" className="w-full whitespace-nowrap text-xs" variant={weighSelection === 'RECEIVING' ? 'default' : 'outline'} aria-pressed={weighSelection === 'RECEIVING'} disabled={busy || !selectedInView.length} title="统一修改当前表格中已选运单，不修改筛选外的选择" onClick={() => void bulkWeight('RECEIVING')}>{weighSelection === 'RECEIVING' ? '已选收货净重' : '统一选收货净重'}</Button></th><th className="p-3 text-left font-normal text-muted-foreground">{weighSelection === 'MIXED' ? '当前为混合口径' : '批量切换当前已选'}</th></tr></thead><tbody>{filteredCandidates.map(w => {
      const l = lines[w.id], choices = freightWeightChoices(w.tickets, l?.ticketId), selectedTicketId = l ? l.ticketId : choices.defaultTicketId;
      const wrongGroup = Boolean(first && (first.payerPartner?.id !== w.payerPartner?.id || first.businessUnit?.id !== w.businessUnit?.id || (w.carrierPartnerId && first.carrierPartnerId !== w.carrierPartnerId)));
      const disabled = !l && (!w.payerPartner || !w.businessUnit || !choices.defaultTicketId || (w.carrierPending && w.freightMode !== 'SOCIAL') || wrongGroup);
      return <tr key={w.id} className={l || pendingWaybillId === w.id ? 'border-b bg-primary/5 align-top' : 'border-b align-top'}><td className="p-3"><input aria-label={'选择运单' + w.waybillNo} type="checkbox" checked={!!l || pendingWaybillId === w.id} disabled={busy || disabled} onChange={() => toggle(w)}/></td><td className="whitespace-nowrap p-3"><div>{w.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{w.plateNo || '—'}</div>{w.tradeContract && <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={w.tradeContract.title}>{w.tradeContract.contractNo}</div>}{w.order && <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={w.order.name}>{w.order.orderNo}</div>}</td><td className="min-w-40 p-3">{w.materialName}<div className="mt-1 text-xs text-muted-foreground">{w.businessType === 'PURCHASE' ? '采购收货' : '销售发货'}</div></td><td className="min-w-48 p-3">{w.payerPartner?.name || '货主待补充'}<div className="mt-1 text-xs text-muted-foreground">{w.businessUnit?.name || '事业部待补充'}</div></td><td className="min-w-64 p-3">{w.carrierName || '承运方待确定'}{pendingWaybillId === w.id && <div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label={'选择' + w.waybillNo + '的物流承运商'} className={logisticsField + ' min-w-44 flex-1'} value={bindingCarrierId} onChange={e => setBindingCarrierId(e.target.value)}><option value="">请选择物流承运商</option>{carriers.filter(carrier => !first || first.carrierPartnerId === carrier.id).map(carrier => <option key={carrier.id} value={carrier.id}>{carrier.code} · {carrier.name}</option>)}</select><Button size="sm" disabled={busy || !bindingCarrierId} onClick={() => void bindAndSelect(w)}>确认绑定</Button></div>}<div className="mt-1 text-xs text-muted-foreground">{w.originLocation || '—'} → {w.destinationLocation || '—'}</div>{wrongGroup && !l && <p className="mt-1 text-xs text-muted-foreground">不属于当前结算分组</p>}{!choices.defaultTicketId && <p className="mt-1 text-xs text-warning">缺少已复核有效磅单</p>}</td>{(['SHIPPING', 'RECEIVING'] as const).map(stage => { const ticket = stage === 'SHIPPING' ? choices.shipping : choices.receiving; return <td key={stage} className="min-w-44 p-3"><FreightWeightOption ticket={ticket} stage={stage} waybillNo={w.waybillNo} group={'freight-weight-' + w.id} checked={l?.weightBasis !== 'CONFIRMED' && !!ticket && selectedTicketId === ticket.id} lower={choices.lowerStage === stage} disabled={busy || disabled || !l} onSelect={ticketId => selectTicket(w, ticketId)}/></td>; })}<td className="whitespace-nowrap p-3 text-xs">{time(w.departedAt)}<div className="mt-1 text-muted-foreground">{time(w.signedAt)}</div></td></tr>;
    })}{!filteredCandidates.length && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">当前筛选条件下没有可结算运单</td></tr>}</tbody><tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={5} className="p-3">当前筛选已选合计（{selectedInView.length} 车）</td>{(['SHIPPING', 'RECEIVING'] as const).map(stage => <td key={stage} className="p-3">{num(settlementColumnTotal(selectedInView.map(w => { const choices = freightWeightChoices(w.tickets, lines[w.id]?.ticketId); return (stage === 'SHIPPING' ? choices.shipping : choices.receiving)?.netWeight; })))}</td>)}<td className="p-3">含税合计 {num(selectedInView.reduce((sum, w) => sum + amount(w), 0), 2)} 元</td></tr></tfoot></table></div></Card>}
    {selectedRows.map(w => { const l = lines[w.id], rate = w.priceTerms.find(t => t.id === l.rateId), ticket = w.tickets.find(t => t.id === l.ticketId), expected = contractTicketFor(w, rate);
      return <Card className="space-y-4 p-5" key={w.id}>
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{w.waybillNo} · {w.plateNo || '未填车牌'}</h2><span className="text-sm font-medium">含税金额：{num(amount(w), 2)} 元</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="物流合同运价"><select className={logisticsField} value={l.rateId} onChange={e => changeRate(w, e.target.value)}><option value="">{w.priceTerms.length ? '请选择适用合同运价' : '无适用合同，手工确认运价'}</option>{w.priceTerms.map(t => <option key={t.id} value={t.id}>{t.contract.contractNo} · {t.contract.title || ''} · {t.unitPrice} {t.contract.settlementBasis === 'TRIP' ? '元/车次' : '元/吨'} · {t.originLocation ? t.originLocation + '→' + t.destinationLocation : '不限路线'}</option>)}</select></Field>
          <Field label="计价方式"><select className={logisticsField} disabled={!!rate} value={l.pricingBasis} onChange={e => put(w.id, 'pricingBasis', e.target.value)}><option value="NET_WEIGHT">按净重（元/吨）</option><option value="TRIP">按车次（元/车次）</option>{l.pricingBasis === 'GROSS_WEIGHT' && <option value="GROSS_WEIGHT">按毛重（历史口径）</option>}</select></Field>
          <Field label="本次含税结算单价"><Input type="number" min="0.01" step="0.01" value={l.unitPrice} onChange={e => put(w.id, 'unitPrice', e.target.value)}/></Field>
          <Field label="运费计费磅单 *"><select className={logisticsField} value={l.ticketId} onChange={e => selectTicket(w, e.target.value)}><option value="">请选择有效磅单</option>{w.tickets.map(t => <option key={t.id} value={t.id}>{t.ticketNo} · {t.weighingStage === 'SHIPPING' ? '发货' : '收货'} · 净重 {t.netWeight} 吨{t.id === freightWeightChoices(w.tickets).defaultTicketId ? '（默认）' : ''}</option>)}</select></Field>
          <Field label="计费重量口径"><select className={logisticsField} value={l.weightBasis} disabled={l.pricingBasis === 'TRIP'} onChange={e => put(w.id, 'weightBasis', e.target.value)}><option value="TICKET">使用选定磅单重量</option><option value="CONFIRMED">双方确认重量</option></select></Field>
          {l.weightBasis === 'CONFIRMED' && <Field label="双方确认重量（吨） *"><Input type="number" min="0.001" step="0.001" value={l.confirmedWeight} onChange={e => put(w.id, 'confirmedWeight', e.target.value)}/></Field>}
          <Field label={'重量依据说明' + (l.ticketId !== expected || l.weightBasis === 'CONFIRMED' ? ' *' : '')}><Input value={l.weightReason} onChange={e => put(w.id, 'weightReason', e.target.value)} placeholder="不同于合同参考口径或双方确认重量时必填"/></Field>
          {rate && Number(l.unitPrice) !== Number(rate.unitPrice) && <Field label="运价调整原因 *"><Input value={l.overrideReason} onChange={e => put(w.id, 'overrideReason', e.target.value)} placeholder="原合同运价不变，仅调整本次结算"/></Field>}
        </div>
        <p className="text-xs text-muted-foreground">选用磅单毛重 {num(ticket?.grossWeight)} 吨，皮重 {num(ticket?.tareWeight)} 吨，净重 {num(ticket?.netWeight)} 吨。物流选择不修改库存和货款依据。{l.weightBasis === 'CONFIRMED' && '保存草稿后请在详情上传双方重量确认依据。'}</p>
      </Card>;
    })}
    <Card className="p-5"><Field label="结算说明"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="其他费用或付款安排说明"/></Field></Card><div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 p-4"><p className="text-sm">全部已选 {selectedRows.length} 车{selectedRows.length > selectedInView.length && <span className="text-warning">（{selectedRows.length - selectedInView.length} 车在筛选结果外）</span>}{pendingWaybillId ? ' · 1 车待绑定承运商' : ''} · 含税合计 {num(selectedRows.reduce((sum, w) => sum + amount(w), 0), 2)} 元</p><Button disabled={busy || !!pendingWaybillId || !selectedRows.length || !can('logistics.settlement.manage')} onClick={() => void save()}>{busy ? '保存中…' : '保存结算草稿'}</Button></div>
  </div>;
}
