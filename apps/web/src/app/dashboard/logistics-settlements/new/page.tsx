'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FreightWeightOption } from '@/components/logistics/freight-weight-option';
import { freightWeightChoices } from '@/lib/logistics-weight';
import { LogisticsCandidate, LogisticsRate, LogisticsPartner, LogisticsField as Field, logisticsField, num, time, useLogisticsPermission, useLogisticsError } from '@/components/logistics/logistics-shared';

interface Line { rateId: string; ticketId: string; weightBasis: 'TICKET' | 'CONFIRMED'; confirmedWeight: string; weightReason: string; unitPrice: string; overrideReason: string; pricingBasis: string }
const firstRate = (w: LogisticsCandidate) => { const best = w.priceTerms.filter(t => Boolean(t.originLocation) === Boolean(w.priceTerms[0]?.originLocation)); return best.length === 1 ? best[0] : undefined; };
// 合同参考口径用于判断是否需要说明，不决定新建界面的默认勾选。
const contractTicketFor = (w: LogisticsCandidate, rate?: LogisticsRate) => rate && rate.contract.defaultWeightBasis !== 'SETTLEMENT' ? w.tickets.find(t => t.weighingStage === rate.contract.defaultWeightBasis)?.id || '' : w.defaultTicketId || '';
export default function NewLogisticsSettlementPage() {
  const router = useRouter(), can = useLogisticsPermission();
  const canManage = can('logistics.settlement.manage');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [search, setSearch] = useState(''), [remarks, setRemarks] = useState('');
  const [candidates, setCandidates] = useState<LogisticsCandidate[]>([]), [lines, setLines] = useState<Record<string, Line>>({});
  const [payers, setPayers] = useState<LogisticsPartner[]>([]), [payerId, setPayerId] = useState(''), [changePayer, setChangePayer] = useState(false), [payerReason, setPayerReason] = useState('');
  const [carriers, setCarriers] = useState<LogisticsPartner[]>([]), [pendingWaybillId, setPendingWaybillId] = useState(''), [bindingCarrierId, setBindingCarrierId] = useState('');
  const [error, setError] = useLogisticsError('请检查物流结算信息'), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  useEffect(() => { if (canManage) void api.get<{ payers: LogisticsPartner[]; carriers: LogisticsPartner[] }>('/logistics-settlements/options').then(r => { setPayers(r.payers); setCarriers(r.carriers || []); }).catch(e => setError(e.message)); }, [canManage, setError]);
  const selectedRows = candidates.filter(w => lines[w.id]), first = selectedRows[0];
  const query = useCallback(async (periodStart = '', periodEnd = '') => {
    setError(''); setBusy(true);
    try {
      const params = new URLSearchParams();
      if (periodStart) params.set('periodStart', periodStart);
      if (periodEnd) params.set('periodEnd', periodEnd);
      setCandidates(await api.get('/logistics-settlements/candidate-waybills' + (params.size ? '?' + params : '')));
      setLines({}); setPayerId(''); setChangePayer(false); setPayerReason(''); setPendingWaybillId(''); setBindingCarrierId(''); setSearched(true);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }, [setError]);
  useEffect(() => { if (canManage) void query(); }, [canManage, query]);
  const selectBoundWaybill = (w: LogisticsCandidate) => {
    const rate = firstRate(w);
    setLines(rows => ({ ...rows, [w.id]: { rateId: rate?.id || '', ticketId: freightWeightChoices(w.tickets).defaultTicketId, weightBasis: 'TICKET', confirmedWeight: '', weightReason: '', unitPrice: rate?.unitPrice || '', overrideReason: '', pricingBasis: rate?.contract.settlementBasis || 'NET_WEIGHT' } }));
    if (!first && w.payerPartner) { setPayerId(w.payerPartner.id); setChangePayer(false); setPayerReason(''); }
  };
  const toggle = (w: LogisticsCandidate) => {
    setError('');
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
      const params = new URLSearchParams();
      if (from) params.set('periodStart', from);
      if (to) params.set('periodEnd', to);
      const rows = await api.get<LogisticsCandidate[]>('/logistics-settlements/candidate-waybills' + (params.size ? '?' + params : ''));
      setCandidates(rows);
      setPendingWaybillId(''); setBindingCarrierId('');
      const updated = rows.find(item => item.id === w.id);
      if (!updated) throw new Error('承运商已绑定，请重新查询可结算运单');
      selectBoundWaybill(updated);
    } catch (e: any) { setError(e.message || '绑定物流承运商失败'); } finally { setBusy(false); }
  };
  const put = (id: string, key: keyof Line, value: string) => setLines(rows => ({ ...rows, [id]: { ...rows[id], [key]: value } }));
  const changeRate = (w: LogisticsCandidate, id: string) => { const rate = w.priceTerms.find(t => t.id === id); setLines(rows => ({ ...rows, [w.id]: { ...rows[w.id], rateId: id, unitPrice: rate?.unitPrice || '', overrideReason: '', pricingBasis: rate?.contract.settlementBasis || 'NET_WEIGHT', ticketId: rows[w.id].ticketId || freightWeightChoices(w.tickets).defaultTicketId, ...(rate?.contract.settlementBasis === 'TRIP' ? { weightBasis: 'TICKET', confirmedWeight: '' } : {}) } })); };
  const selectTicket = (w: LogisticsCandidate, ticketId: string) => setLines(rows => rows[w.id] ? ({ ...rows, [w.id]: { ...rows[w.id], ticketId, weightBasis: 'TICKET', confirmedWeight: '' } }) : rows);
  const amount = (w: LogisticsCandidate) => { const l = lines[w.id]; if (!l) return 0; const ticket = w.tickets.find(t => t.id === l.ticketId); const qty = l.pricingBasis === 'TRIP' ? 1 : l.weightBasis === 'CONFIRMED' ? Number(l.confirmedWeight) : Number(l.pricingBasis === 'GROSS_WEIGHT' ? ticket?.grossWeight : ticket?.netWeight); return Math.round((qty * Number(l.unitPrice) + Number.EPSILON) * 100) / 100 || 0; };
  const save = async () => { setBusy(true); setError(''); try {
    if (pendingWaybillId) throw new Error('请先为已勾选运单选择并保存物流承运商');
    if (!first) throw new Error('请至少选择一张运单');
    const payload = selectedRows.map(w => { const l = lines[w.id]; if (!l.ticketId) throw new Error(w.waybillNo + ' 请选择运费计费磅单'); if (w.priceTerms.length > 1 && !l.rateId) throw new Error(w.waybillNo + ' 请选择使用的合同运价');
      if ((l.weightBasis === 'CONFIRMED' || l.ticketId !== contractTicketFor(w, w.priceTerms.find(rate => rate.id === l.rateId))) && !l.weightReason.trim()) throw new Error(w.waybillNo + '：所选计费磅单与合同参考口径不同或使用双方确认重量，请补充重量依据说明');
      return { waybillId: w.id, contractPriceTermId: l.rateId || undefined, weighTicketId: l.ticketId, weightBasis: l.weightBasis, confirmedWeight: l.weightBasis === 'CONFIRMED' ? Number(l.confirmedWeight) : undefined, weightReason: l.weightReason || undefined, manualUnitPrice: l.unitPrice ? Number(l.unitPrice) : undefined, overrideReason: l.overrideReason || undefined, pricingBasis: l.pricingBasis === 'GROSS_WEIGHT' ? undefined : l.pricingBasis };
    });
    const created = await api.post<{ id: string }>('/logistics-settlements', { periodStart: from || undefined, periodEnd: to || undefined, payerPartnerId: payerId || first.payerPartner?.id, payerChangeReason: payerReason || undefined, remarks, lines: payload });
    router.push('/dashboard/logistics-settlements/' + created.id);
  } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">新建物流结算单</h1><Button variant="outline" onClick={() => router.push('/dashboard/logistics-settlements')}>返回列表</Button></div>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <Card className="space-y-4 p-5"><h2 className="font-semibold">选择运输范围</h2><div className="grid items-end gap-4 md:grid-cols-3"><Field label="签收开始日期（选填）"><Input type="date" value={from} onChange={e => setFrom(e.target.value)}/></Field><Field label="签收结束日期（选填）"><Input type="date" value={to} onChange={e => setTo(e.target.value)}/></Field><div className="flex gap-2"><Button className="flex-1" variant="outline" disabled={busy || !canManage} onClick={() => void query(from, to)}>{busy ? '查询中…' : '查询可结算运单'}</Button><Button variant="outline" disabled={busy || !canManage} onClick={() => { setFrom(''); setTo(''); void query(); }}>重置</Button></div></div><p className="text-xs text-muted-foreground">默认展示当前权限范围内全部已签收、尚未结算的运单，日期仅用于筛选。不填日期时，结算周期按所选运单的签收日期自动生成。每张结算单对应同一事业部、货主及承运方。</p></Card>
    {first && <Card className="space-y-4 p-5"><h2 className="font-semibold">结算主体</h2><div className="grid gap-4 text-sm md:grid-cols-2"><div><p className="text-muted-foreground">业务货主</p><p className="mt-1">{first.payerPartner?.name}</p></div><div><p className="text-muted-foreground">事业部 / 承运方</p><p className="mt-1">{first.businessUnit?.name} / {first.carrierName}</p></div></div><div className="flex items-center gap-3 text-sm"><span>本次付款主体：{payers.find(p => p.id === payerId)?.name || first.payerPartner?.name}</span><Button size="sm" variant="outline" onClick={() => setChangePayer(!changePayer)}>修改</Button></div>{changePayer && <div className="grid gap-4 md:grid-cols-2"><Field label="付款主体"><select className={logisticsField} value={payerId} onChange={e => setPayerId(e.target.value)}>{payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="修改原因 / 付款安排说明"><Input value={payerReason} onChange={e => setPayerReason(e.target.value)} placeholder="说明代付或其他约定，不改变原业务货主"/></Field></div>}{selectedRows.some(w => { const t = w.priceTerms.find(t => t.id === lines[w.id].rateId); return t && t.contract.signingPartnerId !== payerId; }) && <p className="text-sm text-amber-700">付款主体与所选物流合同签约主体不同，请点击“修改”填写付款安排说明，提交后由复核人员核对。</p>}</Card>}
    {searched && <Card className="overflow-hidden"><div className="space-y-3 border-b p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">可结算运单（已选 {selectedRows.length} / {candidates.length}）</h2><Input className="max-w-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="运单、车牌、货物、企业模糊搜索"/></div><p className="text-xs text-muted-foreground">未绑定承运商的社会运力运单可先勾选、补绑后加入结算；确认绑定会立即更新运单，即使之后不保存结算草稿。默认选用收货净重，只有一张有效磅单时选用该张。勾选运单后可切换发货或收货重量；<span className="text-primary">蓝色“较低”</span>仅作比较提示，不自动选用较低值。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>{['选择', '运单 / 车牌', '货物 / 业务方向', '货主 / 事业部', '承运方 / 路线', '发货净重（吨）', '收货净重（吨）', '发货 / 签收时间'].map(t => <th key={t} className="whitespace-nowrap p-3">{t}</th>)}</tr></thead><tbody>{candidates.filter(w => [w.waybillNo, w.plateNo, w.materialName, w.payerPartner?.name, w.carrierName].join(' ').toLowerCase().includes(search.trim().toLowerCase())).map(w => {
      const l = lines[w.id], choices = freightWeightChoices(w.tickets, l?.ticketId), selectedTicketId = l ? l.ticketId : choices.defaultTicketId;
      const disabled = !w.payerPartner || !w.businessUnit || !choices.defaultTicketId || (w.carrierPending && w.freightMode !== 'SOCIAL');
      return <tr key={w.id} className={l || pendingWaybillId === w.id ? 'border-b bg-primary/5 align-top' : 'border-b align-top'}><td className="p-3"><input aria-label={'选择运单' + w.waybillNo} type="checkbox" checked={!!l || pendingWaybillId === w.id} disabled={busy || disabled} onChange={() => toggle(w)}/></td><td className="whitespace-nowrap p-3"><div>{w.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{w.plateNo || '—'}</div></td><td className="min-w-40 p-3">{w.materialName}<div className="mt-1 text-xs text-muted-foreground">{w.businessType === 'PURCHASE' ? '采购收货' : '销售发货'}</div></td><td className="min-w-48 p-3">{w.payerPartner?.name || '货主待补充'}<div className="mt-1 text-xs text-muted-foreground">{w.businessUnit?.name || '事业部待补充'}</div></td><td className="min-w-64 p-3">{w.carrierName || '承运方待确定'}{pendingWaybillId === w.id && <div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label={'选择' + w.waybillNo + '的物流承运商'} className={logisticsField + ' min-w-44 flex-1'} value={bindingCarrierId} onChange={e => setBindingCarrierId(e.target.value)}><option value="">请选择物流承运商</option>{carriers.filter(carrier => !first || first.carrierPartnerId === carrier.id).map(carrier => <option key={carrier.id} value={carrier.id}>{carrier.code} · {carrier.name}</option>)}</select><Button size="sm" disabled={busy || !bindingCarrierId} onClick={() => void bindAndSelect(w)}>确认绑定</Button></div>}<div className="mt-1 text-xs text-muted-foreground">{w.originLocation || '—'} → {w.destinationLocation || '—'}</div>{!choices.defaultTicketId && <p className="mt-1 text-xs text-amber-700">缺少已复核有效磅单</p>}</td>{(['SHIPPING', 'RECEIVING'] as const).map(stage => { const ticket = stage === 'SHIPPING' ? choices.shipping : choices.receiving; return <td key={stage} className="min-w-44 p-3"><FreightWeightOption ticket={ticket} stage={stage} waybillNo={w.waybillNo} group={'freight-weight-' + w.id} checked={l?.weightBasis !== 'CONFIRMED' && !!ticket && selectedTicketId === ticket.id} lower={choices.lowerStage === stage} disabled={busy || disabled || !l} onSelect={ticketId => selectTicket(w, ticketId)}/></td>; })}<td className="whitespace-nowrap p-3 text-xs">{time(w.departedAt)}<div className="mt-1 text-muted-foreground">{time(w.signedAt)}</div></td></tr>;
    })}{!candidates.length && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">当前筛选条件下没有可结算运单</td></tr>}</tbody></table></div></Card>}
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
    <Card className="p-5"><Field label="结算说明"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="其他费用或付款安排说明"/></Field></Card><div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 p-4"><p className="text-sm">已选 {selectedRows.length} 车{pendingWaybillId ? ' · 1 车待绑定承运商' : ''} · 含税合计 {num(selectedRows.reduce((sum, w) => sum + amount(w), 0), 2)} 元</p><Button disabled={busy || !!pendingWaybillId || !selectedRows.length || !can('logistics.settlement.manage')} onClick={() => void save()}>{busy ? '保存中…' : '保存结算草稿'}</Button></div>
  </div>;
}
