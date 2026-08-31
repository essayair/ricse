'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus, Save, Search, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Method {
  id: string; code: string; name: string; standardNo: string | null; standardVersion: string | null;
  description: string | null; status: string;
}
interface IndicatorMethod { methodId: string; isDefault: boolean; method: Method }
interface Indicator {
  id: string; code: string; name: string; symbol: string | null; defaultUnit: string; dataType: string;
  decimalPlaces: number; status: string; remark: string | null; methods: IndicatorMethod[];
}
interface TemplateItem {
  id?: string; indicatorId: string; defaultMethodId: string | null; operator: string;
  standardValue: string | null; upperValue: string | null; fuseValue: string | null; unit: string;
  required: boolean; core: boolean; participates: boolean; sort: number;
  indicator?: Indicator; defaultMethod?: Method | null;
}
interface Template {
  id: string; code: string; name: string; materialCategoryId: string | null; businessScene: string;
  version: number; status: string; remark: string | null; items: TemplateItem[];
  materialCategory: { id: string; name: string } | null; _count: { materials: number; qualityTasks: number };
}
interface Category { id: string; name: string }

const SCENES: Record<string, string> = { GENERAL: '通用', PURCHASE: '采购', SALES: '销售', PRODUCTION: '生产' };
const OPERATORS: Record<string, string> = { GTE: '≥', LTE: '≤', EQ: '=', RANGE: '范围' };

