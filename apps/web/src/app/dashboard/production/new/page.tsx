'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { MATERIAL_ROLE, quantity } from '@/lib/production';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function NewProductionTaskPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [processors, setProcessors] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', mode: 'INTERNAL', recipeId: '', ownerPartnerId: '', sourceWarehouseId: '', targetWarehouseId: '', processorOrganizationId: '', plannedOutputQuantity: '', sourceType: 'MANUAL', sourceOrderNo: '', processingFeeRate: '', operatorName: '', plannedStartAt: '', plannedEndAt: '', remarks: '' });
  const recipe = recipes.find(item => item.id === form.recipeId);

  useEffect(() => {
    Promise.all([api.get<any[]>('/production/recipes?status=ACTIVE'), api.get<any[]>('/master-data/warehouses'), api.get<{ items: any[] }>('/service-organizations?type=PROCESSING_PROVIDER&status=ACTIVE&pageSize=200')])
      .then(([recipeData, warehouseData, processorData]) => { setRecipes(recipeData || []); setWarehouses((warehouseData || []).filter(item => item.status === 'ACTIVE')); setProcessors(processorData.items || []); })
      .catch((error: any) => alert(error.message));
  }, []);

  const chooseRecipe = (recipeId: string) => {
    const selected = recipes.find(item => item.id === recipeId);
    setForm(current => ({ ...current, recipeId, ownerPartnerId: selected?.ownerPartnerId || '', plannedOutputQuantity: selected ? String(selected.baseOutputQuantity) : '', name: selected ? `${selected.name}生产任务` : current.name }));
  };
  const submit = async () => {
    if (!form.name.trim() || !form.recipeId || !form.sourceWarehouseId || !form.targetWarehouseId || !Number(form.plannedOutputQuantity)) return alert('请完整填写生产方案、任务名称、原料仓、成品仓和计划产量');
    if (form.mode === 'OUTSOURCED' && !form.processorOrganizationId) return alert('委外加工必须选择加工服务商');
    setSaving(true);
    try {
      const created = await api.post<any>('/production/tasks', { ...form, processorOrganizationId: form.mode === 'OUTSOURCED' ? form.processorOrganizationId : undefined, plannedOutputQuantity: Number(form.plannedOutputQuantity), processingFeeRate: form.processingFeeRate ? Number(form.processingFeeRate) : undefined, sourceOrderNo: form.sourceOrderNo || undefined, plannedStartAt: form.plannedStartAt || undefined, plannedEndAt: form.plannedEndAt || undefined });
      router.push(`/dashboard/production/${created.id}`);
    } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">新建生产任务</h1><p className="mt-1 text-sm text-muted-foreground">生产任务创建为草稿，确认计划后再下达并预占原料批次</p></div></div>
    <Card className="space-y-5 p-6"><h2 className="font-semibold">任务信息</h2><div className="grid gap-4 md:grid-cols-2">
      <Field label="生产方案 *"><Select value={form.recipeId} onChange={chooseRecipe} options={recipes.map(item => ({ value: item.id, label: `${item.recipeNo} · ${item.name}` }))} /></Field>
      <Field label="任务名称 *"><Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="生产方式 *"><select className="h-10 w-full rounded-md border bg-background px-3" value={form.mode} onChange={event => setForm({ ...form, mode: event.target.value })}><option value="INTERNAL">自营生产</option><option value="OUTSOURCED">委外加工</option></select></Field>
      <Field label="库存主体"><Input value={recipe?.ownerPartner?.name || ''} disabled placeholder="由生产方案确定" /></Field>
      {form.mode === 'OUTSOURCED' && <Field label="加工服务商 *"><Select value={form.processorOrganizationId} onChange={value => setForm({ ...form, processorOrganizationId: value })} options={processors.map(item => ({ value: item.id, label: `${item.code} · ${item.partner.name}` }))} /></Field>}
      {form.mode === 'OUTSOURCED' && <Field label="加工费单价"><Input type="number" min="0" step="0.01" value={form.processingFeeRate} onChange={event => setForm({ ...form, processingFeeRate: event.target.value })} placeholder="元/吨，可选" /></Field>}
      <Field label="原料仓库 *"><Select value={form.sourceWarehouseId} onChange={value => setForm({ ...form, sourceWarehouseId: value })} options={warehouses.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Field>
      <Field label="成品仓库 *"><Select value={form.targetWarehouseId} onChange={value => setForm({ ...form, targetWarehouseId: value })} options={warehouses.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Field>
      <Field label="计划产量（吨） *"><Input type="number" min="0.001" step="0.001" value={form.plannedOutputQuantity} onChange={event => setForm({ ...form, plannedOutputQuantity: event.target.value })} /></Field>
      <Field label="负责人"><Input value={form.operatorName} onChange={event => setForm({ ...form, operatorName: event.target.value })} /></Field>
      <Field label="计划开始"><Input type="datetime-local" value={form.plannedStartAt} onChange={event => setForm({ ...form, plannedStartAt: event.target.value })} /></Field>
      <Field label="计划结束"><Input type="datetime-local" value={form.plannedEndAt} onChange={event => setForm({ ...form, plannedEndAt: event.target.value })} /></Field>
      <Field label="任务来源"><select className="h-10 w-full rounded-md border bg-background px-3" value={form.sourceType} onChange={event => setForm({ ...form, sourceType: event.target.value })}><option value="MANUAL">手工计划</option><option value="SALES_ORDER">销售需求</option></select></Field>
      {form.sourceType === 'SALES_ORDER' && <Field label="销售需求单号"><Input value={form.sourceOrderNo} onChange={event => setForm({ ...form, sourceOrderNo: event.target.value })} /></Field>}
    </div><Field label="备注"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })} /></Field></Card>
    {recipe && <Card className="space-y-4 p-6"><div><h2 className="font-semibold">方案用料预览</h2><p className="mt-1 text-xs text-muted-foreground">正式创建时按计划产量换算并固化到任务，不受方案后续修改影响</p></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">角色</th><th className="p-3">投入物料</th><th className="p-3 text-right">基准用量</th><th className="p-3 text-right">本任务计划用量</th></tr></thead><tbody>{recipe.inputs.map((input: any) => <tr key={input.id} className="border-b"><td className="p-3">{MATERIAL_ROLE[input.materialRole]}</td><td className="p-3">{input.material.code} · {input.material.name}</td><td className="p-3 text-right">{quantity(input.quantity, input.unit)}</td><td className="p-3 text-right font-medium text-primary">{quantity(Number(input.quantity) * Number(form.plannedOutputQuantity || 0) / Number(recipe.baseOutputQuantity), input.unit)}</td></tr>)}</tbody></table></div></Card>}
    <div className="flex justify-end"><Button disabled={saving} onClick={() => void submit()}>{saving ? '创建中...' : '创建任务草稿'}</Button></div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) { return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={event => onChange(event.target.value)}><option value="">请选择</option>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>; }
