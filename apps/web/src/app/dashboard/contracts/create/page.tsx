'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

interface Supplier { id: string; name: string }
interface Material { id: string; name: string; unit: string }

export default function CreateContractPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    type: 'PURCHASE',
    supplierId: '',
    signedAt: new Date().toISOString().split('T')[0],
    effectiveAt: '',
    expireAt: '',
    settlementMethod: 'DELIVERY',
    remarks: '',
  });

  const [lineItems, setLineItems] = useState([
    { materialId: '', materialName: '', quantity: 0, unit: 'TON', unitPrice: 0 },
  ]);

  useEffect(() => {
    fetch('http://localhost:3000/api/v1/master-data/suppliers').then(r => r.json()).then(d => setSuppliers(d.items));
    fetch('http://localhost:3000/api/v1/master-data/materials').then(r => r.json()).then(d => setMaterials(d.items));
  }, []);

  const totalAmount = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const addLine = () => setLineItems([...lineItems, { materialId: '', materialName: '', quantity: 0, unit: 'TON', unitPrice: 0 }]);

  const updateLine = (idx: number, field: string, value: any) => {
    const items = [...lineItems];
    (items[idx] as any)[field] = value;
    if (field === 'materialId') {
      const mat = materials.find(m => m.id === value);
      if (mat) { items[idx].materialName = mat.name; items[idx].unit = mat.unit; }
    }
    setLineItems(items);
  };

  const removeLine = (idx: number) => {
    if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:3000/api/v1/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, totalAmount, lineItems }),
      });
      if (res.ok) {
        const c = await res.json();
        router.push(`/dashboard/contracts/${c.id}`);
      } else {
        const err = await res.json();
        alert(err.message?.[0] || err.message || '创建失败');
      }
    } catch { alert('创建失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button onClick={() => router.push('/dashboard/contracts')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> 返回合同列表
      </button>

      <div>
        <h1 className="text-2xl font-bold">新建合同</h1>
        <p className="text-sm text-muted-foreground mt-1">填写合同信息及明细行项</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">合同标题 *</label>
              <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">合同类型 *</label>
              <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PURCHASE">采购合同</SelectItem>
                  <SelectItem value="SALES">销售合同</SelectItem>
                  <SelectItem value="BILATERAL">双边合同</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">供应商 *</label>
              <Select value={form.supplierId} onValueChange={v => setForm({...form, supplierId: v})}>
                <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">签订日期</label>
              <Input type="date" value={form.signedAt} onChange={e => setForm({...form, signedAt: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">结算方式</label>
              <Select value={form.settlementMethod} onValueChange={v => setForm({...form, settlementMethod: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREPAYMENT">预付</SelectItem>
                  <SelectItem value="INSTALLMENT">分期</SelectItem>
                  <SelectItem value="DELIVERY">交货结算</SelectItem>
                  <SelectItem value="NET_30">月结30天</SelectItem>
                  <SelectItem value="NET_60">月结60天</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">生效日期</label>
              <Input type="date" value={form.effectiveAt} onChange={e => setForm({...form, effectiveAt: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">到期日期</label>
              <Input type="date" value={form.expireAt} onChange={e => setForm({...form, expireAt: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">备注</label>
              <textarea value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})}
                className="flex h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">合同行项</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3 w-3 mr-1" />添加行项
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex gap-3 items-end p-3 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">物料</label>
                  <Select value={item.materialId} onValueChange={v => updateLine(idx, 'materialId', v)}>
                    <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                    <SelectContent>
                      {materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <label className="text-xs text-muted-foreground mb-1 block">数量</label>
                  <Input type="number" value={item.quantity || ''} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} min={0.001} step={0.001} />
                </div>
                <div className="w-20">
                  <label className="text-xs text-muted-foreground mb-1 block">单位</label>
                  <Input value={item.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} />
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground mb-1 block">单价</label>
                  <Input type="number" value={item.unitPrice || ''} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} min={0} step={0.01} />
                </div>
                <div className="w-24 text-sm pt-5 text-muted-foreground">
                  ¥{(item.quantity * item.unitPrice).toLocaleString()}
                </div>
                {lineItems.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} className="h-10 w-10 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="text-right text-lg font-semibold pt-4 border-t">
              合计: ¥{totalAmount.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? '提交中...' : '创建合同'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/contracts')}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
