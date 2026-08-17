'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type InputLine = { materialId: string; materialRole: string; quantity: string; unit: string; remark: string };
const emptyLine = (): InputLine => ({ materialId: '', materialRole: 'RAW', quantity: '', unit: 'TON', remark: '' });

export function ProductionRecipeForm({ id }: { id?: string }) {
  const router = useRouter();
  const [partners, setPartners] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [referenced, setReferenced] = useState(false);
  const [form, setForm] = useState({ name: '', ownerPartnerId: '', outputMaterialId: '', baseOutputQuantity: '1', expectedYieldRate: '', lossToleranceRate: '5', qualityRequired: true, processDescription: '', qualityRequirements: '', remark: '', status: 'ACTIVE' });
  const [inputs, setInputs] = useState<InputLine[]>([emptyLine()]);

  useEffect(() => {
    Promise.all([
      api.get<{ items: any[] }>('/partners?pageSize=500'),
      api.get<{ items: any[] }>('/master-data/materials?pageSize=500'),
      id ? api.get<any>(`/production/recipes/${id}`) : Promise.resolve(null),
    ]).then(([partnerData, materialData, recipe]) => {
      setPartners((partnerData.items || []).filter(item => item.isInternal && item.status === 'ACTIVE'));
      setMaterials((materialData.items || []).filter(item => item.status === 'ACTIVE' && !item.isVirtual));
      if (recipe) {
        setReferenced(Number(recipe._count?.tasks || 0) > 0);
        setForm({
          name: recipe.name || '', ownerPartnerId: recipe.ownerPartnerId || '', outputMaterialId: recipe.outputMaterialId || '',
          baseOutputQuantity: String(recipe.baseOutputQuantity), expectedYieldRate: recipe.expectedYieldRate == null ? '' : String(recipe.expectedYieldRate),
          lossToleranceRate: String(recipe.lossToleranceRate), qualityRequired: Boolean(recipe.qualityRequired),
          processDescription: recipe.processDescription || '', qualityRequirements: recipe.qualityRequirements || '',
          remark: recipe.remark || '', status: recipe.status || 'ACTIVE',
        });
        setInputs(recipe.inputs.map((item: any) => ({ materialId: item.materialId, materialRole: item.materialRole, quantity: String(item.quantity), unit: item.unit, remark: item.remark || '' })));
      }
    }).catch((error: any) => { alert(error.message); router.push('/dashboard/production/recipes'); })
      .finally(() => setLoading(false));
  }, [id, router]);

  const updateLine = (index: number, value: Partial<InputLine>) => setInputs(current => current.map((line, row) => row === index ? { ...line, ...value } : line));
  const submit = async () => {
    if (!form.name.trim() || !form.ownerPartnerId || !form.outputMaterialId || !Number(form.baseOutputQuantity)) return alert('请填写方案名称、库存主体、产出物料和基准产量');
    const validInputs = inputs.filter(item => item.materialId && Number(item.quantity) > 0);
    if (!validInputs.length) return alert('请至少添加一种投入物料');
    setSaving(true);
    try {
      const { status, ...recipeFields } = form;
      const payload = {
        ...recipeFields,
        ...(id ? { status } : {}),
        baseOutputQuantity: Number(form.baseOutputQuantity),
        expectedYieldRate: form.expectedYieldRate ? Number(form.expectedYieldRate) : undefined,
        lossToleranceRate: Number(form.lossToleranceRate),
        inputs: validInputs.map(item => ({ ...item, quantity: Number(item.quantity), remark: item.remark || undefined })),
      };
      if (id) await api.patch(`/production/recipes/${id}`, payload);
      else await api.post('/production/recipes', payload);
      router.push('/dashboard/production/recipes');
    } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  };
  if (loading) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">{id ? '编辑生产方案' : '新建生产方案'}</h1><p className="mt-1 text-sm text-muted-foreground">方案定义标准关系，实际库存批次与数量在生产任务中确定</p></div></div>
    {referenced && <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">该方案已经被生产任务引用。库存主体、产出物料和基准产量已锁定；投料标准和说明的修改只影响后续新任务。</div>}
    <Card className="space-y-5 p-6"><h2 className="font-semibold">方案基础信息</h2><div className="grid gap-4 md:grid-cols-2">
      <Field label="方案名称 *"><Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：萤石精粉加工标准方案" /></Field>
      <Field label="库存主体 *"><Select disabled={referenced} value={form.ownerPartnerId} onChange={value => setForm({ ...form, ownerPartnerId: value })} options={partners.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Field>
      <Field label="产出物料 *"><Select disabled={referenced} value={form.outputMaterialId} onChange={value => setForm({ ...form, outputMaterialId: value })} options={materials.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Field>
      <Field label="基准产量（吨） *"><Input disabled={referenced} type="number" min="0.001" step="0.001" value={form.baseOutputQuantity} onChange={event => setForm({ ...form, baseOutputQuantity: event.target.value })} /></Field>
      <Field label="目标收率（%）"><Input type="number" min="0" step="0.01" value={form.expectedYieldRate} onChange={event => setForm({ ...form, expectedYieldRate: event.target.value })} placeholder="用于分析，不作为强制限制" /></Field>
      <Field label="产量允许偏差（%）"><Input type="number" min="0" step="0.01" value={form.lossToleranceRate} onChange={event => setForm({ ...form, lossToleranceRate: event.target.value })} /></Field>
      <Field label="质量控制"><label className="flex h-10 items-center gap-2 rounded-md border px-3"><input type="checkbox" checked={form.qualityRequired} onChange={event => setForm({ ...form, qualityRequired: event.target.checked })} />完工后必须确认质量结论才能入库</label></Field>
      {id && <Field label="方案状态"><select className="h-10 w-full rounded-md border bg-background px-3" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></Field>}
    </div></Card>
    <Card className="space-y-4 p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">标准投入</h2><p className="mt-1 text-xs text-muted-foreground">数量口径为“每基准产量需要投入多少”；创建任务后系统按比例换算计划用量</p></div><Button variant="outline" onClick={() => setInputs(current => [...current, emptyLine()])}><Plus className="mr-1 h-4 w-4" />追加物料</Button></div>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[1000px] text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">投入角色</th><th className="p-3">物料</th><th className="p-3">标准数量</th><th className="p-3">单位</th><th className="p-3">备注</th><th className="p-3">操作</th></tr></thead><tbody>{inputs.map((line, index) => <tr key={index} className="border-b"><td className="p-3"><select className="h-10 rounded-md border bg-background px-3" value={line.materialRole} onChange={event => updateLine(index, { materialRole: event.target.value })}><option value="RAW">主料</option><option value="AUXILIARY">辅料</option><option value="PACKAGING">包装物</option></select></td><td className="p-3"><Select value={line.materialId} onChange={value => updateLine(index, { materialId: value })} options={materials.filter(item => item.id !== form.outputMaterialId).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></td><td className="p-3"><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => updateLine(index, { quantity: event.target.value })} /></td><td className="p-3"><select className="h-10 rounded-md border bg-background px-3" value={line.unit} onChange={event => updateLine(index, { unit: event.target.value })}><option value="TON">吨</option><option value="KG">千克</option><option value="BAG">袋</option><option value="PCS">件</option></select></td><td className="p-3"><Input value={line.remark} onChange={event => updateLine(index, { remark: event.target.value })} /></td><td className="p-3"><Button variant="ghost" size="icon" disabled={inputs.length === 1} onClick={() => setInputs(current => current.filter((_, row) => row !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div>
    </Card>
    <Card className="space-y-4 p-6"><h2 className="font-semibold">工艺与质量说明</h2><div className="grid gap-4 md:grid-cols-2"><Field label="加工工艺"><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={form.processDescription} onChange={event => setForm({ ...form, processDescription: event.target.value })} /></Field><Field label="质量要求"><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={form.qualityRequirements} onChange={event => setForm({ ...form, qualityRequirements: event.target.value })} /></Field></div><Field label="备注"><Input value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></Field></Card>
    <div className="flex justify-end"><Button disabled={saving} onClick={() => void submit()}>{saving ? '保存中...' : id ? '保存生产方案' : '创建生产方案'}</Button></div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }
function Select({ value, onChange, options, disabled = false }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) { return <select disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" value={value} onChange={event => onChange(event.target.value)}><option value="">请选择</option>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>; }
