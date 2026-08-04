'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, PackageMinus, RefreshCw, Scale, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = {
  PENDING: '待称重/拣配', READY: '待放行', VARIANCE_PENDING: '待差异处理', POSTED: '已出库', CANCELLED: '已取消',
};
const WAYBILL_STATUS: Record<string, string> = {
  PENDING: '待发运', IN_TRANSIT: '运输中', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已取消',
};

export default function OutboundOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [variance, setVariance] = useState<Record<string, { decision: string; reason: string }>>({});

  const load = () => api.get(`/outbound-receipts/orders/${id}`).then(setItem).catch((error: any) => alert(error.message));
  useEffect(() => { void load(); }, [id]);

  const refreshReservation = async () => {
    setSaving(true);
    try { setItem(await api.patch(`/outbound-receipts/orders/${id}/refresh-reservation`, {})); }
    catch (error: any) { alert(error.message); }
    finally { setSaving(false); }
  };

  const resolveVariance = async (receipt: any) => {
    const form = variance[receipt.id] || { decision: '', reason: '' };
    if (!form.decision || !form.reason.trim()) return alert('请选择处理方式并填写原因');
    setSaving(true);
    try {
      await api.patch(`/outbound-receipts/${receipt.id}/variance`, form);
      await load();
    } catch (error: any) { alert(error.message); }
    finally { setSaving(false); }
  };

  const release = async (receipt: any) => {
    if (!confirm(`确认车辆 ${receipt.plateNo || receipt.waybill.waybillNo} 放行？系统将按实际重量扣减库存、生成销售出库单并将运单置为在途。`)) return;
    setSaving(true);
    try {
      await api.post(`/outbound-receipts/${receipt.id}/post`, {});
      await load();
    } catch (error: any) { alert(error.message); }
    finally { setSaving(false); }
  };

  if (!item) return <div className="py-20 text-center">加载中...</div>;
  const isDirect = item.dispatchNotice.mode === 'DIRECT';
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/outbound')}><ArrowLeft className="h-4 w-4" /></Button>
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{item.orderNo}</h1><Badge>{item.stageLabel}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">销售发货通知 {item.dispatchNotice.noticeNo} · {isDirect ? '直拨发运' : item.warehouse.name}</p></div>
      </div>
      {!isDirect && ['PENDING', 'PARTIAL'].includes(item.status) && <Button variant="outline" disabled={saving} onClick={() => void refreshReservation()}><RefreshCw className="mr-2 h-4 w-4" />刷新库存预留</Button>}
    </div>

    <Card className={`p-5 ${!isDirect && Number(item.shortageQuantity) > 0 ? 'border-destructive/40' : ''}`}>
      <div className="flex items-start gap-3">{isDirect ? <Truck className="mt-0.5 h-5 w-5 text-primary" /> : Number(item.shortageQuantity) > 0 ? <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />}
        <div><h2 className="font-semibold">{item.stageLabel}</h2><p className="mt-1 text-sm text-muted-foreground">{item.blocker}</p></div></div>
      {isDirect && <div className="mt-4 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">直拨货物由上游供应方直接发往下游客户。本占位单用于跟踪物流、磅单、质检和签收，不冻结或扣减我方库存。</div>}
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Title>上游业务依据</Title><Grid items={[
        ['销售发货通知', item.dispatchNotice.noticeNo], ['执行批次', `${item.dispatchNotice.order.orderNo} · ${item.dispatchNotice.order.name}`],
        ['销售合同', `${item.dispatchNotice.order.contract.contractNo} · ${item.dispatchNotice.order.contract.title}`], ['计划发货日期', date(item.dispatchNotice.plannedDate)],
        ['发货仓库', isDirect ? '直拨，不经过我方仓库' : `${item.warehouse.code} · ${item.warehouse.name}`], ['通知状态', item.dispatchNotice.status],
      ]} /></Card>
      <Card className="p-5"><Title>{isDirect ? '直拨履约进度' : '库存预留与履约'}</Title><Grid items={[
        ['通知计划数量', weight(item.plannedQuantity)], ['待出库冻结', isDirect ? '不适用' : weight(item.reservedQuantity)], ['库存缺口', isDirect ? '不适用' : weight(item.shortageQuantity)],
        ['累计实际出库', weight(item.actualQuantity)], ['物流车次', `${item.dispatchNotice.waybills.length} 个`], ['当前阶段', item.stageLabel],
      ]} /></Card>
    </div>

    <Card className="p-5"><Title>{isDirect ? '直拨物料明细' : '物料库存预留明细'}</Title><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[850px] text-sm">
      <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">物料</th><th className="p-3">单位</th><th className="p-3 text-right">通知数量</th><th className="p-3 text-right">冻结数量</th><th className="p-3 text-right">实际出库</th><th className="p-3 text-right">待补库存</th></tr></thead>
      <tbody>{item.lineItems.map((line: any) => <tr key={line.id} className="border-b"><td className="p-3 font-medium">{line.materialName || line.materialId}</td><td className="p-3">吨</td><td className="p-3 text-right">{weight(line.plannedQuantity)}</td><td className="p-3 text-right text-primary">{isDirect ? '-' : weight(line.reservedQuantity)}</td><td className="p-3 text-right">{weight(line.actualQuantity)}</td><td className="p-3 text-right text-destructive">{isDirect ? '-' : weight(Math.max(0, Number(line.plannedQuantity) - Number(line.reservedQuantity)))}</td></tr>)}</tbody>
    </table></div></Card>

    <Card className="p-5"><div className="mb-4"><h2 className="font-semibold">{isDirect ? '直拨物流与业务凭证' : '物流车次与出库作业'}</h2><p className="mt-1 text-xs text-muted-foreground">运单关联销售发货通知后自动归入；磅单通过物流运单自动回显，质检默认非必填。</p></div>
      {isDirect ? (!item.dispatchNotice.waybills.length ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">尚未创建直拨物流运单</div> : <div className="space-y-4">{item.dispatchNotice.waybills.map((waybill: any) => {
        const tickets = waybill.weighTickets || [];
        const qualities = tickets.flatMap((ticket: any) => ticket.qualityInspections || []);
        return <div key={waybill.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Truck className="h-4 w-4" /><span className="font-mono font-medium">{waybill.waybillNo}</span><Badge variant="outline">{WAYBILL_STATUS[waybill.status] || waybill.status}</Badge></div>
            <div className="mt-2 text-sm text-muted-foreground">{waybill.plateNo || '待派车'} · 计划 {weight(waybill.totalQuantity)}</div></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/waybills/${waybill.id}`)}>查看运单</Button>{tickets[0] && <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/weighbridge/${tickets[0].id}`)}><Scale className="mr-1 h-4 w-4" />查看磅单</Button>}</div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Small label="物流状态" value={WAYBILL_STATUS[waybill.status] || waybill.status} /><Small label="磅单" value={tickets.map((ticket: any) => ticket.ticketNo).join('、') || '待创建'} /><Small label="质检单" value={qualities.map((quality: any) => quality.inspectionNo).join('、') || '非必填'} /><Small label="库存处理" value="不经过我方库存" /></div>
        </div>;
      })}</div>) : (!item.receipts.length ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">尚未创建物流运单</div> : <div className="space-y-4">{item.receipts.map((receipt: any) => {
        const fullWaybill = item.dispatchNotice.waybills.find((value: any) => value.id === receipt.waybillId);
        const ticket = fullWaybill?.weighTickets?.find((value: any) => value.id === receipt.weighTicketId)
          || fullWaybill?.weighTickets?.find((value: any) => value.status === 'REVIEWED')
          || receipt.weighTicket;
        const form = variance[receipt.id] || { decision: '', reason: '' };
        return <div key={receipt.id} className={`rounded-lg border p-4 ${receipt.status === 'VARIANCE_PENDING' ? 'border-destructive/40 bg-destructive/5' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Truck className="h-4 w-4" /><span className="font-mono font-medium">{receipt.waybill.waybillNo}</span><Badge variant="outline">{STATUS[receipt.status] || receipt.status}</Badge></div>
            <div className="mt-2 text-sm text-muted-foreground">{receipt.plateNo || receipt.waybill.plateNo || '待派车'} · 计划 {weight(receipt.plannedQuantity)} · 实际 {weight(receipt.outboundQuantity)}</div></div>
            <div className="flex flex-wrap gap-2">
              {ticket && <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/weighbridge/${ticket.id}`)}><Scale className="mr-1 h-4 w-4" />查看磅单</Button>}
              {receipt.status === 'PENDING' && ticket?.status === 'REVIEWED' && <Button size="sm" onClick={() => router.push(`/dashboard/outbound/create?waybillId=${receipt.waybillId}&orderId=${item.id}`)}>拣配库存</Button>}
              {receipt.status === 'READY' && <Button size="sm" disabled={saving} onClick={() => void release(receipt)}><PackageMinus className="mr-1 h-4 w-4" />确认放行</Button>}
            </div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Small label="车次作业单" value={receipt.receiptNo} /><Small label="磅单" value={ticket?.ticketNo || '待创建/复核'} /><Small label="库存批次" value={receipt.allocations?.map((a: any) => a.inventoryLot.lotNo).join('、') || '待拣配'} /><Small label="销售出库单" value={receipt.salesOutbound?.outboundNo || '待生成'} /></div>
          {ticket?.qualityInspections?.length > 0 && <div className="mt-3 text-xs text-muted-foreground">关联质检：{ticket.qualityInspections.map((quality: any) => `${quality.inspectionNo}（${quality.conclusion}）`).join('、')}</div>}
          {receipt.status === 'VARIANCE_PENDING' && <div className="mt-4 space-y-3 border-t pt-4"><div className="text-sm font-medium text-destructive">实际与计划偏差 {signedWeight(receipt.varianceQuantity)}（{number(receipt.varianceRate)}%），请完成差异处理后再放行。</div>
            <div className="grid gap-3 md:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.decision} onChange={event => setVariance(current => ({ ...current, [receipt.id]: { ...form, decision: event.target.value } }))}><option value="">选择处理方式</option>{Number(receipt.varianceQuantity) > 0 ? <option value="OVERAGE_APPROVED">确认溢装并按实际出库</option> : <><option value="SHORT_CONTINUE">短装，剩余后续补发</option><option value="SHORT_CLOSE">短装，本车差额关闭</option></>}</select><Input className="md:col-span-2" placeholder="差异原因和处理意见" value={form.reason} onChange={event => setVariance(current => ({ ...current, [receipt.id]: { ...form, reason: event.target.value } }))} /></div>
            <div className="flex justify-end"><Button size="sm" disabled={saving} onClick={() => void resolveVariance(receipt)}>提交差异处理</Button></div></div>}
        </div>;
      })}</div>)}
    </Card>
  </div>;
}

function Title({ children }: { children: React.ReactNode }) { return <h2 className="mb-4 font-semibold">{children}</h2>; }
function Grid({ items }: { items: string[][] }) { return <div className="grid gap-4 sm:grid-cols-2">{items.map(([label, value]) => <Small key={label} label={label} value={value} />)}</div>; }
function Small({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
function weight(value: any) { return value === null || value === undefined ? '-' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`; }
function signedWeight(value: any) { const numberValue = Number(value || 0); return `${numberValue > 0 ? '+' : ''}${weight(numberValue)}`; }
function number(value: any) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
function date(value: any) { return value ? formatDateTimeToSecond(value) : '-'; }
