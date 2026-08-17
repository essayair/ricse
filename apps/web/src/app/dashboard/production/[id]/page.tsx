'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Factory, PackageCheck, Play, RotateCcw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { COMPLETION_STATUS, MATERIAL_ROLE, percent, PRODUCTION_STATUS, quantity } from '@/lib/production';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ProductionTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<any>(null);
  const [eligible, setEligible] = useState<any[]>([]);
  const [reservations, setReservations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result: any = await api.get(`/production/tasks/${id}`);
      setTask(result);
      if (['RELEASED', 'MATERIAL_PREPARED'].includes(result.status)) {
        const available: any[] = await api.get(`/production/tasks/${id}/eligible-lots`);
        setEligible(available);
        const current: Record<string, string> = {};
        result.inputs.forEach((input: any) => input.allocations.forEach((allocation: any) => { current[`${input.id}:${allocation.inventoryLotId}`] = String(allocation.reservedQuantity); }));
        setReservations(current);
      } else setEligible([]);
    } catch (error: any) { alert(error.message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (path: string, method: 'post' | 'patch' = 'post', data: any = {}) => {
    setSaving(true);
    try { await api[method](`/production/${path}`, data); await load(); } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  };
  const reserve = async () => {
    const allocations = Object.entries(reservations).filter(([, value]) => Number(value) > 0).map(([key, value]) => { const [taskInputId, inventoryLotId] = key.split(':'); return { taskInputId, inventoryLotId, quantity: Number(value) }; });
    if (!allocations.length) return alert('请填写原料批次预占数量');
    await act(`tasks/${id}/reservations`, 'patch', { allocations });
  };
  const autoReserve = () => {
    const next: Record<string, string> = {};
    for (const input of eligible) {
      let remaining = Number(input.plannedQuantity);
      for (const lot of input.lots) {
        const amount = Math.min(remaining, Number(lot.availableToReserve));
        if (amount > 0) next[`${input.taskInputId}:${lot.id}`] = String(Number(amount.toFixed(3)));
        remaining = Number((remaining - amount).toFixed(3));
      }
    }
    setReservations(next);
  };
  const recordQuantity = async (type: 'consume' | 'return', allocation: any) => {
    const remaining = Number(allocation.issuedQuantity) - Number(allocation.consumedQuantity) - Number(allocation.returnedQuantity);
    const value = prompt(type === 'consume' ? `本次实际耗用数量（最多 ${remaining} 吨）` : `本次退回原料数量（最多 ${remaining} 吨）`, String(remaining));
    if (value === null || Number(value) <= 0) return;
    await act(`tasks/${id}/${type}`, 'post', { allocations: [{ allocationId: allocation.id, quantity: Number(value) }] });
  };
  const completion = async () => {
    const value = prompt('请输入本次完工申报数量（吨）');
    if (value === null || Number(value) <= 0) return;
    const remarks = prompt('本次完工备注（可不填）') || undefined;
    await act(`tasks/${id}/completions`, 'post', { quantity: Number(value), remarks });
  };
  const quality = async (completionId: string, conclusion: 'PASS' | 'REWORK' | 'SCRAP') => {
    const remark = conclusion === 'PASS' ? prompt('质量确认说明（可不填）') || undefined : prompt('请填写返工或报废原因');
    if (conclusion !== 'PASS' && !remark?.trim()) return alert('返工或报废必须填写原因');
    await act(`completions/${completionId}/quality`, 'patch', { conclusion, remark });
  };

  if (!task) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const progress = Number(task.plannedOutputQuantity) > 0 ? Math.min(100, Number(task.qualifiedQuantity) / Number(task.plannedOutputQuantity) * 100) : 0;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/production')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{task.taskNo}</h1><Badge>{PRODUCTION_STATUS[task.status] || task.status}</Badge><Badge variant="outline">{task.mode === 'OUTSOURCED' ? '委外加工' : '自营生产'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{task.name} · {task.outputMaterial.name}</p></div></div><div className="flex flex-wrap gap-2">
      {task.status === 'DRAFT' && <><Button variant="outline" disabled={saving} onClick={() => confirm('确认取消该任务草稿？') && void act(`tasks/${id}/cancel`, 'patch')}><XCircle className="mr-1 h-4 w-4" />取消</Button><Button disabled={saving} onClick={() => confirm('下达后即可预占原料库存，确认下达？') && void act(`tasks/${id}/release`, 'patch')}><Play className="mr-1 h-4 w-4" />下达任务</Button></>}
      {task.status === 'MATERIAL_PREPARED' && <Button disabled={saving} onClick={() => confirm('领料将即时扣减原料库存并转入在制，确认操作？') && void act(`tasks/${id}/issue`)}><PackageCheck className="mr-1 h-4 w-4" />确认领料</Button>}
      {['IN_PROGRESS', 'PENDING_QC', 'PARTIAL_COMPLETED'].includes(task.status) && <Button disabled={saving} onClick={() => void completion()}><Factory className="mr-1 h-4 w-4" />完工申报</Button>}
      {task.status === 'COMPLETED' && <Button disabled={saving} onClick={() => confirm('关闭前请确认所有余料已耗用或退回。确认关闭任务？') && void act(`tasks/${id}/close`, 'patch')}><CheckCircle2 className="mr-1 h-4 w-4" />关闭任务</Button>}
    </div></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Summary label="计划产量" value={quantity(task.plannedOutputQuantity)} /><Summary label="合格入库" value={quantity(task.qualifiedQuantity)} /><Summary label="完成率" value={`${progress.toFixed(1)}%`} /><Summary label="实际收率" value={percent(task.actualYieldRate)} /><Summary label="损耗容差" value={`±${percent(task.lossToleranceRate)}`} /></div>
    <Card className="p-6"><div className="mb-2 flex justify-between text-sm"><span>合格入库进度</span><span>{progress.toFixed(1)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></Card>
    <div className="grid gap-6 xl:grid-cols-2"><Card className="space-y-3 p-6"><h2 className="font-semibold">任务与来源</h2><Info label="生产方案" value={`${task.recipe.recipeNo} · ${task.recipe.name}`} /><Info label="库存主体" value={`${task.ownerPartner.code} · ${task.ownerPartner.name}`} /><Info label="产出物料" value={`${task.outputMaterial.code} · ${task.outputMaterial.name}`} /><Info label="原料仓库" value={`${task.sourceWarehouse.code} · ${task.sourceWarehouse.name}`} /><Info label="成品仓库" value={`${task.targetWarehouse.code} · ${task.targetWarehouse.name}`} /><Info label="加工服务商" value={task.processorOrganization?.partner?.name || '-'} /><Info label="需求来源" value={task.sourceType === 'SALES_ORDER' ? `销售需求 ${task.sourceOrderNo || ''}` : '手工生产计划'} /></Card><Card className="space-y-3 p-6"><h2 className="font-semibold">计划与执行</h2><Info label="负责人" value={task.operatorName || '-'} /><Info label="计划期间" value={`${formatDateTimeToSecond(task.plannedStartAt)} 至 ${formatDateTimeToSecond(task.plannedEndAt)}`} /><Info label="实际开始" value={formatDateTimeToSecond(task.actualStartAt)} /><Info label="实际结束" value={formatDateTimeToSecond(task.actualEndAt)} /><Info label="质量控制" value={task.qualityRequired ? '完工必须质检合格后入库' : '免质检，可直接入库'} /><Info label="工艺说明" value={task.recipe.processDescription || '-'} /><Info label="质量要求" value={task.recipe.qualityRequirements || '-'} /></Card></div>

    <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">原料执行明细</h2><p className="mt-1 text-xs text-muted-foreground">按库存主体、原料仓库和批次预占；领料后记录实际耗用，未耗余料可退回原批次</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">角色 / 物料</th><th className="p-3 text-right">计划</th><th className="p-3 text-right">预占</th><th className="p-3 text-right">已领</th><th className="p-3 text-right">已耗</th><th className="p-3 text-right">已退</th><th className="p-3">库存批次执行</th></tr></thead><tbody>{task.inputs.map((input: any) => <tr key={input.id} className="border-b"><td className="p-3"><div>{MATERIAL_ROLE[input.materialRole]} · {input.material.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{input.material.code}</div></td><td className="p-3 text-right">{quantity(input.plannedQuantity, input.unit)}</td><td className="p-3 text-right">{quantity(input.reservedQuantity, input.unit)}</td><td className="p-3 text-right">{quantity(input.issuedQuantity, input.unit)}</td><td className="p-3 text-right font-medium">{quantity(input.consumedQuantity, input.unit)}</td><td className="p-3 text-right">{quantity(input.returnedQuantity, input.unit)}</td><td className="p-3">{!input.allocations.length ? '-' : input.allocations.map((allocation: any) => { const remaining = Number(allocation.issuedQuantity) - Number(allocation.consumedQuantity) - Number(allocation.returnedQuantity); return <div key={allocation.id} className="mb-2 rounded border p-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-primary">{allocation.inventoryLot.lotNo}</span><span className="ml-2 text-xs text-muted-foreground">预占 {quantity(allocation.reservedQuantity)}</span></div>{remaining > 0 && <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => void recordQuantity('consume', allocation)}>记录耗用</Button><Button size="sm" variant="ghost" onClick={() => void recordQuantity('return', allocation)}><RotateCcw className="mr-1 h-3 w-3" />退料</Button></div>}</div>{Number(allocation.issuedQuantity) > 0 && <div className="mt-1 text-xs text-muted-foreground">已领 {quantity(allocation.issuedQuantity)} · 已耗 {quantity(allocation.consumedQuantity)} · 已退 {quantity(allocation.returnedQuantity)} · 待处理 {quantity(remaining)}</div>}</div>; })}</td></tr>)}</tbody></table></div></Card>

    {eligible.length > 0 && <Card className="space-y-4 p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">原料批次预占</h2><p className="mt-1 text-xs text-muted-foreground">可重复调整，确认领料后锁定；系统只展示当前主体、原料仓和对应物料的可用批次</p></div><div className="flex gap-2"><Button variant="outline" onClick={autoReserve}>按入库顺序分配</Button><Button disabled={saving} onClick={() => void reserve()}>保存预占</Button></div></div>{eligible.map((input: any) => <div key={input.taskInputId} className="rounded-md border"><div className="flex justify-between border-b bg-muted/30 p-3 text-sm"><span className="font-medium">{input.material.code} · {input.material.name}</span><span>计划 {quantity(input.plannedQuantity)}</span></div>{!input.lots.length ? <div className="p-4 text-sm text-destructive">暂无可用库存批次</div> : <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-3">批次</th><th className="p-3">库存主体</th><th className="p-3">仓库</th><th className="p-3 text-right">可预占</th><th className="p-3 text-right">本任务预占</th></tr></thead><tbody>{input.lots.map((lot: any) => <tr key={lot.id} className="border-b"><td className="p-3 font-mono text-primary">{lot.lotNo}</td><td className="p-3">{lot.inventoryOwner?.name}</td><td className="p-3">{lot.warehouse.name}</td><td className="p-3 text-right">{quantity(lot.availableToReserve)}</td><td className="p-3"><Input className="ml-auto w-36 text-right" type="number" min="0" max={lot.availableToReserve} step="0.001" value={reservations[`${input.taskInputId}:${lot.id}`] || ''} onChange={event => setReservations(current => ({ ...current, [`${input.taskInputId}:${lot.id}`]: event.target.value }))} /></td></tr>)}</tbody></table></div>}</div>)}</Card>}

    <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">完工与质量入库</h2><p className="mt-1 text-xs text-muted-foreground">一次任务可多次完工；每次完工独立确认质量并形成一个产成品库存批次</p></div>{!task.completions.length ? <div className="p-10 text-center text-muted-foreground">暂无完工申报</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">完工单号</th><th className="p-3">产出物料</th><th className="p-3 text-right">数量</th><th className="p-3">生产时间</th><th className="p-3">质量结论</th><th className="p-3">库存批次</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>{task.completions.map((item: any) => <tr key={item.id} className="border-b"><td className="p-3 font-mono text-primary">{item.completionNo}</td><td className="p-3">{task.outputMaterial.name}</td><td className="p-3 text-right">{quantity(item.quantity)}</td><td className="p-3">{formatDateTimeToSecond(item.producedAt)}</td><td className="p-3"><div>{item.qualityConclusion === 'PASS' ? '合格' : item.qualityConclusion === 'REWORK' ? '返工' : item.qualityConclusion === 'SCRAP' ? '报废' : '待确认'}</div><div className="mt-1 text-xs text-muted-foreground">{item.qualityRemark || '-'}</div></td><td className="p-3 font-mono">{item.inventoryLot?.lotNo || '-'}</td><td className="p-3"><Badge variant={item.status === 'SCRAPPED' ? 'destructive' : item.status === 'POSTED' ? 'secondary' : 'outline'}>{COMPLETION_STATUS[item.status] || item.status}</Badge></td><td className="p-3"><div className="flex flex-wrap gap-1">{item.status === 'PENDING_QC' && <><Button size="sm" onClick={() => void quality(item.id, 'PASS')}>合格</Button><Button size="sm" variant="outline" onClick={() => void quality(item.id, 'REWORK')}>返工</Button><Button size="sm" variant="destructive" onClick={() => void quality(item.id, 'SCRAP')}>报废</Button></>}{item.status === 'READY_TO_POST' && <Button size="sm" onClick={() => confirm('确认将本次合格完工数量生成产成品库存批次？') && void act(`completions/${item.id}/post`)}>生产入库</Button>}</div></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) { return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[100px_1fr] gap-3 border-b pb-2 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><span className="break-words">{value}</span></div>; }
