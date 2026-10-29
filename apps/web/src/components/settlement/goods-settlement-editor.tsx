'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GoodsEvidence, GoodsSource, paymentMoney } from './purchase-payment-context';

const weight = (value: number | null | undefined) => value == null ? '—' : value.toFixed(3);
const inboundDay = (value: string | null | undefined) => value
  ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';

export function GoodsSettlementEditor() {
  const router = useRouter(), query = useSearchParams();
  const [contracts, setContracts] = useState<any[]>([]), [sources, setSources] = useState<GoodsSource[]>([]);
  const [contractId, setContractId] = useState(query.get('contractId') || ''), [search, setSearch] = useState('');
  const [lines, setLines] = useState<Record<string, { quantity: string; adjustmentAmount: string; remarks: string }>>({});
  const [dueDate, setDueDate] = useState(''), [remarks, setRemarks] = useState(''), [preview, setPreview] = useState<any>(null);
  const [taxRatePct, setTaxRatePct] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [canAccept, setCanAccept] = useState(false);
  useEffect(() => { void api.get<any[]>('/financial-settlements/options/contracts?direction=PAYABLE').then(setContracts).catch(e => setError(e.message)); try { const u = JSON.parse(localStorage.getItem('user') || '{}'); setCanAccept(u.role === 'ADMIN' || u.permissions?.includes('settlement.quality.accept') || u.permissions?.includes('settlement.manage')); } catch {} }, []);
  const refresh = useCallback(async () => { if (contractId) setSources(await api.get(`/financial-settlements/options/goods-sources?contractId=${contractId}`)); }, [contractId]);
  useEffect(() => { setSources([]); setLines({}); setPreview(null); if (contractId) void refresh().catch(e => setError(e.message)); }, [contractId, refresh]);
  const update = (id: string, key: string, value: string) => { setLines(rows => ({ ...rows, [id]: { ...rows[id], [key]: value } })); setPreview(null); };
  const gradeTier = contracts.find(contract => contract.id === contractId)?.pricingType === 'GRADE_TIER';
  const payload = () => ({ contractId, direction: 'PAYABLE', settlementScope: 'GOODS', dueDate: dueDate ? `${dueDate}T12:00:00+08:00` : undefined, remarks,
    taxRatePct: gradeTier && taxRatePct !== '' ? Number(taxRatePct) : undefined,
    lines: Object.entries(lines).map(([id, line]) => ({ orderId: sources.find(s => s.id === id)?.orderId, waybillLineItemId: id, quantity: Number(line.quantity), adjustmentAmount: Number(line.adjustmentAmount || 0), remarks: line.remarks })) });
  useEffect(() => {
    if (!contractId || !Object.keys(lines).length || (gradeTier && (taxRatePct === '' || !Number.isFinite(Number(taxRatePct))))) return;
    if (Object.values(lines).some(line => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.post<any>('/financial-settlements/preview-goods', payload())
        .then(result => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  // 只在影响明细金额的输入变化后自动试算；日期和说明不触发重复计算。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, lines, sources, gradeTier, taxRatePct]);
  const submit = async (save: boolean) => {
    setBusy(true); setError('');
    try {
      if (!Object.keys(lines).length) throw new Error('请至少选择一项可以结算的运单货物');
      if (gradeTier && (taxRatePct === '' || !Number.isFinite(Number(taxRatePct)) || Number(taxRatePct) < 0 || Number(taxRatePct) > 100)) throw new Error('请填写并确认本次结算的适用税率');
      const result = await api.post<any>(save ? '/financial-settlements' : '/financial-settlements/preview-goods', payload());
      if (save) router.push(`/dashboard/settlements/${result.id}`); else setPreview(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">新建采购结算单</h1><Button variant="outline" onClick={() => router.back()}>返回</Button></div><p className="text-sm text-muted-foreground">按采购入库过账数量、结算入库磅单及最终检测依据确认货款，预付款通过后续核销抵扣。</p>
    {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-2 text-sm"><span>采购合同 *</span><select className="h-10 w-full rounded-md border bg-background px-3" value={contractId} onChange={e => setContractId(e.target.value)}><option value="">请选择</option>{contracts.filter(c => c.id === contractId || `${c.contractNo} ${c.title} ${c.counterparty?.name}`.includes(search.trim())).map(c => <option key={c.id} value={c.id}>{c.contractNo} · {c.title} · {c.counterparty?.name}</option>)}</select></label><label className="space-y-2 text-sm"><span>查找合同</span><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="合同编号、标题或供应商"/></label></Card>
    <Card className="p-5"><h2 className="mb-3 font-semibold">货物与质量依据</h2><GoodsEvidence sources={sources} selected={Object.keys(lines)} canAccept={canAccept} reload={refresh} onSelect={(id, checked) => { const s = sources.find(v => v.id === id)!; if (checked && !s.available) return setError(s.reasons.join('；')); setLines(rows => { const next = { ...rows }; if (checked) next[id] = { quantity: String(s.remainingQuantity), adjustmentAmount: '0', remarks: '' }; else delete next[id]; return next; }); setPreview(null); }}/></Card>
    {gradeTier && <Card className="space-y-2 p-5"><label className="block max-w-xs space-y-1 text-sm"><span>本次结算适用税率（%）*</span><Input type="number" min="0" max="100" step="0.01" value={taxRatePct} onChange={event => { setTaxRatePct(event.target.value); setPreview(null); }} placeholder="由经办人填写并确认" /></label><p className="text-xs text-muted-foreground">档位价格为不含税元/度；系统按实测 CaF₂ 百分数数值计算税前金额，再按此税率计算含税金额。表外品位、水分超限或缺报告须先人工确认，不自动生成结算。</p></Card>}
    {Object.keys(lines).length > 0 && <Card className="space-y-4 p-5"><div><h2 className="font-semibold">本次逐车结算明细</h2><p className="mt-1 text-xs text-muted-foreground">磅单重量、质检水分和参考干基由前序单据带入；结算数量默认取本次可结算量。若双方协商数量不同，请逐车核对并填写本次数量，未结余量仍可后续处理。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="p-2">入库日期 / 运单</th><th className="p-2">车牌 / 物料</th><th className="p-2 text-right">水分（%）</th><th className="p-2 text-right">毛重（吨）</th><th className="p-2 text-right">皮重（吨）</th><th className="p-2 text-right">净重（吨）</th><th className="p-2 text-right">参考干基（吨）</th><th className="min-w-36 p-2">本次结算数量（吨）</th><th className="p-2 text-right">{gradeTier ? '不含税单价（元/吨）' : '含税单价（元/吨）'}</th><th className="min-w-36 p-2">其他加减项（元）</th><th className="min-w-48 p-2">调整原因</th><th className="p-2 text-right">含税金额（元）</th></tr></thead><tbody>{Object.entries(lines).map(([id, line]) => { const s = sources.find(v => v.id === id); const result = preview?.lines?.find((entry: any) => entry.waybillLineItemId === id); return <tr className="border-t align-top" key={id}><td className="p-2">{inboundDay(s?.inboundDate)}<div className="text-xs text-muted-foreground">{s?.waybillNo || '—'}</div></td><td className="p-2">{s?.plateNo || '—'}<div className="text-xs text-muted-foreground">{s?.materialName || '—'}</div></td><td className="p-2 text-right tabular-nums">{s?.measuredMoisturePct ?? '—'}</td><td className="p-2 text-right tabular-nums">{weight(s?.grossWeight)}</td><td className="p-2 text-right tabular-nums">{weight(s?.tareWeight)}</td><td className="p-2 text-right tabular-nums">{weight(s?.netWeight)}</td><td className="p-2 text-right tabular-nums">{weight(s?.dryQuantity)}</td><td className="p-2"><Input aria-label={`${s?.waybillNo || id}本次结算数量`} type="number" min="0.001" max={s?.remainingQuantity} step="0.001" value={line.quantity} onChange={e => update(id, 'quantity', e.target.value)}/><div className="mt-1 text-xs text-muted-foreground">可用 {weight(s?.remainingQuantity)}</div></td><td className="p-2 text-right tabular-nums">{s?.unitPrice == null ? '—' : paymentMoney(s.unitPrice)}</td><td className="p-2"><Input aria-label={`${s?.waybillNo || id}其他加减项`} type="number" step="0.01" value={line.adjustmentAmount} onChange={e => update(id, 'adjustmentAmount', e.target.value)}/></td><td className="p-2"><Input aria-label={`${s?.waybillNo || id}调整原因`} value={line.remarks} placeholder="有调整时必填" onChange={e => update(id, 'remarks', e.target.value)}/></td><td className="p-2 text-right font-medium tabular-nums">{result ? paymentMoney(result.totalAmount) : '预览后自动计算'}</td></tr>; })}</tbody></table></div><p className="text-xs text-muted-foreground">价格与金额以“预览结算计算”的系统结果为准；质量扣款和税额在预览中分别列示，不在逐车栏内重复手填。</p></Card>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-2 text-sm"><span>约定付款到期日</span><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><label className="space-y-2 text-sm"><span>结算说明</span><Input value={remarks} onChange={e => setRemarks(e.target.value)}/></label></Card>
    {preview && <Card className="grid gap-4 p-5 text-sm sm:grid-cols-4">{[['货物原金额（含税）', preview.grossAmount], ['质量价格扣款', preview.qualityDeductionAmount], ['其他加减项', preview.adjustmentAmount], ['本次采购结算金额', preview.totalAmount]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{paymentMoney(value)}</p></div>)}{gradeTier && <p className="col-span-full text-xs text-muted-foreground">税前金额 {paymentMoney(preview.lines?.reduce((sum: number, line: any) => sum + Number(line.sourceSnapshot?.amountExTax || 0), 0))} · 税额 {paymentMoney(preview.lines?.reduce((sum: number, line: any) => sum + Number(line.sourceSnapshot?.taxAmount || 0), 0))}</p>}</Card>}
    <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => void submit(false)}>预览结算计算</Button><Button disabled={busy} onClick={() => void submit(true)}>{busy ? '处理中…' : '保存结算草稿'}</Button></div>
  </div>;
}
