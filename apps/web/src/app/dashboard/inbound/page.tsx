'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = { DRAFT: '草稿', RECEIVED: '已收货', POSTED: '已入账', CANCELLED: '已取消' };
const CONCLUSION: Record<string, string> = { PASS: '合格', DEDUCTION: '扣款入库' };

export default function InboundPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { const p = new URLSearchParams(); if (search) p.set('search', search); if (status) p.set('status', status); api.get<{ items: any[] }>(`/inbound-receipts?${p}`).then(data => setItems(data.items)).catch(error => alert(error.message)); }, [search, status]);
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">入库单管理</h1><p className="mt-1 text-sm text-muted-foreground">物流收货、质量验收、业务入库和库存批次一体化管理</p></div><Button onClick={() => router.push('/dashboard/inbound/create')}><Plus className="mr-1 h-4 w-4" />新建物流入库单</Button></div>
    <div className="grid gap-3 sm:grid-cols-4"><Summary label="全部" value={items.length} /><Summary label="待确认" value={items.filter(i => i.status === 'DRAFT').length} /><Summary label="待入账" value={items.filter(i => i.status === 'RECEIVED').length} /><Summary label="已入账" value={items.filter(i => i.status === 'POSTED').length} /></div>
    <div className="flex gap-3"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索入库单、运单、磅单、质检单、物料、供应商或车牌" value={search} onChange={e => setSearch(e.target.value)} /></div><select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    <Card className="overflow-hidden">{!items.length ? <div className="p-12 text-center text-muted-foreground"><Warehouse className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无入库单</div> : <div className="overflow-x-auto"><table className="min-w-[1350px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">入库单 / 收货时间</th><th className="p-3">运单 / 车辆</th><th className="p-3">物料 / 供应商</th><th className="p-3">磅单</th><th className="p-3">验收质检单</th><th className="p-3">仓库</th><th className="p-3 text-right">入库数量</th><th className="p-3 text-right">扣水 / 扣杂 / 扣款</th><th className="p-3">结论 / 状态</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/inbound/${item.id}`)}><td className="p-3"><div className="font-mono font-medium text-primary">{item.receiptNo}</div><div className="mt-1 text-xs text-muted-foreground">{formatDateTimeToSecond(item.receivedAt)}</div></td><td className="p-3"><div className="font-mono text-xs">{item.waybill.waybillNo}</div><div className="mt-1">{item.plateNo || '-'}</div></td><td className="max-w-56 p-3"><div className="truncate font-medium">{item.materialName}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.supplierName || '-'}</div></td><td className="p-3 font-mono text-xs">{item.weighTicket.ticketNo}</td><td className="p-3"><div className="font-mono text-xs text-primary">{item.qualityInspection.inspectionNo}</div><div className="mt-1 text-xs">{item.qualityInspection.institutionName}</div></td><td className="p-3">{item.warehouse.name}</td><td className="p-3 text-right font-medium">{weight(item.receivedQuantity)}</td><td className="p-3 text-right text-xs">{weight(item.moistureDeductionWeight)} / {weight(item.impurityDeductionWeight)}<div className="mt-1 text-destructive">¥{Number(item.deductionAmount).toLocaleString()}</div></td><td className="p-3"><Badge variant={item.acceptanceConclusion === 'DEDUCTION' ? 'secondary' : 'default'}>{CONCLUSION[item.acceptanceConclusion]}</Badge><div className="mt-1 text-xs text-muted-foreground">{STATUS[item.status]}</div></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
function Summary({ label, value }: { label: string; value: number }) { return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>; }
function weight(v: string | number) { return `${Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`; }
