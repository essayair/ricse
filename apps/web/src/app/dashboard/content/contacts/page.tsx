'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { CONTACT_STATUS, contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function ContactsPage() {
  const [data, setData] = useState<any>({ list: [], total: 0 }); const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const load = useCallback(() => { const p = new URLSearchParams({ pageSize: '100' }); if (search) p.set('search', search); if (status) p.set('status', status); api.get(`/content/contacts?${p}`).then(setData).catch((e: any) => alert(e.message)); }, [search, status]);
  useEffect(() => { load(); }, [load]);
  const update = async (item: any, next: string) => { const note = window.prompt('填写本次跟进备注（可不填）', item.followUpNote || '') ?? undefined; try { await api.patch(`/content/contacts/${item.id}`, { status: next, followUpNote: note }); load(); } catch (e: any) { alert(e.message); } };
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">官网咨询</h1><p className="mt-1 text-sm text-muted-foreground">跟进官网合作咨询、联系请求和业务线索</p></div><div className="flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名、电话、企业或留言" /></div><select className="field w-auto" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(CONTACT_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div><Card className="overflow-hidden">{!data.list.length ? <div className="p-12 text-center text-muted-foreground"><MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无官网咨询</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">联系人</th><th className="p-3">企业 / 邮箱</th><th className="p-3">留言</th><th className="p-3">来源页面</th><th className="p-3">提交时间</th><th className="p-3">状态</th><th className="p-3">跟进备注</th><th className="p-3">操作</th></tr></thead><tbody>{data.list.map((item: any) => <tr key={item.id} className="border-b align-top"><td className="p-3"><div className="font-medium">{item.name}</div><div className="mt-1 font-mono text-xs">{item.phone}</div></td><td className="p-3">{item.company || '-'}<div className="mt-1 text-xs text-muted-foreground">{item.email || '-'}</div></td><td className="max-w-80 p-3">{item.message}</td><td className="max-w-48 truncate p-3 text-xs">{item.sourcePage || '-'}</td><td className="p-3 text-xs">{contentDate(item.createdAt)}</td><td className="p-3"><Badge variant={item.status === 'COMPLETED' ? 'default' : item.status === 'INVALID' ? 'destructive' : 'secondary'}>{CONTACT_STATUS[item.status] || item.status}</Badge></td><td className="max-w-64 p-3 text-xs">{item.followUpNote || '-'}</td><td className="p-3"><select className="field h-8 w-28 py-1" value={item.status} onChange={e => update(item, e.target.value)}>{Object.entries(CONTACT_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></td></tr>)}</tbody></table></div>}</Card></div>;
}
