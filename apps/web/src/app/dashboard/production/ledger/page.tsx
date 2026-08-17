'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { MATERIAL_ROLE, quantity } from '@/lib/production';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ProductionLedgerPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    api.get<any[]>(`/production/traceability?${params}`).then(setItems).catch((error: any) => alert(error.message));
  }, [search]);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">生产台账</h1><p className="mt-1 text-sm text-muted-foreground">以已入库产成品批次为入口，反查生产任务、库存主体、加工方以及实际投入的原料库存批次</p></div>
    <div className="relative max-w-2xl"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索完工单、生产任务、产成品或库存批次" /></div>
    {!items.length ? <Card className="p-12 text-center text-muted-foreground">暂无已入库的生产批次</Card> : <div className="space-y-4">{items.map(item => <Card key={item.id} className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b p-5"><div><div className="flex items-center gap-2"><Link href={`/dashboard/production/${item.task.id}`} className="font-mono text-lg font-semibold text-primary hover:underline">{item.completionNo}</Link><Badge variant="secondary">已入库</Badge><Badge variant="outline">{item.task.mode === 'OUTSOURCED' ? '委外加工' : '自营生产'}</Badge></div><div className="mt-2 font-medium">{item.material.code} · {item.material.name} · {quantity(item.quantity, item.material.unit)}</div></div><div className="text-right text-sm"><div className="font-mono">库存批次 {item.inventoryLot?.lotNo}</div><div className="mt-1 text-muted-foreground">{formatDateTimeToSecond(item.postedAt)}</div></div></div><div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><Info label="生产任务" value={`${item.task.taskNo} · ${item.task.name}`} /><Info label="库存主体" value={item.task.ownerPartner.name} /><Info label="加工服务商" value={item.task.processorOrganization?.partner?.name || '自营生产'} /><Info label="仓库流向" value={`${item.task.sourceWarehouse.name} → ${item.task.targetWarehouse.name}`} /></div><div className="border-t"><div className="bg-muted/30 px-5 py-3 text-sm font-medium">实际投入与来源批次</div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-3">角色</th><th className="p-3">原料物料</th><th className="p-3 text-right">计划</th><th className="p-3 text-right">实际耗用</th><th className="p-3">来源库存批次</th></tr></thead><tbody>{item.task.inputs.map((input: any) => <tr key={input.id} className="border-b last:border-0"><td className="p-3">{MATERIAL_ROLE[input.materialRole]}</td><td className="p-3">{input.material.code} · {input.material.name}</td><td className="p-3 text-right">{quantity(input.plannedQuantity, input.unit)}</td><td className="p-3 text-right font-medium">{quantity(input.consumedQuantity, input.unit)}</td><td className="p-3">{input.allocations.map((allocation: any) => allocation.inventoryLot.lotNo).join('、') || '-'}</td></tr>)}</tbody></table></div></div></Card>)}</div>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
