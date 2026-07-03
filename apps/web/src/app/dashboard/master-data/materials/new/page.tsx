'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Plus, X, Info } from 'lucide-react';
import { api } from '@/lib/api';

/* ── 类型 ── */

interface SpecRow {
  id: number;
  name: string;      // 指标名称，如 CaF₂
  operator: string;  // ≥ | ≤ | = | 范围
  value: string;     // 数值
  unit: string;      // 单位
}

interface Category {
  id: string;
  name: string;
  children?: Category[];
}

/* ── 常量 ── */

const UNITS = ['吨', '千克', '立方米', '件', '袋'];
const OPERATORS = ['≥', '≤', '=', '范围'];
const PACKAGE_TYPES = ['散装', '吨袋', '小包装', '桶装'];

const QC_TEMPLATES = [
  {
    id: 'QC-v3.1',
    name: 'QC-v3.1 · 萤石粉标准模板',
    desc: '适用：萤石粉（所有品位）',
    items: ['CaF₂含量（主指标）', '水分含量', '粒度分布（-200目过筛率）', 'SiO₂含量', 'CaCO₃含量'],
  },
  {
    id: 'QC-v2.0',
    name: 'QC-v2.0 · 萤石块模板',
    desc: '适用：萤石块矿',
    items: ['CaF₂含量（主指标）', '块度（粒径范围）', '水分含量'],
  },
  {
    id: 'QC-v3.2',
    name: 'QC-v3.2 · 精制萤石粉模板',
    desc: '适用：高品位精制粉（99%+）',
    items: ['CaF₂含量', '水分含量', '粒度（-325目过筛率）', 'SiO₂含量', 'Fe含量', '白度'],
  },
];

const DEFAULT_SPECS: SpecRow[] = [
  { id: 1, name: 'CaF₂', operator: '≥', value: '97', unit: '%' },
  { id: 2, name: '水分', operator: '≤', value: '0.5', unit: '%' },
  { id: 3, name: '粒度-200目', operator: '≥', value: '90', unit: '%' },
];

/* ── 辅助组件 ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

/* ── 页面 ── */

let specIdCounter = 10;

