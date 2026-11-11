'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckSquare, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';
import { BusinessDirectionBadge, businessDirectionStyle, waybillStatusLabel } from '@/components/business-direction';
import { StatusText } from '@/components/status-text';
import { ClickableRow } from '@/components/clickable-row';
import { useListQuery } from '@/lib/use-list-query';

interface Waybill {
  id: string; waybillNo: string; status: string; freightMode: string; totalQuantity: string;
  plateNo: string | null; driverName: string | null; driverPhone: string | null; carrierName: string | null; plannedDepartureAt: string | null; plannedArrivalAt: string | null;
  departedAt: string | null; arrivedAt: string | null; signedAt: string | null; createdAt: string;
  originLocation: string | null; destinationLocation: string | null;
  creator: { name: string };
  lineItems: Array<{ materialName: string; quantity: string; unit: string }>;
  dispatchNotice: { noticeNo: string; type: string; order: { orderNo: string; name: string; contract: { contractNo: string; title: string } } };
}
const STATUS: Record<string, string> = { PENDING: '待发运', IN_TRANSIT: '在途', ARRIVED: '已到目的地待交接', SIGNED: '已完成交接', CANCELLED: '已取消' };

export default function WaybillsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Waybill[]>([]);
  const [query, setQuery] = useListQuery({ search: '', status: '', directPending: '' });
  const { search, status, directPending } = query;
  const pendingDirect = directPending === 'true';
  useEffect(() => {
    const params = new URLSearchParams(); if (search) params.set('search', search); if (status) params.set('status', status);
    if (pendingDirect) params.set('directPending', 'true');
    api.get<{ items: Waybill[] }>(`/waybills?${params}`).then(data => setItems(data.items)).catch(error => alert(error.message));
  }, [search, status, pendingDirect]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">物流运单管理</h1></div><div className="flex gap-2"><Button onClick={() => router.push('/dashboard/waybills/create')}><Plus className="mr-1 h-4 w-4" />新建物流运单</Button></div></div>
    <div className="flex flex-wrap gap-3"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索运单号、通知号或车牌" value={search} onChange={e => setQuery({ search: e.target.value })} /></div><select aria-label="运单状态" disabled={pendingDirect} className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50" value={pendingDirect ? 'SIGNED' : status} onChange={e => setQuery({ status: e.target.value })}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Button variant={pendingDirect ? 'default' : 'outline'} aria-pressed={pendingDirect} onClick={() => setQuery({ directPending: pendingDirect ? '' : 'true', status: '' })}><CheckSquare className="mr-2 h-4 w-4" />待直拨交付确认</Button></div>
    {pendingDirect && <p className="text-sm text-muted-foreground">客户已签收、尚未完成直拨交付的车次。打开运单处理交付确认或运营经理复核。</p>}
    <Card className="overflow-hidden">{!items.length ? <div className="p-12 text-center text-muted-foreground">暂无物流运单</div> : <div className="overflow-x-auto"><table className="min-w-[1380px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">物流运单 / 计划</th><th className="px-4 py-3">通知 / 批次 / 合同</th><th className="px-4 py-3">运输方式 / 承运方</th><th className="px-4 py-3">状态 / 创建人</th><th className="px-4 py-3">车辆 / 司机</th><th className="px-4 py-3">运输路线</th><th className="px-4 py-3 text-right">标的 / 数量</th><th className="px-4 py-3">运输时间</th></tr></thead><tbody>{items.map(item => { const sales = item.dispatchNotice.type === 'SALES'; return <ClickableRow key={item.id} href={`/dashboard/waybills/${item.id}`} className={`border-b transition-colors ${businessDirectionStyle(item.dispatchNotice.type).hover}`}><td className="px-4 py-3"><div className="mb-1"><BusinessDirectionBadge type={item.dispatchNotice.type} suffix="运输" /></div><Link href={`/dashboard/waybills/${item.id}`} className="font-mono text-xs font-medium hover:text-primary hover:underline">{item.waybillNo}</Link><div className="mt-1 text-xs text-muted-foreground">发运 {formatDateTime(item.plannedDepartureAt)}</div><div className="mt-1 text-xs text-muted-foreground">{sales ? '送达' : '到达'} {formatDateTime(item.plannedArrivalAt)}</div></td><td className="max-w-64 px-4 py-3"><div className="truncate font-medium">{item.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.dispatchNotice.noticeNo} · {item.dispatchNotice.order.orderNo}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.dispatchNotice.order.contract.contractNo} · {item.dispatchNotice.order.contract.title}</div></td><td className="px-4 py-3"><div>{item.freightMode === 'SELF' ? '自营运输' : item.freightMode === 'THIRD_PARTY' ? '委外运输' : '社会运力'}</div><div className="mt-1 text-xs text-muted-foreground">{item.carrierName || '未指定承运方'}</div></td><td className="px-4 py-3"><StatusText status={item.status}>{waybillStatusLabel(item.status, item.dispatchNotice.type, Boolean(item.plateNo && item.driverName))}</StatusText><div className="mt-1 text-xs text-muted-foreground">{item.creator?.name || '-'} · {formatDateTime(item.createdAt, false)}</div></td><td className="px-4 py-3"><div>{item.plateNo || '历史车辆信息待补齐'}</div><div className="mt-1 text-xs text-muted-foreground">{item.driverName || '-'}{item.driverPhone ? ` · ${item.driverPhone}` : ''}</div></td><td className="max-w-64 px-4 py-3 text-xs"><div className="truncate">{item.originLocation || '-'}</div><div className="mt-1 truncate text-muted-foreground">→ {item.destinationLocation || '-'}</div></td><td className="px-4 py-3 text-right"><div className="max-w-40 truncate">{item.lineItems?.[0]?.materialName || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{waybillQuantity(item)}</div></td><td className="px-4 py-3 text-xs"><div>发运：{formatDateTime(item.departedAt)}</div><div className="mt-1 text-muted-foreground">{sales ? '送达' : '到达'}：{formatDateTime(item.arrivedAt)}</div><div className="mt-1 text-muted-foreground">{sales ? '客户签收' : '收货'}：{formatDateTime(item.signedAt)}</div></td></ClickableRow>; })}</tbody></table></div>}</Card>
  </div>;
}

function waybillQuantity(item: Waybill) {
  if (Number(item.totalQuantity) <= 0) return '待过磅确认';
  if (!item.lineItems?.length) return `${Number(item.totalQuantity).toLocaleString()} ${unitLabel('TON')}`;
  const totals = new Map<string, number>();
  item.lineItems.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function formatDateTime(value: string | null | undefined, withTime = true) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', withTime ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit' });
}