export default function QualityStandardsPage() {
  const [tab, setTab] = useState<'indicators' | 'methods' | 'templates'>('indicators');
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [indicatorForm, setIndicatorForm] = useState(() => emptyIndicator());
  const [methodForm, setMethodForm] = useState(() => emptyMethod());
  const [templateForm, setTemplateForm] = useState(() => emptyTemplate());

  const load = useCallback(async () => {
    try {
      const [indicatorData, methodData, templateData, categoryData] = await Promise.all([
        api.get<Indicator[]>('/quality-standards/indicators'),
        api.get<Method[]>('/quality-standards/methods'),
        api.get<Template[]>('/quality-standards/templates'),
        api.get<Category[]>('/master-data/material-categories'),
      ]);
      setIndicators(indicatorData); setMethods(methodData); setTemplates(templateData); setCategories(categoryData);
    } catch (error: any) { alert(error.message || '质检标准加载失败'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tab === 'indicators' ? indicators : tab === 'methods' ? methods : templates;
    const values = tab === 'indicators' ? indicators : tab === 'methods' ? methods : templates;
    return values.filter((item: any) => `${item.code} ${item.name} ${item.standardNo || ''}`.toLowerCase().includes(keyword));
  }, [indicators, methods, search, tab, templates]);

  const saveIndicator = async () => {
    if (!indicatorForm.code.trim() || !indicatorForm.name.trim() || !indicatorForm.defaultUnit.trim()) return alert('请填写指标编码、名称和单位');
    setSaving(true);
    try {
      const body = {
        code: indicatorForm.code, name: indicatorForm.name, symbol: indicatorForm.symbol || undefined,
        defaultUnit: indicatorForm.defaultUnit, dataType: 'NUMBER', decimalPlaces: Number(indicatorForm.decimalPlaces),
        status: indicatorForm.status, remark: indicatorForm.remark || undefined,
        methodIds: indicatorForm.methodIds, defaultMethodId: indicatorForm.defaultMethodId || undefined,
      };
      if (indicatorForm.id) await api.patch(`/quality-standards/indicators/${indicatorForm.id}`, body);
      else await api.post('/quality-standards/indicators', body);
      setIndicatorForm(emptyIndicator()); await load();
    } catch (error: any) { alert(error.message || '检测指标保存失败'); }
    finally { setSaving(false); }
  };

  const saveMethod = async () => {
    if (!methodForm.code.trim() || !methodForm.name.trim()) return alert('请填写方法编码和名称');
    setSaving(true);
    try {
      const body = {
        code: methodForm.code, name: methodForm.name, standardNo: methodForm.standardNo || undefined,
        standardVersion: methodForm.standardVersion || undefined, description: methodForm.description || undefined,
        status: methodForm.status,
      };
      if (methodForm.id) await api.patch(`/quality-standards/methods/${methodForm.id}`, body);
      else await api.post('/quality-standards/methods', body);
      setMethodForm(emptyMethod()); await load();
    } catch (error: any) { alert(error.message || '检测方法保存失败'); }
    finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    if (!templateForm.code.trim() || !templateForm.name.trim()) return alert('请填写模板编码和名称');
    if (!templateForm.items.length) return alert('请至少添加一个检测指标');
    setSaving(true);
    try {
      const body = {
        code: templateForm.code, name: templateForm.name,
        materialCategoryId: templateForm.materialCategoryId || undefined,
        businessScene: templateForm.businessScene, version: Number(templateForm.version),
        status: templateForm.status, remark: templateForm.remark || undefined,
        items: templateForm.items.map((item, index) => ({
          indicatorId: item.indicatorId, defaultMethodId: item.defaultMethodId || undefined,
          operator: item.operator, standardValue: numberValue(item.standardValue), upperValue: numberValue(item.upperValue),
          fuseValue: numberValue(item.fuseValue), unit: item.unit, required: item.required,
          core: item.core, participates: item.participates, sort: index,
        })),
      };
      if (templateForm.id) await api.patch(`/quality-standards/templates/${templateForm.id}`, body);
      else await api.post('/quality-standards/templates', body);
      setTemplateForm(emptyTemplate()); await load();
    } catch (error: any) { alert(error.message || '质检模板保存失败'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">质检标准管理</h1><p className="mt-1 text-sm text-muted-foreground">统一维护检测指标、检测方法和物料质检模板；质检任务生成后保存当时的模板快照。</p></div>
    <div className="flex flex-wrap gap-2 border-b pb-3">
      <Tab active={tab === 'indicators'} onClick={() => setTab('indicators')}>检测指标</Tab>
      <Tab active={tab === 'methods'} onClick={() => setTab('methods')}>检测方法</Tab>
      <Tab active={tab === 'templates'} onClick={() => setTab('templates')}>质检模板</Tab>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b p-4"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索编码、名称或标准号" /></div><Badge variant="secondary">{filtered.length} 条</Badge></div>
        <div className="max-h-[680px] overflow-auto">
          {tab === 'indicators' && (filtered as Indicator[]).map(item => <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => setIndicatorForm({ id: item.id, code: item.code, name: item.name, symbol: item.symbol || '', defaultUnit: item.defaultUnit, decimalPlaces: String(item.decimalPlaces), status: item.status, remark: item.remark || '', methodIds: item.methods.map(link => link.methodId), defaultMethodId: item.methods.find(link => link.isDefault)?.methodId || '' })}><div className="flex items-center justify-between"><div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{item.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div><div className="mt-2 text-xs text-muted-foreground">单位 {item.defaultUnit} · 方法 {item.methods.map(link => link.method.name).join('、') || '未配置'}</div></button>)}
          {tab === 'methods' && (filtered as Method[]).map(item => <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => setMethodForm({ id: item.id, code: item.code, name: item.name, standardNo: item.standardNo || '', standardVersion: item.standardVersion || '', description: item.description || '', status: item.status })}><div className="flex items-center justify-between"><div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{item.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div><div className="mt-2 text-xs text-muted-foreground">{item.standardNo || '暂无标准编号'}{item.standardVersion ? ` · ${item.standardVersion}` : ''}</div></button>)}
          {tab === 'templates' && (filtered as Template[]).map(item => <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => setTemplateForm({ id: item.id, code: item.code, name: item.name, materialCategoryId: item.materialCategoryId || '', businessScene: item.businessScene, version: String(item.version), status: item.status, remark: item.remark || '', items: item.items.map(value => ({ ...value, standardValue: textValue(value.standardValue), upperValue: textValue(value.upperValue), fuseValue: textValue(value.fuseValue) })) })}><div className="flex items-center justify-between"><div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div><Badge>{SCENES[item.businessScene]}</Badge></div><div className="mt-2 text-xs text-muted-foreground">{item.materialCategory?.name || '全部物料'} · {item.items.length} 项指标 · 已关联 {item._count.materials} 个物料</div></button>)}
          {!filtered.length && <div className="p-16 text-center text-sm text-muted-foreground">暂无数据</div>}
        </div>
      </Card>

      {tab === 'indicators' && <Card className="space-y-4 p-5"><EditorTitle title={indicatorForm.id ? '编辑检测指标' : '新增检测指标'} onNew={() => setIndicatorForm(emptyIndicator())} /><div className="grid gap-3 sm:grid-cols-2"><Field label="指标编码 *"><Input value={indicatorForm.code} onChange={event => setIndicatorForm(value => ({ ...value, code: event.target.value }))} /></Field><Field label="指标名称 *"><Input value={indicatorForm.name} onChange={event => setIndicatorForm(value => ({ ...value, name: event.target.value }))} /></Field><Field label="指标符号"><Input value={indicatorForm.symbol} onChange={event => setIndicatorForm(value => ({ ...value, symbol: event.target.value }))} /></Field><Field label="默认单位 *"><Input value={indicatorForm.defaultUnit} onChange={event => setIndicatorForm(value => ({ ...value, defaultUnit: event.target.value }))} /></Field></div><Field label="允许的检测方法"><div className="grid gap-2 sm:grid-cols-2">{methods.filter(item => item.status === 'ACTIVE').map(method => <label key={method.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={indicatorForm.methodIds.includes(method.id)} onChange={event => setIndicatorForm(value => ({ ...value, methodIds: event.target.checked ? [...value.methodIds, method.id] : value.methodIds.filter(id => id !== method.id), defaultMethodId: !event.target.checked && value.defaultMethodId === method.id ? '' : value.defaultMethodId }))} />{method.name}</label>)}</div></Field><Field label="默认检测方法"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={indicatorForm.defaultMethodId} onChange={event => setIndicatorForm(value => ({ ...value, defaultMethodId: event.target.value }))}><option value="">暂不指定</option>{methods.filter(item => indicatorForm.methodIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={indicatorForm.remark} onChange={event => setIndicatorForm(value => ({ ...value, remark: event.target.value }))} /></Field><SaveButton saving={saving} onClick={saveIndicator} /></Card>}

      {tab === 'methods' && <Card className="space-y-4 p-5"><EditorTitle title={methodForm.id ? '编辑检测方法' : '新增检测方法'} onNew={() => setMethodForm(emptyMethod())} /><div className="grid gap-3 sm:grid-cols-2"><Field label="方法编码 *"><Input value={methodForm.code} onChange={event => setMethodForm(value => ({ ...value, code: event.target.value }))} /></Field><Field label="方法名称 *"><Input value={methodForm.name} onChange={event => setMethodForm(value => ({ ...value, name: event.target.value }))} /></Field><Field label="标准编号"><Input value={methodForm.standardNo} onChange={event => setMethodForm(value => ({ ...value, standardNo: event.target.value }))} /></Field><Field label="标准版本"><Input value={methodForm.standardVersion} onChange={event => setMethodForm(value => ({ ...value, standardVersion: event.target.value }))} /></Field></div><Field label="方法说明"><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={methodForm.description} onChange={event => setMethodForm(value => ({ ...value, description: event.target.value }))} /></Field><SaveButton saving={saving} onClick={saveMethod} /></Card>}

      {tab === 'templates' && <Card className="space-y-4 p-5"><EditorTitle title={templateForm.id ? '编辑质检模板' : '新增质检模板'} onNew={() => setTemplateForm(emptyTemplate())} /><div className="grid gap-3 sm:grid-cols-2"><Field label="模板编码 *"><Input value={templateForm.code} onChange={event => setTemplateForm(value => ({ ...value, code: event.target.value }))} /></Field><Field label="模板名称 *"><Input value={templateForm.name} onChange={event => setTemplateForm(value => ({ ...value, name: event.target.value }))} /></Field><Field label="适用物料大类"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateForm.materialCategoryId} onChange={event => setTemplateForm(value => ({ ...value, materialCategoryId: event.target.value }))}><option value="">全部物料</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="业务场景"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateForm.businessScene} onChange={event => setTemplateForm(value => ({ ...value, businessScene: event.target.value }))}>{Object.entries(SCENES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><TemplateItems value={templateForm.items} indicators={indicators} onChange={items => setTemplateForm(value => ({ ...value, items }))} /><Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={templateForm.remark} onChange={event => setTemplateForm(value => ({ ...value, remark: event.target.value }))} /></Field><SaveButton saving={saving} onClick={saveTemplate} /></Card>}
    </div>
  </div>;
}

function TemplateItems({ value, indicators, onChange }: { value: TemplateItem[]; indicators: Indicator[]; onChange: (value: TemplateItem[]) => void }) {
  const available = indicators.filter(item => item.status === 'ACTIVE' && !value.some(row => row.indicatorId === item.id));
  const add = (indicatorId: string) => {
    const indicator = indicators.find(item => item.id === indicatorId); if (!indicator) return;
    const defaultLink = indicator.methods.find(item => item.isDefault) || indicator.methods[0];
    onChange([...value, { indicatorId, defaultMethodId: defaultLink?.methodId || null, operator: 'GTE', standardValue: '', upperValue: '', fuseValue: '', unit: indicator.defaultUnit, required: true, core: false, participates: true, sort: value.length, indicator }]);
  };
  const update = (index: number, patch: Partial<TemplateItem>) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <div className="space-y-3"><div className="flex items-center justify-between"><label className="text-sm font-medium">模板指标 *</label><select className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={event => add(event.target.value)}><option value="">+ 添加指标</option>{available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{value.map((item, index) => { const indicator = indicators.find(value => value.id === item.indicatorId) || item.indicator; const allowedMethods = indicator?.methods || []; return <div key={item.indicatorId} className="space-y-2 rounded-md border p-3"><div className="flex items-center justify-between"><div className="font-medium">{indicator?.name || item.indicatorId}</div><button className="text-xs text-destructive" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>移除</button></div><div className="grid gap-2 sm:grid-cols-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.defaultMethodId || ''} onChange={event => update(index, { defaultMethodId: event.target.value || null })}><option value="">暂不指定方法</option>{allowedMethods.map(link => <option key={link.methodId} value={link.methodId}>{link.method.name}</option>)}</select><select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.operator} onChange={event => update(index, { operator: event.target.value })}>{Object.entries(OPERATORS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Input type="number" step="0.0001" placeholder="标准值" value={textValue(item.standardValue)} onChange={event => update(index, { standardValue: event.target.value })} /><Input type="number" step="0.0001" placeholder={item.operator === 'RANGE' ? '上限值' : '熔断线'} value={textValue(item.operator === 'RANGE' ? item.upperValue : item.fuseValue)} onChange={event => update(index, item.operator === 'RANGE' ? { upperValue: event.target.value } : { fuseValue: event.target.value })} /></div><div className="flex flex-wrap gap-4 text-xs"><label><input className="mr-1" type="checkbox" checked={item.required} onChange={event => update(index, { required: event.target.checked })} />必检</label><label><input className="mr-1" type="checkbox" checked={item.core} onChange={event => update(index, { core: event.target.checked })} />核心指标</label><label><input className="mr-1" type="checkbox" checked={item.participates} onChange={event => update(index, { participates: event.target.checked })} />参与判定</label></div></div>; })}{!value.length && <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-6 w-6 opacity-40" />请添加检测指标</div>}</div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <Button variant={active ? 'default' : 'ghost'} onClick={onClick}>{children}</Button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }
function EditorTitle({ title, onNew }: { title: string; onNew: () => void }) { return <div className="flex items-center justify-between border-b pb-3"><div className="flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4 text-primary" />{title}</div><Button size="sm" variant="outline" onClick={onNew}><Plus className="mr-1 h-4 w-4" />新增</Button></div>; }
function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) { return <div className="flex justify-end"><Button disabled={saving} onClick={() => void onClick()}><Save className="mr-1 h-4 w-4" />{saving ? '保存中...' : '保存'}</Button></div>; }
function emptyIndicator() { return { id: '', code: '', name: '', symbol: '', defaultUnit: '%', decimalPlaces: '4', status: 'ACTIVE', remark: '', methodIds: [] as string[], defaultMethodId: '' }; }
function emptyMethod() { return { id: '', code: '', name: '', standardNo: '', standardVersion: '', description: '', status: 'ACTIVE' }; }
function emptyTemplate() { return { id: '', code: '', name: '', materialCategoryId: '', businessScene: 'GENERAL', version: '1', status: 'ACTIVE', remark: '', items: [] as TemplateItem[] }; }
function numberValue(value: string | number | null | undefined) { return value === '' || value === null || value === undefined ? undefined : Number(value); }
function textValue(value: string | number | null | undefined) { return value === null || value === undefined ? '' : String(value); }