export default function MaterialNewPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [nextCode, setNextCode] = useState('');

  // 基本信息
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('吨');
  const [status, setStatus] = useState('ACTIVE');
  const [isVirtual, setIsVirtual] = useState(false);
  const [packageType, setPackageType] = useState('');
  const [remark, setRemark] = useState('');

  // 规格指标
  const [specs, setSpecs] = useState<SpecRow[]>(DEFAULT_SPECS);

  // 商品编码映射
  const [internalCode, setInternalCode] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [taxCode, setTaxCode] = useState('');

  // 质检模板
  const [qcTemplate, setQcTemplate] = useState('QC-v3.1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Category[]>('/master-data/material-categories').then(setCategories).catch(() => {});
    api.get<string>('/master-data/materials/next-code').then(setNextCode).catch(() => {});
  }, []);

  // 展平分类列表（含子分类）
  const flatCategories = categories.flatMap((c) => [
    { value: c.id, label: c.name },
    ...(c.children || []).map((ch) => ({ value: ch.id, label: `└ ${ch.name}` })),
  ]);

  const addSpec = () => {
    specIdCounter++;
    setSpecs((prev) => [...prev, { id: specIdCounter, name: '', operator: '≥', value: '', unit: '%' }]);
  };

  const removeSpec = (id: number) => {
    if (specs.length <= 1) return;
    setSpecs((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSpec = (id: number, field: keyof SpecRow, value: string) => {
    setSpecs((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSubmit = async () => {
    if (!name) { setError('请填写物料品名'); return; }
    if (!categoryId) { setError('请选择物料大类'); return; }
    if (specs.some((s) => !s.name || !s.value)) { setError('规格指标中存在空行，请补全或删除'); return; }

    setLoading(true);
    setError('');
    try {
      await api.post('/master-data/materials', {
        code: nextCode,
        name,
        categoryId,
        unit,
        status,
        isVirtual,
        packageType: packageType || undefined,
        specs,
        internalCode: internalCode || undefined,
        hsCode: hsCode || undefined,
        taxCode: taxCode || undefined,
        qcTemplate: qcTemplate || undefined,
        remark: remark || undefined,
      });
      router.push('/dashboard/master-data?tab=materials');
    } catch (e: unknown) {
      setError((e as Error).message || '创建失败');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">新增物料</h1>
            <p className="text-sm text-muted-foreground mt-0.5">填写物料基本信息和质检指标模板关联，保存后可在业务单据中引用</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存物料'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="max-w-3xl space-y-4">

        {/* 基本信息 */}
        <Card className="p-6">
          <SectionTitle>基本信息</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="物料编码">
              <Input
                value={nextCode || '加载中...'}
                readOnly
                className="font-mono bg-muted/50 text-muted-foreground italic"
              />
            </FormField>
            <FormField label="物料品名" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：萤石粉、萤石块" />
            </FormField>
            <FormField label="物料大类" required>
              <SelectField
                value={categoryId}
                onChange={setCategoryId}
                options={flatCategories}
                placeholder="请选择大类"
              />
            </FormField>
            <FormField label="计量单位" required>
              <SelectField value={unit} onChange={setUnit} options={UNITS} />
            </FormField>
            <FormField label="包装方式">
              <SelectField value={packageType} onChange={setPackageType} options={PACKAGE_TYPES} placeholder="请选择" />
            </FormField>
            <FormField label="状态" required>
              <SelectField
                value={status} onChange={setStatus}
                options={[{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]}
              />
            </FormField>
            <div className="col-span-3 flex items-center gap-2">
              <input
                type="checkbox" id="isVirtual" checked={isVirtual}
                onChange={(e) => setIsVirtual(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isVirtual" className="text-sm text-foreground cursor-pointer">
                虚拟物料
              </label>
              <span className="text-xs text-muted-foreground">（委托加工成品 / 中间品，不参与实物库存管理）</span>
            </div>
          </div>

          <SectionTitle>规格标准定义</SectionTitle>
          <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 mb-4">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              规格参数将显示在合同、入库单、质检报告等单据中，建议按行业标准格式填写（如：CaF₂≥97%，水分≤0.5%）
            </p>
          </div>
          <div className="space-y-2">
            {specs.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg">
                <Input
                  value={s.name}
                  onChange={(e) => updateSpec(s.id, 'name', e.target.value)}
                  placeholder="指标名称"
                  className="w-32 text-sm"
                />
                <select
                  value={s.operator}
                  onChange={(e) => updateSpec(s.id, 'operator', e.target.value)}
                  className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <Input
                  value={s.value}
                  onChange={(e) => updateSpec(s.id, 'value', e.target.value)}
                  placeholder="数值"
                  className="w-24 text-sm"
                />
                <Input
                  value={s.unit}
                  onChange={(e) => updateSpec(s.id, 'unit', e.target.value)}
                  placeholder="单位"
                  className="w-16 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeSpec(s.id)}
                  disabled={specs.length <= 1}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addSpec}>
            <Plus className="h-3.5 w-3.5 mr-1" />添加规格参数
          </Button>

          <SectionTitle>备注</SectionTitle>
          <textarea
            rows={2} value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="物料说明、使用注意事项等（可选）"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </Card>

        {/* 商品编码映射 */}
        <Card className="p-6">
          <SectionTitle>商品编码映射 <span className="text-muted-foreground normal-case font-normal text-xs tracking-normal">用于税务申报和海关报关</span></SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="内部编码">
              <Input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="内部编码（可选）" className="font-mono" />
            </FormField>
            <FormField label="HS编码（海关）" hint="萤石粉→25291100，萤石块→25291900">
              <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="如：25291100" className="font-mono" />
            </FormField>
            <FormField label="税务商品编码">
              <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="增值税发票商品编码" className="font-mono" />
            </FormField>
          </div>
        </Card>

        {/* 质检指标模板 */}
        <Card className="p-6">
          <SectionTitle>质检指标模板关联 <span className="text-muted-foreground normal-case font-normal text-xs tracking-normal">入库时将自动触发对应质检项目</span></SectionTitle>
          <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 mb-4">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              选择质检模板后，每次该物料入库时系统将自动生成质检任务，并要求填写对应指标数据
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {QC_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setQcTemplate(tpl.id)}
                className={`flex flex-col items-start text-left p-4 rounded-lg border-2 transition-colors ${
                  qcTemplate === tpl.id
                    ? 'border-primary bg-primary/5'
                    : 'border-input hover:border-foreground/30'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium mb-2 ${
                  qcTemplate === tpl.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {qcTemplate === tpl.id ? '当前选中' : '未选中'}
                </span>
                <p className="text-xs text-muted-foreground mb-2">{tpl.desc}</p>
                <ol className="text-xs text-muted-foreground space-y-0.5">
                  {tpl.items.map((item, i) => (
                    <li key={i}>{'①②③④⑤⑥'[i]} {item}</li>
                  ))}
                </ol>
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3">
            <Plus className="h-3.5 w-3.5 mr-1" />新建质检模板
          </Button>
        </Card>

        {/* 底部操作 */}
        <div className="flex justify-end gap-3 pb-8 border-t pt-6">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading} size="lg">
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存物料'}
          </Button>
        </div>
      </div>
    </div>
  );
}
