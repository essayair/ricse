'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Info, Plus, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';

interface Category {
  id: string;
  name: string;
  children?: Category[];
}

interface SpecRow {
  id: number;
  name: string;
  operator: string;
  value: string;
  unit: string;
}

const REFERENCE_TYPES = [
  ['TRADING_GOODS', '贸易商品（TRD）'], ['RAW_MATERIAL', '原材料（RAW）'],
  ['SEMI_FINISHED', '半成品（SFG）'], ['FINISHED_GOODS', '产成品（FGD）'],
  ['AUXILIARY', '辅助材料（AUX）'], ['PACKAGING', '包装材料（PKG）'],
  ['SERVICE', '服务项目（SRV）'], ['OTHER', '其他物料（OTH）'],
] as const;
const UNITS = ['吨', '千克', '立方米', '件', '袋'];
const PACKAGE_TYPES = ['散装', '吨袋', '500kg吨袋', '1吨吨袋', '1.2吨吨袋', '编织袋', '桶装', '罐装', '托盘', '其他'];
const OPERATORS = ['≥', '≤', '='];
const QC_TEMPLATES = [
  ['QC-v3.1', 'QC-v3.1 · 萤石粉标准模板'],
  ['QC-v2.0', 'QC-v2.0 · 萤石块模板'],
  ['QC-v3.2', 'QC-v3.2 · 精制萤石粉模板'],
] as const;

let rowSequence = 10;

