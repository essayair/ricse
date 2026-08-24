'use client';

import { useEffect, useState } from 'react';
import { Database, FileUp, Pencil, Plus, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const EMPTY = {
  code: '', name: '', type: 'GDELT', status: 'ACTIVE', schedule: '17 */2 * * *',
  query: '', queries: '', endpoint: '', keywords: '萤石，氟化工，氢氟酸，氟化铝，制冷剂',
  excludeKeywords: '摄像机，监控器，智能锁，镜头，塔罗，星座，水晶，宝石', excludeDomains: '',
  timespan: '3d', maxRecords: '50', sourceName: '', transport: 'auto', enforceKeywords: true,
};

export default function DataSourcesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [uploadingId, setUploadingId] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const load = () => api.get<any[]>('/content/data-sources').then(setItems).catch((error: any) => alert(error.message));
  useEffect(() => { void load(); }, []);

  const toggle = async (item: any) => {
    try {
      await api.patch(`/content/data-sources/${item.id}`, { status: item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      load();
    } catch (error: any) { alert(error.message); }
  };

  const upload = async (item: any, file?: File) => {
    if (!file) return;
    const data = new FormData(); data.append('file', file); setUploadingId(item.id);
    try {
      await api.upload(`/content/data-sources/${item.id}/import`, data);
      alert('文件已进入异步导入队列，可在“采集与 AI”查看结果'); load();
    } catch (error: any) { alert(error.message); } finally { setUploadingId(''); }
  };

  const beginCreate = () => { setEditingId(''); setForm(EMPTY); setOpen(true); };
  const beginEdit = (item: any) => {
    const config = item.config || {};
    setEditingId(item.id);
    setForm({
      code: item.code, name: item.name, type: item.type, status: item.status,
      schedule: item.schedule || '17 */2 * * *', query: config.query || '', queries: Array.isArray(config.queries) ? config.queries.join('\n') : '', endpoint: config.endpoint || '',
      keywords: Array.isArray(config.keywords) ? config.keywords.join('，') : '', timespan: config.timespan || '3d',
      excludeKeywords: Array.isArray(config.excludeKeywords) ? config.excludeKeywords.join('，') : '',
      excludeDomains: Array.isArray(config.excludeDomains) ? config.excludeDomains.join(',') : '',
      maxRecords: String(config.maxRecords || 50), sourceName: config.sourceName || '',
      transport: config.transport || 'auto',
      enforceKeywords: Boolean(config.enforceKeywords),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || (!editingId && !form.code.trim())) return alert('请填写数据源名称和编码');
    if (form.type === 'GDELT' && !form.query.trim() && !form.queries.trim()) return alert('请填写单一检索表达式或轮换查询');
    if (form.type === 'RSS' && !form.endpoint.trim()) return alert('请填写 RSS/Atom 订阅地址');
    const config = {
      ...(form.type === 'GDELT' ? { query: form.query.trim(), queries: String(form.queries || '').split(/\n/).map((item: string) => item.trim()).filter(Boolean), queryRotationHours: 2, timespan: form.timespan.trim() || '3d', maxRecords: Number(form.maxRecords || 30), transport: form.transport } : { endpoint: form.endpoint.trim() }),
      keywords: String(form.keywords || '').split(/[，,]/).map((item: string) => item.trim()).filter(Boolean),
      excludeKeywords: String(form.excludeKeywords || '').split(/[，,]/).map((item: string) => item.trim()).filter(Boolean),
      excludeDomains: String(form.excludeDomains || '').split(/[,，]/).map((item: string) => item.trim().toLowerCase()).filter(Boolean),
      sourceName: form.sourceName.trim() || undefined,
      enforceKeywords: Boolean(form.enforceKeywords),
    };
    const payload = { name: form.name, status: form.status, schedule: form.schedule, config };
    setSaving(true);
    try {
      if (editingId) await api.patch(`/content/data-sources/${editingId}`, payload);
      else await api.post('/content/data-sources', { ...payload, code: form.code, type: form.type });
      setOpen(false); load();
    } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">数据源管理</h1><p className="mt-1 text-sm text-muted-foreground">统一管理产业资讯、行情与人工导入数据源；生意社新资讯去重后自动发布</p></div><Button onClick={beginCreate}><Plus className="mr-1 h-4 w-4" />新增资讯源</Button></div>
    <div className="grid gap-4 lg:grid-cols-2">{items.map(item => <Card key={item.id} className="p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Database className="h-5 w-5" /></div><div><div className="font-semibold">{item.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.code} · {item.type}</div></div></div><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{item.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-muted-foreground">执行计划</div><div className="mt-1 font-mono">{item.schedule || '手工触发'}</div></div><div><div className="text-xs text-muted-foreground">最近成功</div><div className="mt-1">{contentDate(item.lastSuccessAt)}</div></div>{['GDELT', 'RSS'].includes(item.type) && <div className="col-span-2"><div className="text-xs text-muted-foreground">采集范围</div><div className="mt-1 break-all text-xs">{item.type === 'GDELT' ? item.config?.query || '未配置检索表达式' : item.config?.endpoint || '未配置订阅地址'}</div><div className="mt-1 text-xs text-muted-foreground">关键词：{item.config?.keywords?.join('、') || '不额外过滤'}</div></div>}{item.type === 'API' && item.config?.pageUrl && <div className="col-span-2"><div className="text-xs text-muted-foreground">目标来源页面</div><a className="mt-1 block break-all text-xs text-primary hover:underline" href={item.config.pageUrl} target="_blank" rel="noreferrer">{item.config.pageUrl}</a></div>}<div className="col-span-2"><div className="text-xs text-muted-foreground">最近异常</div><div className={`mt-1 ${item.lastError ? 'text-destructive' : ''}`}>{item.lastError || '无'}</div></div></div>
      <div className="mt-4 flex justify-end gap-2">{['FILE', 'EXCEL'].includes(item.type) && <label><input className="hidden" type="file" accept=".xls,.xlsx,.csv" disabled={uploadingId === item.id} onChange={event => { void upload(item, event.target.files?.[0]); event.currentTarget.value = ''; }} /><span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-muted"><FileUp className="mr-1 h-4 w-4" />{uploadingId === item.id ? '上传中…' : '上传行情表'}</span></label>}{['GDELT', 'RSS'].includes(item.type) && <Button size="sm" variant="outline" onClick={() => beginEdit(item)}><Pencil className="mr-1 h-4 w-4" />配置</Button>}<Button size="sm" variant="outline" onClick={() => toggle(item)}><Power className="mr-1 h-4 w-4" />{item.status === 'ACTIVE' ? '停用' : '启用'}</Button></div>
    </Card>)}{!items.length && <Card className="col-span-full p-12 text-center text-muted-foreground">暂无数据源，请先执行数据库迁移</Card>}</div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? '配置资讯数据源' : '新增资讯数据源'}</DialogTitle></DialogHeader><div className="grid gap-4 md:grid-cols-2">
      <Field label="数据源编码"><Input disabled={Boolean(editingId)} value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="例如 INDUSTRY_RSS" /></Field>
      <Field label="数据源名称"><Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="数据源类型"><select className="field" disabled={Boolean(editingId)} value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="GDELT">GDELT 开放资讯 API</option><option value="RSS">RSS / Atom 订阅</option></select></Field>
      <Field label="状态"><select className="field" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></Field>
      {form.type === 'GDELT' ? <><Field label="单一检索表达式" className="md:col-span-2"><Input value={form.query} onChange={event => setForm({ ...form, query: event.target.value })} placeholder="无轮换查询时使用" /></Field><Field label="轮换查询（每行一个，每次只执行一个）" className="md:col-span-2"><textarea className="field min-h-28 font-mono text-xs" value={form.queries} onChange={event => setForm({ ...form, queries: event.target.value })} placeholder={'fluorspar sourcelang:Chinese\n"hydrofluoric acid" sourcelang:Chinese'} /></Field><Field label="检索时间范围"><Input value={form.timespan} onChange={event => setForm({ ...form, timespan: event.target.value })} placeholder="3d" /></Field><Field label="每次最多条数"><Input type="number" min="1" max="100" value={form.maxRecords} onChange={event => setForm({ ...form, maxRecords: event.target.value })} /></Field><Field label="GDELT 传输方式"><select className="field" value={form.transport} onChange={event => setForm({ ...form, transport: event.target.value })}><option value="auto">HTTPS 优先，失败后兼容</option><option value="https">仅 HTTPS</option><option value="http">官方 HTTP（境内兼容）</option></select></Field></> : <Field label="RSS / Atom HTTPS 地址" className="md:col-span-2"><Input value={form.endpoint} onChange={event => setForm({ ...form, endpoint: event.target.value })} placeholder="https://example.com/feed.xml" /></Field>}
      <Field label="来源显示名称"><Input value={form.sourceName} onChange={event => setForm({ ...form, sourceName: event.target.value })} placeholder="留空则使用来源域名" /></Field>
      <Field label="运行计划"><Input value={form.schedule} onChange={event => setForm({ ...form, schedule: event.target.value })} placeholder="17 */2 * * *" /></Field>
      <Field label="行业关键词（逗号分隔）" className="md:col-span-2"><Input value={form.keywords} onChange={event => setForm({ ...form, keywords: event.target.value })} /></Field>
      <Field label="排除词（逗号分隔）" className="md:col-span-2"><Input value={form.excludeKeywords} onChange={event => setForm({ ...form, excludeKeywords: event.target.value })} placeholder="例如 摄像机，镜头，宝石" /></Field>
      <Field label="排除域名（逗号分隔）" className="md:col-span-2"><Input value={form.excludeDomains} onChange={event => setForm({ ...form, excludeDomains: event.target.value })} placeholder="例如 example.com" /></Field>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.enforceKeywords} onChange={event => setForm({ ...form, enforceKeywords: event.target.checked })} />标题或摘要必须命中行业关键词</label>
    </div><div className="rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">当前生意社萤石资讯源采集后自动发布。其他 RSS 域名仍需由运维加入服务端 <code>NEWS_SOURCE_ALLOWED_HOSTS</code> 白名单，防止数据源配置被用于访问内网。</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><div className="mb-1 text-sm font-medium">{label}</div>{children}</label>;
}
