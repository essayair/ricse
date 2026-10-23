'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { GoodsEvidence, GoodsSource, paymentMoney } from './purchase-payment-context';

export function GoodsSettlementEditor() {
  const router = useRouter(), query = useSearchParams();
  const [contracts, setContracts] = useState<any[]>([]), [sources, setSources] = useState<GoodsSource[]>([]);
  const [contractId, setContractId] = useState(query.get('contractId') || ''), [search, setSearch] = useState('');
  const [lines, setLines] = useState<Record<string, { quantity: string; adjustmentAmount: string; remarks: string }>>({});
  const [dueDate, setDueDate] = useState(''), [remarks, setRemarks] = useState(''), [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [canAccept, setCanAccept] = useState(false);
  useEffect(() => { void api.get<any[]>('/financial-settlements/options/contracts?direction=PAYABLE').then(setContracts).catch(e => setError(e.message)); try { const u = JSON.parse(localStorage.getItem('user') || '{}'); setCanAccept(u.role === 'ADMIN' || u.permissions?.includes('settlement.quality.accept') || u.permissions?.includes('settlement.manage')); } catch {} }, []);
  const refresh = useCallback(async () => { if (contractId) setSources(await api.get(`/financial-settlements/options/goods-sources?contractId=${contractId}`)); }, [contractId]);
  useEffect(() => { setSources([]); setLines({}); setPreview(null); if (contractId) void refresh().catch(e => setError(e.message)); }, [contractId, refresh]);
  const update = (id: string, key: string, value: string) => { setLines(rows => ({ ...rows, [id]: { ...rows[id], [key]: value } })); setPreview(null); };
  const payload = () => ({ contractId, direction: 'PAYABLE', settlementScope: 'GOODS', dueDate: dueDate ? `${dueDate}T12:00:00+08:00` : undefined, remarks,
    lines: Object.entries(lines).map(([id, line]) => ({ orderId: sources.find(s => s.id === id)?.orderId, waybillLineItemId: id, quantity: Number(line.quantity), adjustmentAmount: Number(line.adjustmentAmount || 0), remarks: line.remarks })) });
  const submit = async (save: boolean) => {
    setBusy(true); setError('');
    try {
      if (!Object.keys(lines).length) throw new Error('请至少选择一项可以结算的运单货物');
      const result = await api.post<any>(save ? '/financial-settlements' : '/financial-settlements/preview-goods', payload());
      if (save) router.push(`/dashboard/settlements/${result.id}`); else setPreview(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between"><h1 className="text-xl font-semibold">新建采购结算单</h1><Button variant="outline" onClick={() => router.back()}>返回</Button></div><p className="text-sm text-muted-foreground">按采购入库过账数量、结算入库磅单及最终检测依据确认货款，预付款通过后续核销抵扣。</p>
    {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-2 text-sm"><span>查找合同</span><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="合同编号、标题或供应商"/></label><label className="space-y-2 text-sm"><span>采购合同 *</span><select className="h-10 w-full rounded-md border bg-background px-3" value={contractId} onChange={e => setContractId(e.target.value)}><option value="">请选择</option>{contracts.filter(c => c.id === contractId || `${c.contractNo} ${c.title} ${c.counterparty?.name}`.includes(search.trim())).map(c => <option key={c.id} value={c.id}>{c.contractNo} · {c.title} · {c.counterparty?.name}</option>)}</select></label></Card>
    <Card className="p-5"><h2 className="mb-3 font-semibold">货物与质量依据</h2><GoodsEvidence sources={sources} selected={Object.keys(lines)} canAccept={canAccept} reload={refresh} onSelect={(id, checked) => { const s = sources.find(v => v.id === id)!; if (checked && !s.available) return setError(s.reasons.join('；')); setLines(rows => { const next = { ...rows }; if (checked) next[id] = { quantity: String(s.remainingQuantity), adjustmentAmount: '0', remarks: '' }; else delete next[id]; return next; }); setPreview(null); }}/></Card>
    {Object.keys(lines).length > 0 && <Card className="space-y-4 p-5"><h2 className="font-semibold">本次结算明细</h2>{Object.entries(lines).map(([id, line]) => { const s = sources.find(v => v.id === id); return <div className="grid gap-3 border-t pt-3 md:grid-cols-4" key={id}><div className="text-sm">{s?.waybillNo}<p className="mt-1 text-xs text-muted-foreground">合同单价 {paymentMoney(s?.unitPrice)}；扣款 {s?.deductionPerTon.toFixed(4)}元/吨</p></div><label className="space-y-1 text-sm"><span>本次结算数量（吨）</span><Input type="number" step="0.001" value={line.quantity} onChange={e => update(id, 'quantity', e.target.value)}/></label><label className="space-y-1 text-sm"><span>其他加减项（元）</span><Input type="number" step="0.01" value={line.adjustmentAmount} onChange={e => update(id, 'adjustmentAmount', e.target.value)}/></label><label className="space-y-1 text-sm"><span>调整原因</span><Input value={line.remarks} placeholder="不重复填写质量扣款" onChange={e => update(id, 'remarks', e.target.value)}/></label></div>; })}</Card>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-2 text-sm"><span>约定付款到期日</span><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label><label className="space-y-2 text-sm"><span>结算说明</span><Input value={remarks} onChange={e => setRemarks(e.target.value)}/></label></Card>
    {preview && <Card className="grid gap-4 p-5 text-sm sm:grid-cols-4">{[['货物原金额', preview.grossAmount], ['质量价格扣款', preview.qualityDeductionAmount], ['其他加减项', preview.adjustmentAmount], ['本次采购结算金额', preview.totalAmount]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{paymentMoney(value)}</p></div>)}</Card>}
    <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => void submit(false)}>预览结算计算</Button><Button disabled={busy} onClick={() => void submit(true)}>{busy ? '处理中…' : '保存结算草稿'}</Button></div>
  </div>;
}
