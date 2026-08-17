'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { MATERIAL_ROLE, percent, quantity } from '@/lib/production';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ProductionRecipesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api.get<any[]>(`/production/recipes?${params}`).then(setItems).catch((error: any) => alert(error.message));
  }, [search, status]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">生产方案</h1><p className="mt-1 text-sm text-muted-foreground">定义产成品、基准产量、标准投料比例、损耗容差与质量要求；创建任务时形成快照</p></div><Link href="/dashboard/production/recipes/new"><Button><Plus className="mr-1 h-4 w-4" />新建生产方案</Button></Link></div>
    <div className="flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索方案编号、名称或投入/产出物料" /></div><select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></div>
    <Card className="overflow-hidden">{!items.length ? <div className="p-12 text-center text-muted-foreground">暂无生产方案，请先维护投入与产出物料后创建</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">方案编号 / 名称</th><th className="p-3">库存主体</th><th className="p-3">产出物料</th><th className="p-3 text-right">基准产量</th><th className="p-3">标准投入</th><th className="p-3 text-right">目标收率</th><th className="p-3 text-right">损耗容差</th><th className="p-3">质量控制</th><th className="p-3">引用任务</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>
      {items.map(item => <tr key={item.id} className="border-b"><td className="p-3"><div className="font-mono font-medium text-primary">{item.recipeNo}</div><div className="mt-1 font-medium">{item.name}</div></td><td className="p-3">{item.ownerPartner.name}</td><td className="p-3"><div>{item.outputMaterial.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.outputMaterial.code}</div></td><td className="p-3 text-right">{quantity(item.baseOutputQuantity, item.outputMaterial.unit)}</td><td className="max-w-96 p-3">{item.inputs.map((input: any) => <div key={input.id} className="mb-1"><span className="text-xs text-muted-foreground">{MATERIAL_ROLE[input.materialRole] || input.materialRole}</span> · {input.material.name} {quantity(input.quantity, input.unit)}</div>)}</td><td className="p-3 text-right">{percent(item.expectedYieldRate)}</td><td className="p-3 text-right">±{percent(item.lossToleranceRate)}</td><td className="p-3">{item.qualityRequired ? '完工需质检' : '免质检'}</td><td className="p-3">{item._count.tasks}</td><td className="p-3"><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{item.status === 'ACTIVE' ? '启用' : '停用'}</Badge></td><td className="p-3"><Link href={`/dashboard/production/recipes/${item.id}/edit`}><Button size="sm" variant="outline"><Pencil className="mr-1 h-3 w-3" />编辑</Button></Link></td></tr>)}
    </tbody></table></div>}</Card>
  </div>;
}
