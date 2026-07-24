'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { unitLabel } from '@/lib/unit';

interface Order {
  id: string;
  orderNo: string;
  name: string;
  type: string;
  status: string;
  totalAmount: string;
  plannedDate: string | null;
  deliveryLocation: string | null;
  createdAt: string;
  contract: { contractNo: string; title: string; signingPartner: { name: string } | null; seller: { name: string } | null; buyer: { name: string } | null };
  creator: { name: string };
  lineItems: Array<{ materialName: string; quantity: string; unit: string }>;
  dispatchNotices: Array<{ _count?: { waybills: number } }>;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  CONFIRMED: { label: '已确认', variant: 'outline' },
  DISPATCHED: { label: '执行中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'default' },
  CANCELLED: { label: '已取消', variant: 'destructive' },
};

export default function OrdersPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Order[]; pagination: { total: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      setData(await api.get(`/orders?${params}`));
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [search, status, type]);

  const remove = async (id: string) => {
    if (!confirm('确定删除该执行批次？')) return;
    try {
      await api.delete(`/orders/${id}`);
      await load();
    } catch (error: any) {
      alert(error.message || '删除失败');
    }
  };

  const items = data?.items || [];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">合同执行批次管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">从已审批合同分批生成采购或销售执行批次，并跟踪执行状态</p>
        </div>
        <Button onClick={() => router.push('/dashboard/orders/create')}>
          <Plus className="mr-1 h-4 w-4" />新建执行批次
        </Button>
      </div>

      <div className="flex gap-6 rounded-lg bg-muted/50 p-3">
        <Summary label="全部执行批次" value={data?.pagination.total || 0} />
        <Summary label="待执行" value={items.filter(item => item.status === 'CONFIRMED').length} />
        <Summary label="执行中" value={items.filter(item => item.status === 'DISPATCHED').length} />
        <Summary label="已完成" value={items.filter(item => item.status === 'COMPLETED').length} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="搜索批次名称、编号、合同号或合同标题" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          {[['', '全部类型'], ['PURCHASE', '采购执行批次'], ['SALES', '销售执行批次']].map(([value, label]) => (
            <button key={value} onClick={() => setType(value)}
              className={`rounded border px-3 py-1.5 text-xs ${type === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {['', 'DRAFT', 'CONFIRMED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'].map(value => (
            <button key={value} onClick={() => setStatus(value)}
              className={`rounded-full border px-3 py-1.5 text-xs ${status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}>
              {value ? STATUS_MAP[value].label : '全部状态'}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">加载中...</div>
        ) : !items.length ? (
          <div className="p-12 text-center text-muted-foreground">暂无执行批次</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[1360px] w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">执行批次名称 / 编号</th>
                <th className="px-4 py-3 font-medium">关联合同</th>
                <th className="px-4 py-3 font-medium">我方 / 对手方</th>
                <th className="px-4 py-3 font-medium">标的 / 数量</th>
                <th className="px-4 py-3 text-right font-medium">金额</th>
                <th className="px-4 py-3 font-medium">计划 / 交付地</th>
                <th className="px-4 py-3 font-medium">下游执行</th>
                <th className="px-4 py-3 font-medium">状态 / 创建人</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(order => (
                <tr key={order.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/orders/${order.id}`)}>
                  <td className="max-w-64 px-4 py-3"><div className="truncate font-medium">{order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{order.orderNo} · {order.type === 'PURCHASE' ? '采购' : '销售'}</div></td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.contract.contractNo}</div>
                    <div className="max-w-56 truncate text-xs text-muted-foreground">{order.contract.title}</div>
                  </td>
                  <td className="max-w-64 px-4 py-3"><div className="truncate">{order.contract.signingPartner?.name || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground">对手方：{order.type === 'PURCHASE' ? order.contract.seller?.name || '-' : order.contract.buyer?.name || '-'}</div></td>
                  <td className="max-w-56 px-4 py-3"><div className="truncate">{order.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{orderQuantity(order.lineItems)}</div></td>
                  <td className="px-4 py-3 text-right font-mono">¥{Number(order.totalAmount).toLocaleString()}</td>
                  <td className="max-w-56 px-4 py-3"><div>{formatDate(order.plannedDate)}</div><div className="mt-1 truncate text-xs text-muted-foreground">{order.deliveryLocation || '未设置交付地点'}</div></td>
                  <td className="px-4 py-3"><div>{order.dispatchNotices?.length || 0} 个执行通知</div><div className="mt-1 text-xs text-muted-foreground">{waybillCount(order)} 个物流运单</div></td>
                  <td className="px-4 py-3"><Badge variant={STATUS_MAP[order.status]?.variant}>{STATUS_MAP[order.status]?.label || order.status}</Badge><div className="mt-1 text-xs text-muted-foreground">{order.creator?.name || '-'} · {formatDate(order.createdAt)}</div></td>
                  <td className="px-4 py-3">
                    {['DRAFT', 'CANCELLED'].includes(order.status) ? (
                      <button className="rounded p-1 text-destructive hover:bg-destructive/10" onClick={event => { event.stopPropagation(); void remove(order.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function orderQuantity(lines: Order['lineItems']) {
  if (!lines?.length) return '未录入数量';
  const totals = new Map<string, number>();
  lines.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function waybillCount(order: Order) {
  return (order.dispatchNotices || []).reduce((sum, notice) => sum + (notice._count?.waybills || 0), 0);
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '-';
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{value}</div></div>;
}
