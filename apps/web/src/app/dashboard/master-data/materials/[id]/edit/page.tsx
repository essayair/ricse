'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';

interface Category {
  id: string;
  name: string;
  children?: Category[];
}

const UNITS = ['吨', '千克', '立方米', '件', '袋'];
const PACKAGE_TYPES = ['散装', '吨袋', '小包装', '桶装'];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function MaterialEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('吨');
  const [grade, setGrade] = useState('');
  const [packageType, setPackageType] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [spec, setSpec] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [remark, setRemark] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Category[]>('/master-data/material-categories').then(setCategories).catch(() => {});
    api.get<any>(`/master-data/materials/${id}`).then((m) => {
      setName(m.name || '');
      setCategoryId(m.categoryId || '');
      setUnit(unitLabel(m.unit || '吨'));
      setGrade(m.grade || '');
      setPackageType(m.packageType || '');
      setStatus(m.status || 'ACTIVE');
      setSpec(m.spec || '');
      setHsCode(m.hsCode || '');
      setTaxCode(m.taxCode || '');
      setInternalCode(m.internalCode || '');
      setRemark(m.remark || '');
    }).catch(() => setError('加载物料信息失败'));
  }, [id]);

  const flatCategories = categories.flatMap((c) => [
    { value: c.id, label: c.name },
    ...(c.children || []).map((ch) => ({ value: ch.id, label: `└ ${ch.name}` })),
  ]);

  const handleSubmit = async () => {
    if (!name) { setError('请填写物料品名'); return; }
    setLoading(true);
    setError('');
    try {
      await api.patch(`/master-data/materials/${id}`, {
        name, categoryId: categoryId || undefined,
        unit, grade: grade || undefined,
        packageType: packageType || undefined, status,
        spec: spec || undefined,
        hsCode: hsCode || undefined,
        taxCode: taxCode || undefined,
        internalCode: internalCode || undefined,
        remark: remark || undefined,
      });
      router.push('/dashboard/master-data?tab=materials');
    } catch (e: unknown) {
      setError((e as Error).message || '保存失败');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">编辑物料</h1>
            <p className="text-sm text-muted-foreground mt-0.5">修改物料基本信息</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="max-w-3xl">
        <Card className="p-6">
          <SectionTitle>基本信息</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="物料品名" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：萤石粉" />
            </FormField>
            <FormField label="物料大类" required>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">请选择</option>
                {flatCategories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="品级">
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="如：CaF₂≥97%" />
            </FormField>
            <FormField label="计量单位">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
            <FormField label="规格">
              <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="如：-200目" />
            </FormField>
            <FormField label="包装方式">
              <select
                value={packageType}
                onChange={(e) => setPackageType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">请选择</option>
                {PACKAGE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="状态" required>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="ACTIVE">启用</option>
                <option value="INACTIVE">停用</option>
              </select>
            </FormField>
          </div>

          <SectionTitle>编码映射</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="内部编码">
              <Input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="内部编码" className="font-mono" />
            </FormField>
            <FormField label="HS编码（海关）">
              <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="如：25291100" className="font-mono" />
            </FormField>
            <FormField label="税务商品编码">
              <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="增值税发票商品编码" className="font-mono" />
            </FormField>
          </div>

          <SectionTitle>备注</SectionTitle>
          <textarea
            rows={2} value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="物料说明（可选）"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </Card>

        <div className="flex justify-end gap-3 pb-8 border-t pt-6 mt-6">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading} size="lg">
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