export default function MaterialNewPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [nextCode, setNextCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [commodityForm, setCommodityForm] = useState('');
  const [coreSpecName, setCoreSpecName] = useState('CaF₂');
  const [coreSpecOperator, setCoreSpecOperator] = useState('≥');
  const [coreSpecValue, setCoreSpecValue] = useState('');
  const [coreSpecUnit, setCoreSpecUnit] = useState('%');
  const [packageType, setPackageType] = useState('散装');
  const [referenceType, setReferenceType] = useState('TRADING_GOODS');
  const [unit, setUnit] = useState('吨');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [qcTemplate, setQcTemplate] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [isVirtual, setIsVirtual] = useState(false);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Category[]>('/master-data/material-categories').then(setCategories).catch(() => setError('物料分类加载失败'));
    const params = new URLSearchParams(window.location.search);
    const fromId = params.get('from');
    const requestedType = params.get('referenceType');
    if (requestedType && REFERENCE_TYPES.some(([value]) => value === requestedType)) setReferenceType(requestedType);
    if (!fromId) return;
    api.get<any>(`/master-data/materials/${fromId}`).then((material) => {
      const standard = material.standardCommodity;
      setCategoryId(standard?.categoryId || material.categoryId || '');
      setCommodityForm(standard?.commodityForm || material.commodityForm || '');
      setCoreSpecName(standard?.coreSpecName || '');
      setCoreSpecOperator(standard?.coreSpecOperator || '≥');
      setCoreSpecValue(standard?.coreSpecValue || '');
      setCoreSpecUnit(standard?.coreSpecUnit || '%');
      setPackageType(standard?.packageType || material.packageType || '散装');
      setUnit(unitLabel(standard?.unit || material.unit || '吨'));
      setQcTemplate(material.qcTemplate || '');
      setHsCode(material.hsCode || '');
      setTaxCode(material.taxCode || '');
      setRemark(material.remark || '');
      const rows = Array.isArray(material.specs) ? material.specs : [];
      setSpecs(rows.slice(1).map((row: any, index: number) => ({ ...row, id: 100 + index })));
    }).catch(() => setError('原物料信息加载失败'));
  }, []);

  useEffect(() => {
    api.get<string>(`/master-data/materials/next-code?referenceType=${referenceType}`)
      .then(setNextCode).catch(() => setNextCode('系统保存时生成'));
  }, [referenceType]);

  const flatCategories = categories.flatMap((category) => [
    { value: category.id, label: category.name, name: category.name },
    ...(category.children || []).map((child) => ({ value: child.id, label: `└ ${child.name}`, name: child.name })),
  ]);
  const selectedCategoryName = flatCategories.find(category => category.value === categoryId)?.name || '';
  const standardName = useMemo(() => {
    const base = `${selectedCategoryName.trim()}${commodityForm.trim()}`;
    const core = coreSpecName.trim() && coreSpecValue.trim()
      ? `${coreSpecName.trim()}${coreSpecOperator}${coreSpecValue.trim()}${coreSpecUnit.trim()}`
      : '';
    return [base, core].filter(Boolean).join('-');
  }, [selectedCategoryName, commodityForm, coreSpecName, coreSpecOperator, coreSpecValue, coreSpecUnit]);

  const addSpec = () => {
    rowSequence += 1;
    setSpecs(current => [...current, { id: rowSequence, name: '', operator: '≤', value: '', unit: '%' }]);
  };

  const handleSubmit = async () => {
    if (!categoryId || !selectedCategoryName || !commodityForm.trim() || !coreSpecName.trim() || !coreSpecValue.trim() || !coreSpecUnit.trim() || !packageType || !referenceType || !unit) {
      setError('请完整填写商品分类、形态、核心规格、包装、参考类型和计量单位');
      return;
    }
    if (specs.some(row => !row.name.trim() || !row.value.trim())) {
      setError('辅助质量指标中存在空行，请补全或删除');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/master-data/materials', {
        baseName: selectedCategoryName, categoryId, commodityForm: commodityForm.trim(),
        coreSpecName: coreSpecName.trim(), coreSpecOperator,
        coreSpecValue: coreSpecValue.trim(), coreSpecUnit: coreSpecUnit.trim(),
        packageType, referenceType, unit,
        specs: [
          { name: coreSpecName.trim(), operator: coreSpecOperator, value: coreSpecValue.trim(), unit: coreSpecUnit.trim() },
          ...specs.map(({ id: _id, ...row }) => row),
        ],
        qcTemplate: qcTemplate || undefined, internalCode: internalCode.trim() || undefined,
        hsCode: hsCode.trim() || undefined, taxCode: taxCode.trim() || undefined,
        isVirtual, remark: remark.trim() || undefined, status: 'ACTIVE',
      });
      router.push('/dashboard/master-data?tab=materials');
    } catch (exception) {
      setError((exception as Error).message || '物料保存失败');
      setLoading(false);
    }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" />返回</Button>
        <div><h1 className="text-2xl font-bold">新建商品物料</h1><p className="mt-1 text-sm text-muted-foreground">填写核心信息即可，平台标准关联、查重、名称和编码由系统自动完成</p></div>
      </div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={loading} onClick={() => void handleSubmit()}><Save className="mr-1 h-4 w-4" />{loading ? '保存中...' : '保存物料'}</Button></div>
    </div>
    {error && <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="max-w-4xl space-y-4">
      <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">商品基本定义</h2><p className="mt-1 text-xs text-muted-foreground">参考类型只用于编码、检索和统计，不限制采购、销售或加工使用</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="商品分类" required><Select value={categoryId} onChange={setCategoryId} options={flatCategories} placeholder="请选择分类" /></Field>
          <Field label="商品名称（系统拼接）"><Input value={standardName || '选择分类并填写形态、核心规格后生成'} readOnly className="bg-muted/50 font-medium" /></Field>
          <Field label="商品形态" required><Input value={commodityForm} onChange={event => setCommodityForm(event.target.value)} placeholder="如：精粉、原矿、块矿" /></Field>
          <Field label="包装方式" required><Select value={packageType} onChange={setPackageType} options={PACKAGE_TYPES.map(value => ({ value, label: value }))} /></Field>
          <Field label="参考类型" required><Select value={referenceType} onChange={setReferenceType} options={REFERENCE_TYPES.map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="计量单位" required><Select value={unit} onChange={setUnit} options={UNITS.map(value => ({ value, label: value }))} /></Field>
          <Field label="物料编码"><Input value={nextCode || '加载中...'} readOnly className="bg-muted/50 font-mono text-muted-foreground" /></Field>
        </div>
        <p className="text-xs text-muted-foreground">商品名称不单独录入，按“所选分类名称 + 商品形态 + 核心规格”自动拼接；包装方式作为独立属性显示。</p>
      </Card>

      <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">规格标准定义</h2><p className="mt-1 text-xs text-muted-foreground">核心规格参与商品名称拼接和标准商品查重；其他指标作为质量与单据标准保留</p></div>
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700 dark:text-blue-300">规格参数会显示在合同、质检、入出库等单据中，请按行业标准录入，如 CaF₂≥97%、水分≤10%。</p>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr_72px_96px_72px_36px] items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
            <span className="text-center text-xs font-medium text-primary">核心规格</span>
            <Input value={coreSpecName} onChange={event => setCoreSpecName(event.target.value)} placeholder="指标，如 CaF₂" />
            <Select value={coreSpecOperator} onChange={setCoreSpecOperator} options={OPERATORS.map(value => ({ value, label: value }))} />
            <Input value={coreSpecValue} onChange={event => setCoreSpecValue(event.target.value)} placeholder="数值" />
            <Input value={coreSpecUnit} onChange={event => setCoreSpecUnit(event.target.value)} placeholder="单位" />
            <span />
          </div>
          {specs.map(row => <div key={row.id} className="grid grid-cols-[80px_1fr_72px_96px_72px_36px] items-center gap-2 rounded-lg bg-muted/30 p-2.5">
            <span className="text-center text-xs text-muted-foreground">其他指标</span>
            <Input value={row.name} onChange={event => setSpecs(current => current.map(item => item.id === row.id ? { ...item, name: event.target.value } : item))} placeholder="如：水分" />
            <Select value={row.operator} onChange={value => setSpecs(current => current.map(item => item.id === row.id ? { ...item, operator: value } : item))} options={OPERATORS.map(value => ({ value, label: value }))} />
            <Input value={row.value} onChange={event => setSpecs(current => current.map(item => item.id === row.id ? { ...item, value: event.target.value } : item))} placeholder="数值" />
            <Input value={row.unit} onChange={event => setSpecs(current => current.map(item => item.id === row.id ? { ...item, unit: event.target.value } : item))} placeholder="单位" />
            <Button type="button" variant="ghost" size="icon" onClick={() => setSpecs(current => current.filter(item => item.id !== row.id))}><X className="h-4 w-4 text-destructive" /></Button>
          </div>)}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addSpec}><Plus className="mr-1 h-4 w-4" />添加规格指标</Button>
      </Card>

      <Card className="p-6">
        <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAdvancedOpen(value => !value)}>
          <div><h2 className="font-semibold">更多设置（可选）</h2><p className="mt-1 text-xs text-muted-foreground">质检模板、编码映射和说明可以创建后继续完善</p></div>
          {advancedOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
        {advancedOpen && <div className="mt-5 space-y-5 border-t pt-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="质检模板"><Select value={qcTemplate} onChange={setQcTemplate} options={QC_TEMPLATES.map(([value, label]) => ({ value, label }))} placeholder="暂不关联" /></Field>
            <Field label="内部编码"><Input value={internalCode} onChange={event => setInternalCode(event.target.value)} /></Field>
            <Field label="HS编码"><Input value={hsCode} onChange={event => setHsCode(event.target.value)} /></Field>
            <Field label="税务商品编码"><Input value={taxCode} onChange={event => setTaxCode(event.target.value)} /></Field>
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={isVirtual} onChange={event => setIsVirtual(event.target.checked)} />不参与实物库存</label>
          </div>
          <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={remark} onChange={event => setRemark(event.target.value)} /></Field>
        </div>}
      </Card>
    </div>
  </div>;
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <div className={className}><label className="mb-1.5 block text-sm font-medium">{label}{required && <span className="ml-0.5 text-destructive">*</span>}</label>{children}</div>;
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return <select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">{placeholder || '请选择'}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}
