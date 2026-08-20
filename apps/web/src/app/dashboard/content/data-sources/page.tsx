'use client';

import { useEffect, useState } from 'react';
import { Database, FileUp, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function DataSourcesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [uploadingId, setUploadingId] = useState('');
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
    const form = new FormData(); form.append('file', file); setUploadingId(item.id);
    try {
      await api.upload(`/content/data-sources/${item.id}/import`, form);
      alert('文件已进入异步导入队列，可在“采集与 AI”查看结果'); load();
    } catch (error: any) { alert(error.message); } finally { setUploadingId(''); }
  };

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">数据源管理</h1><p className="mt-1 text-sm text-muted-foreground">统一管理旧官网、百川行情及人工 Excel 数据源</p></div>
    <div className="grid gap-4 lg:grid-cols-2">{items.map(item => <Card key={item.id} className="p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Database className="h-5 w-5" /></div><div><div className="font-semibold">{item.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.code} · {item.type}</div></div></div><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{item.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-muted-foreground">执行计划</div><div className="mt-1 font-mono">{item.schedule || '手工触发'}</div></div><div><div className="text-xs text-muted-foreground">最近成功</div><div className="mt-1">{contentDate(item.lastSuccessAt)}</div></div><div className="col-span-2"><div className="text-xs text-muted-foreground">最近异常</div><div className={`mt-1 ${item.lastError ? 'text-destructive' : ''}`}>{item.lastError || '无'}</div></div></div>
      <div className="mt-4 flex justify-end gap-2">{['FILE', 'EXCEL'].includes(item.type) && <label><input className="hidden" type="file" accept=".xls,.xlsx,.csv" disabled={uploadingId === item.id} onChange={event => { void upload(item, event.target.files?.[0]); event.currentTarget.value = ''; }} /><span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-muted"><FileUp className="mr-1 h-4 w-4" />{uploadingId === item.id ? '上传中…' : '上传行情表'}</span></label>}<Button size="sm" variant="outline" onClick={() => toggle(item)}><Power className="mr-1 h-4 w-4" />{item.status === 'ACTIVE' ? '停用' : '启用'}</Button></div>
    </Card>)}{!items.length && <Card className="col-span-full p-12 text-center text-muted-foreground">暂无数据源，请先执行数据库迁移</Card>}</div>
  </div>;
}
