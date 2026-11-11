'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { DirectEvidenceView, type DirectEvidenceSides } from '@/components/logistics/direct-evidence-view';

interface Trade {
  id: string; waybillId: string; version: number; status: string;
  quantity: string; pricingQuantity: string; pricingQuantityBasis: string;
  remarks: string; operatorName: string; confirmedAt: string; reversedAt: string | null; reversalReason: string | null;
  evidence: { ticketNo?: string; reportNo?: string; weighingStage?: string; evidenceStage?: string; materialName?: string; measuredMoisturePct?: number; crossSide?: boolean; crossSideReason?: string; sides?: DirectEvidenceSides };
  documents: Array<{ direction: string; documentNo: string; status: string; quantity: string; pricingQuantity: string }>;
  waybill: { waybillNo: string; plateNo: string | null; lineItems: Array<{ materialName: string | null }>; dispatchNotice: { order: { contract: {
    contractNo: string; title: string; businessUnit: { name: string } | null; seller: { name: string } | null; buyer: { name: string } | null; signingPartner: { name: string } | null;
  } } } };
}
interface Result { items: Trade[]; total: number; pageNo: number; pageSize: number; totals: { confirmedCount: number; quantity: string | number; pricingQuantity: string | number } }
const EMPTY: Result = { items: [], total: 0, pageNo: 1, pageSize: 50, totals: { confirmedCount: 0, quantity: 0, pricingQuantity: 0 } };
const stage = (value?: string) => value === 'SHIPPING' ? '发货侧' : value === 'RECEIVING' ? '收货侧' : '未记录';
const CROSS_SIDE_REASONS: Record<string, string> = { NEGOTIATED_TICKET: '磅单协商', SINGLE_SIDE_REPORT: '只有一方出质检单' };
const quantity = (value: string | number) => `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;

export default function DirectTradesPage() {
  const [query, setQuery, resetQuery] = useListQuery({ search: '', status: '', startDate: '', endDate: '', contractId: '', pageNo: '1' });
  const [data, setData] = useState<Result>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canLogistics, setCanLogistics] = useState(false);
  const [expanded, setExpanded] = useState('');
  const { search, status, startDate, endDate, contractId, pageNo } = query;
  useEffect(() => {
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanLogistics(user.role === 'ADMIN' || user.permissions?.includes('logistics.view')); } catch {}
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ pageNo: pageNo || '1', pageSize: '50' });
    Object.entries({ search, status, startDate, endDate, contractId }).forEach(([key, value]) => { if (value) params.set(key, value); });
    api.get<Result>(`/bilateral-direct/trade-documents?${params}`).then(result => { if (active) setData(result); }).catch(e => { if (active) { setData(EMPTY); setError(e.message || '直拨进出记录加载失败'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, status, startDate, endDate, contractId, pageNo]);
  const filter = (patch: Partial<typeof query>) => setQuery({ ...patch, pageNo: '1' });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">直拨进出</h1><p className="mt-1 text-sm text-muted-foreground">供应商直接交付客户，采购与销售成对记录，不计入仓库库存。</p></div>{canLogistics && <Button asChild variant="outline"><Link href="/dashboard/waybills?directPending=true">待直拨交付确认</Link></Button>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="有效交付" value={`${data.totals.confirmedCount} 车次`} /><Summary label="有效实物数量（进出相同）" value={quantity(data.totals.quantity)} /><Summary label="有效计价数量（进出相同）" value={quantity(data.totals.pricingQuantity)} /></div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索直拨进出" className="pl-9" placeholder="单号、合同、车牌、企业、事业部或物料" value={search} onChange={e => filter({ search: e.target.value })} /></div>
      <select aria-label="交付状态" className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => filter({ status: e.target.value })}><option value="">全部已生成记录</option><option value="CONFIRMED">有效交付</option><option value="REVERSED">已撤销</option></select>
      <label className="text-sm">交付开始日期<Input type="date" value={startDate} onChange={e => filter({ startDate: e.target.value })} /></label>
      <label className="text-sm">交付结束日期<Input type="date" value={endDate} onChange={e => filter({ endDate: e.target.value })} /></label>
      <Button variant="outline" onClick={resetQuery}>重置</Button>
    </div>
    {error && <div role="alert" className="rounded-md border border-destructive-border bg-destructive-bg p-4 text-sm text-destructive">{error}</div>}
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
      <th className="p-3 whitespace-nowrap">采购业务入库 / 销售出库</th><th className="p-3">合同 / 交易双方</th><th className="p-3">运单 / 物料</th><th className="p-3 whitespace-nowrap">状态 / 版本</th><th className="p-3 text-right whitespace-nowrap">实物数量</th><th className="p-3 text-right whitespace-nowrap">计价数量</th><th className="p-3">交付依据</th><th className="p-3 whitespace-nowrap">确认时间 / 经办人</th><th className="p-3">操作</th>
    </tr></thead><tbody>{loading ? <tr><td colSpan={9} className="p-12 text-center text-muted-foreground">正在加载…</td></tr> : !data.items.length ? <tr><td colSpan={9} className="p-12 text-center text-muted-foreground">{error ? '未能加载直拨进出记录' : '暂无符合条件的直拨进出记录'}</td></tr> : data.items.map(item => {
      const contract = item.waybill.dispatchNotice.order.contract;
      const purchase = item.documents.find(d => d.direction === 'PURCHASE'), sales = item.documents.find(d => d.direction === 'SALES');
      const consistent = purchase && sales && Number(purchase.quantity) === Number(sales.quantity) && Number(purchase.pricingQuantity) === Number(sales.pricingQuantity);
      return <TradeRows key={item.id} item={item} expanded={expanded === item.id} toggle={() => setExpanded(expanded === item.id ? '' : item.id)} canLogistics={canLogistics} contract={contract} purchase={purchase} sales={sales} consistent={Boolean(consistent)} />;
    })}</tbody></table></div></Card>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>共 {data.total} 条记录；汇总仅含当前筛选下的有效交付，不重复累加采购与销售数量。</span><div className="flex items-center gap-3"><Button variant="outline" disabled={loading || Number(pageNo) <= 1} onClick={() => setQuery({ pageNo: String(Number(pageNo) - 1) })}>上一页</Button><span>第 {data.pageNo} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><Button variant="outline" disabled={loading || data.pageNo * data.pageSize >= data.total} onClick={() => setQuery({ pageNo: String(data.pageNo + 1) })}>下一页</Button></div></div>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) { return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div></Card>; }
function TradeRows({ item, expanded, toggle, canLogistics, contract, purchase, sales, consistent }: {
  item: Trade; expanded: boolean; toggle: () => void; canLogistics: boolean; contract: Trade['waybill']['dispatchNotice']['order']['contract']; purchase?: Trade['documents'][number]; sales?: Trade['documents'][number]; consistent: boolean;
}) {
  return <>
    <tr className="border-b align-top hover:bg-muted/30">
      <td className="p-3 font-mono text-xs"><div className="text-business-purchase">{purchase?.documentNo || '缺少采购单据'}</div><div className="mt-2 text-business-sales">{sales?.documentNo || '缺少销售单据'}</div>{!consistent && <div className="mt-2 text-warning">两向记录不一致，请核对</div>}</td>
      <td className="max-w-64 p-3"><div className="font-mono text-xs">{contract.contractNo}</div><div className="mt-1 truncate" title={contract.title}>{contract.title}</div><div className="mt-1 text-xs text-muted-foreground">供：{contract.seller?.name || '-'}</div><div className="mt-1 text-xs text-muted-foreground">需：{contract.buyer?.name || '-'}</div></td>
      <td className="max-w-56 p-3"><div className="font-mono text-xs">{item.waybill.waybillNo}</div><div className="mt-1">{item.waybill.plateNo || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.evidence.materialName || item.waybill.lineItems.map(l => l.materialName).filter(Boolean).join('、') || '-'}</div></td>
      <td className="p-3"><StatusText status={item.status === 'CONFIRMED' ? 'COMPLETED' : 'CANCELLED'}>{item.status === 'CONFIRMED' ? '有效交付' : '已撤销'}</StatusText><div className="mt-1 text-xs text-muted-foreground">第 {item.version} 版</div></td>
      <td className="p-3 text-right tabular-nums whitespace-nowrap">{quantity(item.quantity)}</td><td className="p-3 text-right tabular-nums whitespace-nowrap">{quantity(item.pricingQuantity)}<div className="mt-1 text-xs text-muted-foreground">{item.pricingQuantityBasis === 'DRY_MATTER' ? '按实测水分折干' : '按实物数量'}</div></td>
      <td className="p-3 text-xs"><div>{item.evidence.ticketNo || '-'} · {stage(item.evidence.weighingStage)}</div><div className="mt-2">{item.evidence.reportNo || '-'} · {stage(item.evidence.evidenceStage)}</div>{item.evidence.crossSide && <div className="mt-1 text-warning">跨侧采用</div>}</td>
      <td className="p-3 text-xs"><div>{formatDateTimeToSecond(item.confirmedAt)}</div><div className="mt-1 text-muted-foreground">{item.operatorName}</div></td>
      <td className="p-3 whitespace-nowrap"><Button size="sm" variant="ghost" aria-expanded={expanded} onClick={toggle}>{expanded ? '收起记录' : '查看记录'}</Button>{canLogistics && <Link className="mt-2 block text-xs text-primary hover:underline" href={`/dashboard/waybills/${item.waybillId}#direct-delivery`}>查看直拨交付</Link>}</td>
    </tr>
    {expanded && <tr className="border-b bg-muted/20"><td colSpan={9} className="p-4"><div className="mb-4"><DirectEvidenceView value={item.evidence.sides} /></div><div className="grid gap-3 text-sm md:grid-cols-3"><div>我方主体：{contract.signingPartner?.name || '-'}</div><div>业务单元（事业部）：{contract.businessUnit?.name || '-'}</div><div>实测水分：{item.evidence.measuredMoisturePct == null ? '-' : `${item.evidence.measuredMoisturePct}%`}</div><div className="md:col-span-3 whitespace-pre-wrap">交付说明：{item.remarks || '-'}</div>{item.evidence.crossSide && <div className="md:col-span-3 text-warning">跨侧原因：{CROSS_SIDE_REASONS[item.evidence.crossSideReason || ''] || '历史记录未填写'}</div>}{item.status === 'REVERSED' && <><div>撤销时间：{formatDateTimeToSecond(item.reversedAt)}</div><div className="md:col-span-2 whitespace-pre-wrap">撤销原因：{item.reversalReason || '-'}</div></>}</div></td></tr>}
  </>;
}
