'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';

interface Notice {
  id: string; noticeNo: string; type: string; mode: string; status: string;
  totalQuantity: string; plannedDate: string | null; originLocation: string | null; destinationLocation: string | null;
  createdAt: string; issuedAt: string | null; creator: { name: string };
  order: { orderNo: string; name: string; contract: { contractNo: string; title: string; signingPartner: { name: string } | null; seller: { name: string } | null; buyer: { name: string } | null } };
  warehouse: { code: string; name: string } | null;
  lineItems: Array<{ materialName: string; quantity: string; unit: string }>;
  waybills: Array<{ status: string }>;
}

const STATUS: Record<string, string> = {
  DRAFT: '草稿', ISSUED: '已下达', IN_PROGRESS: '执行中', COMPLETED: '已完成', CANCELLED: '已取消',
};

export default function DispatchNoticesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    api.get<{ items: Notice[] }>(`/dispatch-notices?${params}`).then(data => setItems(data.items)).catch(error => alert(error.message));
  }, [search, type, status]);

  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">执行通知管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理供应商发货指令和销售发货通知单，并向下生成物流运单</p>
      </div>
      <Button onClick={() => router.push('/dashboard/dispatch-notices/create')}><Plus className="mr-1 h-4 w-4" />新建执行通知</Button>
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索通知号、执行批次号或合同号" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={e => setType(e.target.value)}>
        <option value="">全部类型</option><option value="PURCHASE">供应商发货指令</option><option value="SALES">销售发货通知单</option>
      </select>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
    <Card className="overflow-hidden">
      {!items.length ? <div className="p-12 text-center text-muted-foreground">暂无执行通知</div> :
        <div className="overflow-x-auto"><table className="min-w-[1340px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
          <th className="px-4 py-3">通知单号 / 计划</th><th className="px-4 py-3">类型 / 模式</th><th className="px-4 py-3">执行批次 / 合同</th>
          <th className="px-4 py-3">业务主体 / 对手方</th><th className="px-4 py-3">仓库 / 运输路线</th><th className="px-4 py-3 text-right">标的 / 数量</th><th className="px-4 py-3">物流运单</th><th className="px-4 py-3">状态 / 创建信息</th>
        </tr></thead><tbody>{items.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/dispatch-notices/${item.id}`)}>
          <td className="px-4 py-3"><div className="font-mono text-xs font-medium">{item.noticeNo}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(item.plannedDate)}</div></td>
          <td className="px-4 py-3"><div>{item.type === 'PURCHASE' ? '供应商发货指令' : '销售发货通知单'}</div><div className="mt-1 text-xs text-muted-foreground">{item.mode === 'DIRECT' ? '直拨' : '常规'}</div></td>
          <td className="max-w-64 px-4 py-3"><div className="truncate font-medium">{item.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.order.orderNo}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.order.contract.contractNo} · {item.order.contract.title}</div></td>
          <td className="max-w-64 px-4 py-3"><div className="truncate">{item.order.contract.signingPartner?.name || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground">对手方：{item.type === 'PURCHASE' ? item.order.contract.seller?.name || '-' : item.order.contract.buyer?.name || '-'}</div></td>
          <td className="max-w-72 px-4 py-3"><div className="truncate">{item.warehouse ? `${item.warehouse.code} · ${item.warehouse.name}` : '不经仓'}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.originLocation || '-'} → {item.destinationLocation || '-'}</div></td>
          <td className="px-4 py-3 text-right"><div className="max-w-40 truncate">{item.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{noticeQuantity(item)}</div></td>
          <td className="px-4 py-3"><div>{item.waybills?.length || 0} 单</div><div className="mt-1 text-xs text-muted-foreground">{(item.waybills || []).filter(waybill => waybill.status === 'SIGNED').length} 单已签收</div></td>
          <td className="px-4 py-3"><Badge variant={item.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{STATUS[item.status] || item.status}</Badge><div className="mt-1 text-xs text-muted-foreground">{item.creator?.name || '-'} · {formatDate(item.createdAt)}</div></td>
        </tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

function noticeQuantity(item: Notice) {
  if (!item.lineItems?.length) return `${Number(item.totalQuantity).toLocaleString()} ${unitLabel('TON')}`;
  const totals = new Map<string, number>();
  item.lineItems.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '未设置';
}
