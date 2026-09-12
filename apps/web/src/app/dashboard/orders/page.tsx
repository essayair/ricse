'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { unitLabel } from '@/lib/unit';
import { BusinessDirectionBadge, businessDirectionFilterClass, businessDirectionStyle } from '@/components/business-direction';
import { StatusText } from '@/components/status-text';

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
  const [typeTotals, setTypeTotals] = useState({ purchase: 0, sales: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const listParams = new URLSearchParams(params);
      if (type) listParams.set('type', type);
      const purchaseParams = new URLSearchParams(params);
      purchaseParams.set('pageSize', '1');
      purchaseParams.set('type', 'PURCHASE');
      const salesParams = new URLSearchParams(params);
      salesParams.set('pageSize', '1');
      salesParams.set('type', 'SALES');
      const [list, purchase, sales] = await Promise.all([
        api.get<{ items: Order[]; pagination: { total: number } }>(`/orders?${listParams}`),
        api.get<{ pagination: { total: number } }>(`/orders?${purchaseParams}`),
        api.get<{ pagination: { total: number } }>(`/orders?${salesParams}`),
      ]);
      setData(list);
      setTypeTotals({ purchase: purchase.pagination.total, sales: sales.pagination.total });
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
          <button onClick={() => setType('')} className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${type === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted/60'}`}>全部类型 {typeTotals.purchase + typeTotals.sales}</button>
          <button onClick={() => setType('PURCHASE')} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${businessDirectionFilterClass('PURCHASE', type === 'PURCHASE')}`}><ArrowDownToLine className="h-3.5 w-3.5" />采购执行 {typeTotals.purchase}</button>
          <button onClick={() => setType('SALES')} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${businessDirectionFilterClass('SALES', type === 'SALES')}`}><ArrowUpFromLine className="h-3.5 w-3.5" />销售执行 {typeTotals.sales}</button>
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
          <table className="w-full min-w-[1820px] table-fixed text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="w-72 whitespace-nowrap px-4 py-3 font-medium">执行批次名称 / 编号</th>
                <th className="w-60 whitespace-nowrap px-4 py-3 font-medium">关联合同</th>
                <th className="w-72 whitespace-nowrap px-4 py-3 font-medium">{type === 'PURCHASE' ? '采购主体 / 供应商' : type === 'SALES' ? '销售主体 / 客户' : '业务主体 / 交易对手'}</th>
                <th className="w-56 whitespace-nowrap px-4 py-3 font-medium">标的 / 数量</th>
                <th className="w-40 whitespace-nowrap px-4 py-3 text-right font-medium">金额</th>
                <th className="w-64 whitespace-nowrap px-4 py-3 font-medium">{type === 'PURCHASE' ? '计划到货 / 收货地点' : type === 'SALES' ? '计划发货 / 交付地点' : '计划日期 / 交付地点'}</th>
                <th className="w-56 whitespace-nowrap px-4 py-3 font-medium">下游执行</th>
                <th className="w-52 whitespace-nowrap px-4 py-3 font-medium">状态 / 创建人</th>
                <th className="w-20 whitespace-nowrap px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(order => (
                <tr key={order.id} className={`cursor-pointer border-b align-middle transition-colors ${businessDirectionStyle(order.type).hover}`} onClick={() => router.push(`/dashboard/orders/${order.id}`)}>
                  <td className="px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <OrderTypeBadge type={order.type} />
                      <div className="min-w-0 truncate font-medium" title={order.name}>{order.name}</div>
                    </div>
                    <div className="whitespace-nowrap font-mono text-xs text-muted-foreground">{order.orderNo}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="whitespace-nowrap font-medium">{order.contract.contractNo}</div>
                    <div className="truncate text-xs text-muted-foreground" title={order.contract.title}>{order.contract.title}</div>
                  </td>
                  <td className="px-4 py-3"><div className="truncate" title={order.contract.signingPartner?.name || '-'}><span className={`mr-1 text-xs ${businessDirectionStyle(order.type).text}`}>{order.type === 'PURCHASE' ? '采购主体' : '销售主体'}：</span>{order.contract.signingPartner?.name || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={order.type === 'PURCHASE' ? order.contract.seller?.name || '-' : order.contract.buyer?.name || order.contract.seller?.name || '-'}><span className={businessDirectionStyle(order.type).text}>{order.type === 'PURCHASE' ? '供应商' : '客户'}：</span>{order.type === 'PURCHASE' ? order.contract.seller?.name || '-' : order.contract.buyer?.name || order.contract.seller?.name || '-'}</div></td>
                  <td className="px-4 py-3"><div className="truncate" title={order.lineItems?.[0]?.materialName || '-'}>{order.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={orderQuantity(order.lineItems)}>{orderQuantity(order.lineItems)}</div></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">¥{Number(order.totalAmount).toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="whitespace-nowrap">{formatDate(order.plannedDate)}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={order.deliveryLocation || '未设置交付地点'}>{order.deliveryLocation || '未设置交付地点'}</div></td>
                  <td className="whitespace-nowrap px-4 py-3"><div>{order.dispatchNotices?.length || 0} 个执行通知</div><div className="mt-1 text-xs text-muted-foreground">{waybillCount(order)} 个物流运单</div></td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusText status={order.status}>{STATUS_MAP[order.status]?.label || order.status}</StatusText><div className="mt-1 text-xs text-muted-foreground">{order.creator?.name || '-'} · {formatDate(order.createdAt)}</div></td>
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

function OrderTypeBadge({ type }: { type: string }) {
  return <BusinessDirectionBadge type={type} suffix="执行" />;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '-';
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{value}</div></div>;
}
