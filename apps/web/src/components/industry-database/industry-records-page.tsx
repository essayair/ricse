'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { alertAction, confirmAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';

export type IndustryField = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'tags' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  wide?: boolean;
  list?: boolean;
};

export type IndustryPageConfig = {
  title: string;
  description: string;
  endpoint: string;
  nameLabel: string;
  fields: IndustryField[];
  listColumns?: string[];
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '正常', INACTIVE: '停用', OPERATING: '在产', STOPPED: '停产',
  CONSTRUCTION: '在建', PLANNED: '规划', UNKNOWN: '待核实',
};

const COMMON_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '正常' },
  { value: 'OPERATING', label: '在产' },
  { value: 'CONSTRUCTION', label: '在建' },
  { value: 'PLANNED', label: '规划' },
  { value: 'STOPPED', label: '停产' },
  { value: 'INACTIVE', label: '停用' },
  { value: 'UNKNOWN', label: '待核实' },
];

function displayValue(value: unknown, field: IndustryField) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join('、') : '—';
  if (field.type === 'date') return String(value).slice(0, 10);
  if (field.key === 'status') return STATUS_LABELS[String(value)] || String(value);
  return String(value);
}

export function IndustryRecordsPage({ config }: { config: IndustryPageConfig }) {
  const searchParams = useSearchParams();
  const requestedProvince = searchParams.get('province')?.trim() || '';
  const [data, setData] = useState<{ list: any[]; total: number; pageNo: number; pageSize: number }>({ list: [], total: 0, pageNo: 1, pageSize: 20 });
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [provinceInput, setProvinceInput] = useState(requestedProvince);
  const [statusInput, setStatusInput] = useState('');
  const [filters, setFilters] = useState({ search: '', province: requestedProvince, status: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setCanManage(user.role === 'ADMIN' || (user.permissions || []).includes('industry.database.manage'));
    } catch { setCanManage(false); }
  }, []);

  useEffect(() => {
    setProvinceInput(requestedProvince);
    setPageNo(1);
    setFilters((current) => ({ ...current, province: requestedProvince }));
  }, [requestedProvince]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageNo: String(pageNo), pageSize: String(pageSize) });
      if (filters.search) params.set('search', filters.search);
      if (filters.province) params.set('province', filters.province);
      if (filters.status) params.set('status', filters.status);
      setData(await api.get(`${config.endpoint}?${params}`));
    } catch (error: any) {
      await alertAction(error.message || '产业资料加载失败');
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, filters, pageNo, pageSize]);

  useEffect(() => { void load(); }, [load]);

  const applyFilters = () => {
    setPageNo(1);
    setFilters({
      search: searchInput.trim(),
      province: provinceInput.trim(),
      status: statusInput,
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setProvinceInput('');
    setStatusInput('');
    setPageNo(1);
    setFilters({ search: '', province: '', status: '' });
  };

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  const allFields = useMemo<IndustryField[]>(() => [
    { key: 'name', label: config.nameLabel, required: true, list: true },
    ...config.fields,
    { key: 'province', label: '省份', list: true },
    { key: 'city', label: '城市' },
    { key: 'address', label: '详细地址', wide: true },
    { key: 'status', label: '状态', type: 'select', options: COMMON_STATUS_OPTIONS, list: true },
    { key: 'dataYear', label: '数据年份', type: 'number', placeholder: '例如：2026' },
    { key: 'source', label: '数据来源', wide: true },
    { key: 'description', label: '资料简介', type: 'textarea', wide: true },
    { key: 'remark', label: '备注', type: 'textarea', wide: true },
  ], [config.fields, config.nameLabel]);

  const listFields = config.listColumns?.length
    ? config.listColumns
      .map((key) => allFields.find((field) => field.key === key))
      .filter((field): field is IndustryField => Boolean(field))
    : allFields.filter((field) => field.list).slice(0, 6);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: 'ACTIVE', capacityUnit: '万吨/年', reserveUnit: '万吨' });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const next: Record<string, any> = {};
    for (const field of allFields) {
      const value = item[field.key];
      next[field.key] = field.type === 'tags' && Array.isArray(value) ? value.join('，') : (value ?? '');
    }
    setForm(next);
    setFormOpen(true);
  };

  const save = async () => {
    const required = allFields.find((field) => field.required && !String(form[field.key] || '').trim());
    if (required) return alertAction(`请填写${required.label}`);
    const payload: Record<string, unknown> = {};
    for (const field of allFields) {
      const raw = form[field.key];
      if (raw === '' || raw === undefined || raw === null) continue;
      if (field.type === 'number') payload[field.key] = Number(raw);
      else if (field.type === 'tags') payload[field.key] = String(raw).split(/[，,]/).map((item) => item.trim()).filter(Boolean);
      else payload[field.key] = raw;
    }
    setSaving(true);
    try {
      if (editing) await api.patch(`${config.endpoint}/${editing.id}`, payload);
      else await api.post(config.endpoint, payload);
      setFormOpen(false);
      await load();
      await alertAction(editing ? '产业资料已更新' : '产业资料已创建');
    } catch (error: any) {
      await alertAction(error.message || '保存失败');
    } finally { setSaving(false); }
  };

  const remove = async (item: any) => {
    if (!await confirmAction(`确认删除“${item.name}”吗？删除后无法恢复。`)) return;
    try {
      await api.delete(`${config.endpoint}/${item.id}`);
      await load();
    } catch (error: any) { await alertAction(error.message || '删除失败'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{config.title}</h1><p className="mt-1 text-sm text-muted-foreground">{config.description}</p></div>
        {canManage && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />新增资料</Button>}
      </div>

      <div
        className="flex flex-wrap items-center gap-3"
        onKeyDown={(event) => {
          if (event.key === 'Enter') applyFilters();
        }}
      >
        <div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={`搜索${config.nameLabel}及相关信息`} /></div>
        <Input className="w-40" value={provinceInput} onChange={(event) => setProvinceInput(event.target.value)} placeholder="筛选省份" />
        <select className="field w-36" value={statusInput} onChange={(event) => setStatusInput(event.target.value)}><option value="">全部状态</option>{COMMON_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <Button type="button" onClick={applyFilters} disabled={loading}><Search className="mr-2 h-4 w-4" />查询</Button>
        <Button type="button" variant="outline" onClick={resetFilters} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />重置</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? <div className="flex items-center justify-center p-14 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在加载</div> : !data.list.length ? <div className="p-14 text-center text-muted-foreground">暂无资料，可通过“新增资料”开始维护</div> : <div className="overflow-x-auto"><table className={`w-full text-sm ${listFields.length > 7 ? 'min-w-[1320px]' : 'min-w-[980px]'}`}><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>{listFields.map((field) => <th key={field.key} className="whitespace-nowrap p-3">{field.label}</th>)}<th className="w-44 p-3">操作</th></tr></thead><tbody>{data.list.map((item) => <tr key={item.id} className="border-b hover:bg-muted/20">{listFields.map((field, index) => <td key={field.key} className={`whitespace-nowrap p-3 ${index === 0 ? 'font-medium' : ''}`}>{field.key === 'status' ? <StatusText status={item.status}>{displayValue(item[field.key], field)}</StatusText> : displayValue(item[field.key], field)}</td>)}<td className="p-3"><div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setDetail(item)}><Eye className="mr-1 h-4 w-4" />查看</Button>{canManage && <><Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button></>}</div></td></tr>)}</tbody></table></div>}
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-xs text-muted-foreground">共 {data.total} 条静态产业资料。产业数据库与合作伙伴管理相互独立，不参与交易单据和财务结算。</p>
        <div className="flex items-center gap-2">
          <select
            className="field h-9 w-24"
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPageNo(1); }}
            aria-label="每页条数"
          >
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
            <option value={100}>100 条/页</option>
          </select>
          <span className="min-w-20 text-center text-muted-foreground">{pageNo} / {totalPages} 页</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setPageNo((current) => Math.max(1, current - 1))} disabled={loading || pageNo <= 1} aria-label="上一页"><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPageNo((current) => Math.min(totalPages, current + 1))} disabled={loading || pageNo >= totalPages} aria-label="下一页"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `编辑${config.title}` : `新增${config.title}`}</DialogTitle><DialogDescription>维护核心静态资料；无法确认的信息可以留空，并在备注中说明。</DialogDescription></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">{allFields.map((field) => <label key={field.key} className={`space-y-1.5 text-sm ${field.wide ? 'md:col-span-2' : ''}`}><span>{field.label}{field.required && <span className="text-destructive"> *</span>}</span>{field.type === 'textarea' ? <textarea className="field min-h-24 w-full" value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /> : field.type === 'select' ? <select className="field w-full" value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">请选择</option>{field.options?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <Input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={form[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.type === 'tags' ? (field.placeholder || '多个内容用逗号分隔') : field.placeholder} />}</label>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{detail?.name || '产业资料详情'}</DialogTitle><DialogDescription>静态产业资料详情</DialogDescription></DialogHeader><dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">{detail && allFields.map((field) => <div key={field.key} className={field.wide ? 'md:col-span-2' : ''}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{displayValue(detail[field.key], field)}</dd></div>)}</dl></DialogContent>
      </Dialog>
    </div>
  );
}
