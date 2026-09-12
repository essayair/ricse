'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';
import { BusinessDirectionBadge, businessDirectionStyle } from '@/components/business-direction';
import { StatusText } from '@/components/status-text';

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
        <div className="overflow-x-auto"><table className="w-full min-w-[1720px] table-fixed text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
          <th className="w-48 px-4 py-3">通知单号 / 计划</th><th className="w-40 px-4 py-3">类型 / 模式</th><th className="w-72 px-4 py-3">执行批次 / 合同</th>
          <th className="w-64 px-4 py-3">业务主体 / 对手方</th><th className="w-80 px-4 py-3">仓库 / 运输路线</th><th className="w-48 px-4 py-3 text-right">标的 / 数量</th><th className="w-32 px-4 py-3">物流运单</th><th className="w-52 px-4 py-3">状态 / 创建信息</th>
        </tr></thead><tbody>{items.map(item => <tr key={item.id} className={`cursor-pointer border-b align-middle transition-colors ${businessDirectionStyle(item.type).hover}`} onClick={() => router.push(`/dashboard/dispatch-notices/${item.id}`)}>
          <td className="whitespace-nowrap px-4 py-3"><div className="font-mono text-xs font-medium">{item.noticeNo}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(item.plannedDate)}</div></td>
          <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-2"><BusinessDirectionBadge type={item.type} suffix="通知" /><span className="text-xs text-muted-foreground">{item.mode === 'DIRECT' ? '直拨' : '常规'}</span></div></td>
          <td className="px-4 py-3"><div className="truncate font-medium" title={item.order.name}>{item.order.name}</div><div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={`${item.order.orderNo} · ${item.order.contract.contractNo} · ${item.order.contract.title}`}>{item.order.orderNo} · {item.order.contract.contractNo} · {item.order.contract.title}</div></td>
          <td className="px-4 py-3"><div className="truncate" title={item.order.contract.signingPartner?.name || '-'}>{item.order.contract.signingPartner?.name || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={noticeCounterpartyName(item)}>对手方：{noticeCounterpartyName(item)}</div></td>
          <td className="px-4 py-3"><div className="truncate" title={item.warehouse ? `${item.warehouse.code} · ${item.warehouse.name}` : '不经仓'}>{item.warehouse ? `${item.warehouse.code} · ${item.warehouse.name}` : '不经仓'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={`${item.originLocation || '-'} → ${item.destinationLocation || '-'}`}>{item.originLocation || '-'} → {item.destinationLocation || '-'}</div></td>
          <td className="px-4 py-3 text-right"><div className="truncate" title={item.lineItems?.[0]?.materialName || '-'}>{item.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{noticeQuantity(item)}</div></td>
          <td className="whitespace-nowrap px-4 py-3"><div>{item.waybills?.length || 0} 单</div><div className="mt-1 text-xs text-muted-foreground">{(item.waybills || []).filter(waybill => waybill.status === 'SIGNED').length} 单{item.type === 'SALES' ? '客户已签收' : '已收货'}</div></td>
          <td className="whitespace-nowrap px-4 py-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText><div className="mt-1 text-xs text-muted-foreground">{item.creator?.name || '-'} · {formatDate(item.createdAt)}</div></td>
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

function noticeCounterpartyName(item: Notice) {
  const contract = item.order.contract;
  if (contract.buyer && item.type === 'SALES') return contract.buyer.name;
  return contract.seller?.name || contract.buyer?.name || '-';
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '未设置';
}
