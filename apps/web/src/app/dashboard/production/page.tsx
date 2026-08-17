'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Factory, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { percent, PRODUCTION_STATUS, quantity } from '@/lib/production';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ProductionPage() {
  const router = useRouter();
  const [data, setData] = useState<any>({ items: [], summary: {} });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (mode) params.set('mode', mode);
    api.get(`/production/tasks?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [search, status, mode]);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">生产任务</h1><p className="mt-1 text-sm text-muted-foreground">统一管理自营生产与委外加工的备料、领料、投料、质检、完工入库和批次追溯</p></div>
      <Link href="/dashboard/production/new"><Button><Plus className="mr-1 h-4 w-4" />新建生产任务</Button></Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Summary label="任务总数" value={data.summary.total || 0} />
      <Summary label="执行中" value={data.summary.active || 0} />
      <Summary label="待质检" value={data.summary.pendingQc || 0} />
      <Summary label="已完成" value={data.summary.completed || 0} />
      <Summary label="计划产量" value={quantity(data.summary.plannedOutputQuantity)} />
      <Summary label="合格入库" value={quantity(data.summary.qualifiedQuantity)} />
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索任务编号、名称、来源单号、产出物料或加工商" /></div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={mode} onChange={event => setMode(event.target.value)}><option value="">全部模式</option><option value="INTERNAL">自营生产</option><option value="OUTSOURCED">委外加工</option></select>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(PRODUCTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <Card className="overflow-hidden">
      {!data.items.length ? <div className="p-12 text-center text-muted-foreground"><Factory className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无生产任务</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1550px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">任务编号 / 名称</th><th className="p-3">生产方式</th><th className="p-3">库存主体</th><th className="p-3">产出物料</th><th className="p-3">原料仓 → 成品仓</th><th className="p-3">加工服务商</th><th className="p-3 text-right">计划产量</th><th className="p-3 text-right">已入库</th><th className="p-3 text-right">实际收率</th><th className="p-3">来源</th><th className="p-3">状态</th><th className="p-3">创建时间</th></tr></thead>
        <tbody>{data.items.map((item: any) => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/production/${item.id}`)}>
          <td className="p-3"><div className="font-mono font-medium text-primary">{item.taskNo}</div><div className="mt-1 max-w-56 truncate">{item.name}</div></td>
          <td className="p-3"><Badge variant="outline">{item.mode === 'OUTSOURCED' ? '委外加工' : '自营生产'}</Badge></td>
          <td className="p-3">{item.ownerPartner.name}</td><td className="p-3"><div>{item.outputMaterial.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.outputMaterial.code}</div></td>
          <td className="p-3">{item.sourceWarehouse.name} → {item.targetWarehouse.name}</td><td className="p-3">{item.processorOrganization?.partner?.name || '-'}</td>
          <td className="p-3 text-right">{quantity(item.plannedOutputQuantity)}</td><td className="p-3 text-right font-medium text-primary">{quantity(item.qualifiedQuantity)}</td><td className="p-3 text-right">{percent(item.actualYieldRate)}</td>
          <td className="p-3"><div>{item.sourceType === 'SALES_ORDER' ? '销售需求' : '手工创建'}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.sourceOrderNo || '-'}</div></td>
          <td className="p-3"><Badge variant={item.status === 'CANCELLED' ? 'destructive' : item.status === 'CLOSED' ? 'secondary' : 'default'}>{PRODUCTION_STATUS[item.status] || item.status}</Badge></td>
          <td className="p-3 text-xs text-muted-foreground">{formatDateTimeToSecond(item.createdAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
  </div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>;
}
