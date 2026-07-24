'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { unitLabel } from '@/lib/unit';

interface Notice {
  id: string; noticeNo: string; type: string; mode: string; status: string; totalQuantity: string;
  plannedDate: string | null; originLocation: string | null; destinationLocation: string | null;
  remarks: string | null; issuedAt: string | null; completedAt: string | null;
  creator: { name: string }; warehouse: { name: string; code: string } | null;
  order: { id: string; orderNo: string; name: string; contract: { id: string; contractNo: string; title: string } };
  lineItems: Array<{ id: string; materialName: string | null; materialId: string; quantity: string; unit: string }>;
  waybills: Array<{ id: string; waybillNo: string; status: string; totalQuantity: string; plateNo: string | null }>;
}
const STATUS: Record<string, string> = { DRAFT: '草稿', ISSUED: '已下达', IN_PROGRESS: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const WAYBILL_STATUS: Record<string, string> = { PENDING: '待发运', IN_TRANSIT: '在途', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已取消' };

export default function DispatchNoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const load = () => api.get<Notice>(`/dispatch-notices/${id}`).then(setNotice).catch(error => { alert(error.message); router.push('/dashboard/dispatch-notices'); });
  useEffect(() => { void load(); }, [id]);
  const transition = async (status: string, label: string) => {
    if (!confirm(`确定${label}？`)) return;
    try { setNotice(await api.patch(`/dispatch-notices/${id}/status`, { status })); } catch (error: any) { alert(error.message); }
  };
  if (!notice) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/dispatch-notices')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{notice.noticeNo}</h1><Badge>{STATUS[notice.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{notice.type === 'PURCHASE' ? '供应商发货指令' : '销售发货通知单'} · {notice.mode === 'DIRECT' ? '直拨' : '常规'}</p></div></div>
      <div className="flex gap-2">
        {notice.status === 'DRAFT' && <><Button onClick={() => void transition('ISSUED', '下达通知')}>下达通知</Button><Button variant="destructive" onClick={() => void transition('CANCELLED', '取消通知')}>取消</Button></>}
        {notice.status === 'ISSUED' && <><Button onClick={() => router.push(`/dashboard/waybills/create?dispatchNoticeId=${notice.id}`)}>新建物流运单</Button><Button variant="outline" onClick={() => void transition('CANCELLED', '取消通知')}>取消</Button></>}
        {notice.status === 'IN_PROGRESS' && <><Button onClick={() => router.push(`/dashboard/waybills/create?dispatchNoticeId=${notice.id}`)}>新增物流运单</Button><Button variant="outline" onClick={() => void transition('COMPLETED', '完成通知')}>完成通知</Button></>}
        {notice.status === 'ISSUED' && notice.waybills.length > 0 && <Button variant="outline" onClick={() => void transition('COMPLETED', '完成通知')}>完成通知</Button>}
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="space-y-4 p-5 lg:col-span-2"><h2 className="font-semibold">通知信息</h2><div className="grid grid-cols-2 gap-4 text-sm">
        <Field label="通知总数量" value={`${Number(notice.totalQuantity).toLocaleString()} 吨`} /><Field label="计划日期" value={notice.plannedDate ? new Date(notice.plannedDate).toLocaleDateString('zh-CN') : '-'} />
        <Field label="起运地点" value={notice.originLocation || '-'} /><Field label="目的地点" value={notice.destinationLocation || '-'} />
        <Field label="发货仓库" value={notice.warehouse ? `${notice.warehouse.code} · ${notice.warehouse.name}` : '-'} /><Field label="创建人" value={notice.creator.name} />
      </div><Field label="备注" value={notice.remarks || '-'} /></Card>
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="font-semibold">上游单据</h2></div><button className="text-left" onClick={() => router.push(`/dashboard/orders/${notice.order.id}`)}><div className="font-medium">{notice.order.name}</div><div className="mt-1 font-mono text-xs text-primary">{notice.order.orderNo}</div><div className="mt-1 text-xs text-muted-foreground">{notice.order.contract.contractNo} · {notice.order.contract.title}</div></button></Card>
    </div>
    <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">通知明细</h2></div><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-4 py-3 text-left">物料</th><th className="px-4 py-3 text-right">数量</th></tr></thead><tbody>{notice.lineItems.map(item => <tr key={item.id} className="border-b"><td className="px-4 py-3">{item.materialName || item.materialId}</td><td className="px-4 py-3 text-right">{Number(item.quantity).toLocaleString()} {unitLabel(item.unit)}</td></tr>)}</tbody></table></Card>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b p-5"><Truck className="h-4 w-4 text-primary" /><h2 className="font-semibold">关联物流运单</h2></div>{!notice.waybills.length ? <div className="p-8 text-center text-muted-foreground">暂无物流运单</div> : <div className="divide-y">{notice.waybills.map(item => <button key={item.id} className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50" onClick={() => router.push(`/dashboard/waybills/${item.id}`)}><div><div className="font-mono text-sm">{item.waybillNo}</div><div className="text-xs text-muted-foreground">{item.plateNo || '待调度车辆'} · {Number(item.totalQuantity).toLocaleString()} 吨</div></div><Badge variant="secondary">{WAYBILL_STATUS[item.status]}</Badge></button>)}</div>}</Card>
  </div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>;
}
