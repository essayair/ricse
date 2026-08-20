'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit3, ImageUp, Newspaper, Plus, Search, Send, Tags, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ARTICLE_STATUS, ARTICLE_TYPE, contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const EMPTY = {
  type: 'NEWS', title: '', categoryId: '', summary: '', content: '', coverUrl: '', source: '', author: '', tags: '',
  publishAt: '', productName: '', spec: '', quantity: '', priceText: '', region: '', deliveryMethod: '', requirements: '', company: '', contactName: '', contactPhone: '',
};

export default function ContentArticlesPage() {
  const [data, setData] = useState<any>({ list: [], total: 0 });
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ code: '', name: '' });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    api.get(`/content/articles?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [search, type, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<any[]>('/content/categories').then(setCategories).catch(() => setCategories([])); }, []);

  const beginCreate = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const beginEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      ...EMPTY, ...item, categoryId: item.categoryId || '', tags: (item.tags || []).join('，'),
      publishAt: item.publishAt ? new Date(item.publishAt).toISOString().slice(0, 16) : '',
    });
    setOpen(true);
  };
  const save = async () => {
    if (!form.title.trim()) return alert('请填写标题');
    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags.split(/[，,]/).map((item: string) => item.trim()).filter(Boolean),
      categoryId: form.categoryId || undefined,
      publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : undefined,
    };
    try {
      if (editingId) await api.patch(`/content/articles/${editingId}`, payload);
      else await api.post('/content/articles', payload);
      setOpen(false); load();
    } catch (error: any) { alert(error.message); } finally { setSaving(false); }
  };
  const changeStatus = async (item: any, next: string) => {
    if (!window.confirm(next === 'PUBLISHED' ? `确定发布“${item.title}”吗？` : `确定下线“${item.title}”吗？`)) return;
    try { await api.patch(`/content/articles/${item.id}/status`, { status: next }); load(); } catch (error: any) { alert(error.message); }
  };
  const remove = async (item: any) => {
    if (!window.confirm(`确定删除草稿“${item.title}”吗？`)) return;
    try { await api.delete(`/content/articles/${item.id}`); load(); } catch (error: any) { alert(error.message); }
  };
  const createCategory = async () => {
    if (!categoryForm.code.trim() || !categoryForm.name.trim()) return alert('请填写栏目编码和名称');
    try {
      const category = await api.post<any>('/content/categories', categoryForm);
      setCategories([...categories, category]); setCategoryOpen(false); setCategoryForm({ code: '', name: '' });
    } catch (error: any) { alert(error.message); }
  };
  const uploadCover = async (file?: File) => {
    if (!file || !editingId) return;
    const data = new FormData(); data.append('file', file); data.append('purpose', 'COVER'); setUploading(true);
    try {
      const result = await api.upload<any>(`/content/articles/${editingId}/assets`, data);
      setForm({ ...form, coverUrl: result.coverUrl });
    } catch (error: any) { alert(error.message); } finally { setUploading(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">资讯管理</h1><p className="mt-1 text-sm text-muted-foreground">统一维护官网和小程序的行业资讯、平台供应与采购需求内容</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setCategoryOpen(true)}><Tags className="mr-1 h-4 w-4" />栏目管理</Button><Button onClick={beginCreate}><Plus className="mr-1 h-4 w-4" />新建内容</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><div className="text-xs text-muted-foreground">内容总数</div><div className="mt-1 text-2xl font-bold">{data.total || 0}</div></Card>
      <Card className="p-4"><div className="text-xs text-muted-foreground">当前已发布</div><div className="mt-1 text-2xl font-bold text-emerald-600">{data.list.filter((item: any) => item.status === 'PUBLISHED').length}</div></Card>
      <Card className="p-4"><div className="text-xs text-muted-foreground">草稿与下线</div><div className="mt-1 text-2xl font-bold text-amber-600">{data.list.filter((item: any) => item.status !== 'PUBLISHED').length}</div></Card>
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索标题、摘要、商品或企业" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Select value={type} onChange={setType} options={ARTICLE_TYPE} all="全部类型" />
      <Select value={status} onChange={setStatus} options={ARTICLE_STATUS} all="全部状态" />
    </div>
    <Card className="overflow-hidden">
      {!data.list.length ? <Empty icon={<Newspaper className="h-8 w-8" />} text="暂无内容" /> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">标题 / 摘要</th><th className="p-3">类型</th><th className="p-3">栏目</th><th className="p-3">来源 / 作者</th><th className="p-3">发布时间</th><th className="p-3">状态</th><th className="p-3 text-right">浏览 / 点赞</th><th className="p-3">操作</th></tr></thead>
        <tbody>{data.list.map((item: any) => <tr key={item.id} className="border-b align-top hover:bg-muted/30">
          <td className="max-w-[420px] p-3"><div className="font-medium">{item.title}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary || '暂无摘要'}</div>{item.productName && <div className="mt-1 text-xs text-primary">{item.productName} · {item.spec || '未填写规格'} · {item.region || '未填写地区'}</div>}</td>
          <td className="p-3"><Badge variant="outline">{ARTICLE_TYPE[item.type] || item.type}</Badge></td><td className="p-3">{item.category?.name || '-'}</td>
          <td className="p-3"><div>{item.source || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.author || '-'}</div></td><td className="p-3 text-xs">{contentDate(item.publishAt)}</td>
          <td className="p-3"><Badge variant={item.status === 'PUBLISHED' ? 'default' : item.status === 'OFFLINE' ? 'destructive' : 'secondary'}>{ARTICLE_STATUS[item.status] || item.status}</Badge></td>
          <td className="p-3 text-right">{item.viewCount} / {item.likeCount}</td><td className="p-3"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => beginEdit(item)}><Edit3 className="h-4 w-4" /></Button>{item.status !== 'PUBLISHED' ? <Button size="sm" variant="ghost" title="发布" onClick={() => changeStatus(item, 'PUBLISHED')}><Send className="h-4 w-4" /></Button> : <Button size="sm" variant="ghost" onClick={() => changeStatus(item, 'OFFLINE')}>下线</Button>}{item.status === 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => remove(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? '编辑内容' : '新建内容'}</DialogTitle></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="内容类型"><Select value={form.type} onChange={value => setForm({ ...form, type: value })} options={ARTICLE_TYPE} /></Field>
        <Field label="所属栏目"><select className="field" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">未分类</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="标题" className="md:col-span-2"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="摘要" className="md:col-span-2"><textarea className="field min-h-20" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} /></Field>
        <Field label="正文" className="md:col-span-2"><textarea className="field min-h-56 font-mono text-xs" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="支持 HTML 或 Markdown，迁移完成后接入富文本编辑器" /></Field>
        <Field label="封面图片"><div className="flex gap-2"><Input value={form.coverUrl} onChange={e => setForm({ ...form, coverUrl: e.target.value })} placeholder="可填写 URL，保存草稿后也可上传" />{editingId && <label><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={e => { void uploadCover(e.target.files?.[0]); e.currentTarget.value = ''; }} /><span className="inline-flex h-10 cursor-pointer items-center whitespace-nowrap rounded-md border px-3 text-sm"><ImageUp className="mr-1 h-4 w-4" />{uploading ? '上传中…' : '上传'}</span></label>}</div></Field>
        <Field label="标签（逗号分隔）"><Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></Field>
        <Field label="来源"><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></Field><Field label="作者"><Input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} /></Field>
        <Field label="计划发布时间"><Input type="datetime-local" value={form.publishAt} onChange={e => setForm({ ...form, publishAt: e.target.value })} /></Field>
        {form.type !== 'NEWS' && <><Field label="商品名称"><Input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} /></Field><Field label="规格"><Input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} /></Field><Field label="数量"><Input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field><Field label="价格"><Input value={form.priceText} onChange={e => setForm({ ...form, priceText: e.target.value })} /></Field><Field label="地区"><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></Field><Field label="交货方式"><Input value={form.deliveryMethod} onChange={e => setForm({ ...form, deliveryMethod: e.target.value })} /></Field><Field label="企业"><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></Field><Field label="联系人 / 电话"><div className="grid grid-cols-2 gap-2"><Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /><Input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></div></Field><Field label="其他要求" className="md:col-span-2"><textarea className="field min-h-20" value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} /></Field></>}
      </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={saving} onClick={save}>{saving ? '保存中…' : '保存草稿'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>新增资讯栏目</DialogTitle></DialogHeader><div className="space-y-4"><Field label="栏目编码"><Input value={categoryForm.code} onChange={e => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })} placeholder="例如 INDUSTRY_NEWS" /></Field><Field label="栏目名称"><Input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="例如 行业动态" /></Field><div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">已有栏目：{categories.map(item => item.name).join('、') || '暂无'}</div></div><DialogFooter><Button variant="outline" onClick={() => setCategoryOpen(false)}>取消</Button><Button onClick={createCategory}>保存栏目</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={className}><div className="mb-1 text-sm font-medium">{label}</div>{children}</label>; }
function Select({ value, onChange, options, all }: { value: string; onChange: (value: string) => void; options: Record<string, string>; all?: string }) { return <select className="field min-w-36" value={value} onChange={e => onChange(e.target.value)}>{all && <option value="">{all}</option>}{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="p-12 text-center text-muted-foreground"><div className="mx-auto mb-2 flex justify-center opacity-40">{icon}</div>{text}</div>; }
