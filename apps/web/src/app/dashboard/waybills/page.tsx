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

interface Waybill {
  id: string; waybillNo: string; status: string; freightMode: string; totalQuantity: string;
  plateNo: string | null; driverName: string | null; driverPhone: string | null; carrierName: string | null; plannedDepartureAt: string | null; plannedArrivalAt: string | null;
  departedAt: string | null; arrivedAt: string | null; signedAt: string | null; createdAt: string;
  originLocation: string | null; destinationLocation: string | null;
  creator: { name: string };
  lineItems: Array<{ materialName: string; quantity: string; unit: string }>;
  dispatchNotice: { noticeNo: string; type: string; order: { orderNo: string; name: string; contract: { contractNo: string; title: string } } };
}
const STATUS: Record<string, string> = { PENDING: '待发运', IN_TRANSIT: '在途', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已取消' };

export default function WaybillsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Waybill[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(); if (search) params.set('search', search); if (status) params.set('status', status);
    api.get<{ items: Waybill[] }>(`/waybills?${params}`).then(data => setItems(data.items)).catch(error => alert(error.message));
  }, [search, status]);
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">物流运单管理</h1><p className="mt-1 text-sm text-muted-foreground">按执行通知拆分车次，完成车辆调度、运输跟踪和签收</p></div><Button onClick={() => router.push('/dashboard/waybills/create')}><Plus className="mr-1 h-4 w-4" />新建物流运单</Button></div>
    <div className="flex gap-3"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索运单号、通知号或车牌" value={search} onChange={e => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <Card className="overflow-hidden">{!items.length ? <div className="p-12 text-center text-muted-foreground">暂无物流运单</div> : <div className="overflow-x-auto"><table className="min-w-[1380px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">物流运单 / 计划</th><th className="px-4 py-3">通知 / 批次 / 合同</th><th className="px-4 py-3">运输方式 / 承运方</th><th className="px-4 py-3">车辆 / 司机</th><th className="px-4 py-3">运输路线</th><th className="px-4 py-3 text-right">标的 / 数量</th><th className="px-4 py-3">运输时间</th><th className="px-4 py-3">状态 / 创建人</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/waybills/${item.id}`)}><td className="px-4 py-3"><div className="font-mono text-xs font-medium">{item.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">发运 {formatDateTime(item.plannedDepartureAt)}</div><div className="mt-1 text-xs text-muted-foreground">到达 {formatDateTime(item.plannedArrivalAt)}</div></td><td className="max-w-64 px-4 py-3"><div className="truncate font-medium">{item.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.dispatchNotice.noticeNo} · {item.dispatchNotice.order.orderNo}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.dispatchNotice.order.contract.contractNo} · {item.dispatchNotice.order.contract.title}</div></td><td className="px-4 py-3"><div>{item.freightMode === 'SELF' ? '自营运输' : '委外运输'}</div><div className="mt-1 text-xs text-muted-foreground">{item.carrierName || '未指定承运方'}</div></td><td className="px-4 py-3"><div>{item.plateNo || '待调度'}</div><div className="mt-1 text-xs text-muted-foreground">{item.driverName || '-'}{item.driverPhone ? ` · ${item.driverPhone}` : ''}</div></td><td className="max-w-64 px-4 py-3 text-xs"><div className="truncate">{item.originLocation || '-'}</div><div className="mt-1 truncate text-muted-foreground">→ {item.destinationLocation || '-'}</div></td><td className="px-4 py-3 text-right"><div className="max-w-40 truncate">{item.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{waybillQuantity(item)}</div></td><td className="px-4 py-3 text-xs"><div>发运：{formatDateTime(item.departedAt)}</div><div className="mt-1 text-muted-foreground">到达：{formatDateTime(item.arrivedAt)}</div><div className="mt-1 text-muted-foreground">签收：{formatDateTime(item.signedAt)}</div></td><td className="px-4 py-3"><Badge variant={item.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{STATUS[item.status] || item.status}</Badge><div className="mt-1 text-xs text-muted-foreground">{item.creator?.name || '-'} · {formatDateTime(item.createdAt, false)}</div></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}

function waybillQuantity(item: Waybill) {
  if (!item.lineItems?.length) return `${Number(item.totalQuantity).toLocaleString()} ${unitLabel('TON')}`;
  const totals = new Map<string, number>();
  item.lineItems.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function formatDateTime(value: string | null | undefined, withTime = true) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', withTime ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit' });
}
