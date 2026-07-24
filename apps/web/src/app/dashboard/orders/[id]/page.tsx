'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { ArrowLeft, FileText, Send } from 'lucide-react';
import { unitLabel } from '@/lib/unit';

interface OrderDetail {
  id: string;
  orderNo: string;
  name: string;
  type: string;
  status: string;
  totalAmount: string;
  plannedDate: string | null;
  deliveryLocation: string | null;
  remarks: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  creator: { name: string };
  contract: {
    id: string; contractNo: string; title: string;
    signingPartner: { name: string } | null;
    seller: { name: string };
    buyer: { name: string } | null;
  };
  lineItems: Array<{ id: string; materialName: string | null; materialId: string; quantity: string; unit: string; unitPrice: string; totalPrice: string }>;
  dispatchNotices: Array<{ id: string; noticeNo: string; type: string; status: string; totalQuantity: string; plannedDate: string | null; _count: { waybills: number } }>;
}

const STATUS: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', DISPATCHED: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const ACTIONS: Record<string, Array<{ status: string; label: string; variant?: 'default' | 'destructive' | 'outline' }>> = {
  DRAFT: [{ status: 'CONFIRMED', label: '确认批次' }, { status: 'CANCELLED', label: '取消批次', variant: 'destructive' }],
  CONFIRMED: [{ status: 'CANCELLED', label: '取消批次', variant: 'destructive' }],
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = async () => {
    try {
      setOrder(await api.get(`/orders/${id}`));
    } catch (error: any) {
      alert(error.message || '执行批次加载失败');
      router.push('/dashboard/orders');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [id]);

  const transition = async (status: string, label: string) => {
    if (!confirm(`确定${label}？`)) return;
    setActing(true);
    try {
      setOrder(await api.patch(`/orders/${id}/status`, { status }));
    } catch (error: any) {
      alert(error.message || '操作失败');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  if (!order) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/orders')}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{order.name}</h1><Badge>{STATUS[order.status] || order.status}</Badge></div>
            <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{order.orderNo}</span> · {order.type === 'PURCHASE' ? '采购执行批次' : '销售执行批次'} · 创建人 {order.creator.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {order.status === 'DRAFT' && <Button variant="outline" onClick={() => router.push(`/dashboard/orders/${order.id}/edit`)}>编辑执行批次</Button>}
          {['CONFIRMED', 'DISPATCHED'].includes(order.status) && <Button onClick={() => router.push(`/dashboard/dispatch-notices/create?orderId=${order.id}`)}>新建执行通知</Button>}
          {(ACTIONS[order.status] || []).map(action => (
            <Button key={action.status} variant={action.variant || 'default'} disabled={acting} onClick={() => void transition(action.status, action.label)}>{action.label}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-4 p-5 lg:col-span-2">
          <h2 className="font-semibold">执行批次信息</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="执行批次名称" value={order.name} />
            <Field label="执行批次编号" value={order.orderNo} />
            <Field label="执行批次类型" value={order.type === 'PURCHASE' ? '采购执行批次' : '销售执行批次'} />
            <Field label="执行批次金额" value={`¥${Number(order.totalAmount).toLocaleString()}`} />
            <Field label="计划履约日期" value={order.plannedDate ? new Date(order.plannedDate).toLocaleDateString('zh-CN') : '-'} />
            <Field label="交货地点" value={order.deliveryLocation || '-'} />
            <Field label="开始执行时间" value={order.dispatchedAt ? new Date(order.dispatchedAt).toLocaleString('zh-CN') : '-'} />
            <Field label="完成时间" value={order.completedAt ? new Date(order.completedAt).toLocaleString('zh-CN') : '-'} />
          </div>
          <div><div className="text-xs text-muted-foreground">备注</div><div className="mt-1 text-sm">{order.remarks || '-'}</div></div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="font-semibold">关联合同</h2></div>
          <button className="text-left" onClick={() => router.push(`/dashboard/contracts/${order.contract.id}`)}>
            <div className="font-mono text-xs text-primary">{order.contract.contractNo}</div>
            <div className="mt-1 font-medium">{order.contract.title}</div>
          </button>
          <div className="mt-4 space-y-3">
            <Field label="我方签约主体" value={order.contract.signingPartner?.name || '-'} />
            <Field label="上游/交易对手" value={order.contract.seller.name} />
            {order.contract.buyer && <Field label="下游对手方" value={order.contract.buyer.name} />}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><h2 className="font-semibold">批次明细</h2></div>
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">物料</th><th className="px-4 py-3 text-right">数量</th><th className="px-4 py-3 text-right">单价</th><th className="px-4 py-3 text-right">金额</th></tr></thead>
          <tbody>
            {order.lineItems.map(item => <tr key={item.id} className="border-b"><td className="px-4 py-3">{item.materialName || item.materialId}</td><td className="px-4 py-3 text-right">{Number(item.quantity).toLocaleString()} {unitLabel(item.unit)}</td><td className="px-4 py-3 text-right">¥{Number(item.unitPrice).toLocaleString()}</td><td className="px-4 py-3 text-right font-medium">¥{Number(item.totalPrice).toLocaleString()}</td></tr>)}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-5"><Send className="h-4 w-4 text-primary" /><h2 className="font-semibold">下游执行通知</h2></div>
        {!order.dispatchNotices.length ? <div className="p-8 text-center text-muted-foreground">暂无执行通知；批次确认后可创建供应商发货指令或销售发货通知单</div> :
          <div className="divide-y">{order.dispatchNotices.map(notice => <button key={notice.id} className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50" onClick={() => router.push(`/dashboard/dispatch-notices/${notice.id}`)}><div><div className="font-mono text-sm">{notice.noticeNo}</div><div className="text-xs text-muted-foreground">{notice.type === 'PURCHASE' ? '供应商发货指令' : '销售发货通知单'} · {Number(notice.totalQuantity).toLocaleString()} 吨 · {notice._count.waybills} 张物流运单</div></div><Badge variant="secondary">{{ DRAFT: '草稿', ISSUED: '已下达', IN_PROGRESS: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' }[notice.status] || notice.status}</Badge></button>)}</div>}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1">{value}</div></div>;
}
