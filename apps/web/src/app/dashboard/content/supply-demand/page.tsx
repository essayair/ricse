'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Search, ShoppingCart, X } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate, SUPPLY_STATUS } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const EMPTY = { type: 'SUPPLY', productName: '', spec: '', quantity: '', priceText: '', region: '', description: '', contactName: '', contactPhone: '', company: '', status: 'PUBLISHED' };

export default function SupplyDemandPage() {
  const [data, setData] = useState<any>({ list: [], total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search); if (status) params.set('status', status); if (type) params.set('type', type);
    api.get(`/content/supply-demand?${params}`).then(setData).catch((e: any) => alert(e.message));
  }, [search, status, type]);
  useEffect(() => { load(); }, [load]);

  const review = async (id: string, next: string) => {
    const reason = next === 'REJECTED' ? window.prompt('请输入驳回原因') : undefined;
    if (next === 'REJECTED' && !reason) return;
    try { await api.patch(`/content/supply-demand/${id}/review`, { status: next, reason }); load(); } catch (e: any) { alert(e.message); }
  };
  const save = async () => {
    if (!form.productName || !form.contactName || !form.contactPhone) return alert('请填写商品、联系人和联系电话');
    try { await api.post('/content/supply-demand', form); setOpen(false); setForm(EMPTY); load(); } catch (e: any) { alert(e.message); }
  };
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">供需信息</h1><p className="mt-1 text-sm text-muted-foreground">审核小程序用户提交的供应与采购需求，并支持平台代发</p></div><Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />平台代发</Button></div>
    <div className="flex flex-wrap gap-3"><div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索商品、企业或描述" /></div><select className="field w-auto" value={type} onChange={e => setType(e.target.value)}><option value="">全部类型</option><option value="SUPPLY">供应信息</option><option value="DEMAND">采购需求</option></select><select className="field w-auto" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(SUPPLY_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
    <Card className="overflow-hidden">{!data.list.length ? <div className="p-12 text-center text-muted-foreground"><ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无供需信息</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">类型 / 商品</th><th className="p-3">规格与数量</th><th className="p-3">价格 / 地区</th><th className="p-3">企业与联系人</th><th className="p-3">描述</th><th className="p-3">来源</th><th className="p-3">提交时间</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>{data.list.map((item: any) => <tr key={item.id} className="border-b align-top"><td className="p-3"><Badge variant="outline">{item.type === 'SUPPLY' ? '供应' : '采购'}</Badge><div className="mt-2 font-medium">{item.productName}</div></td><td className="p-3">{item.spec || '-'}<div className="mt-1 text-muted-foreground">{item.quantity || '-'}</div></td><td className="p-3">{item.priceText || '面议'}<div className="mt-1 text-muted-foreground">{item.region || '-'}</div></td><td className="p-3">{item.company || '-'}<div className="mt-1 text-xs">{item.contactName} · {item.contactPhone}</div></td><td className="max-w-64 p-3 text-xs text-muted-foreground">{item.description || '-'}</td><td className="p-3">{item.source === 'PLATFORM' ? '平台' : '用户'}</td><td className="p-3 text-xs">{contentDate(item.createdAt)}</td><td className="p-3"><Badge variant={item.status === 'PUBLISHED' ? 'default' : item.status === 'REJECTED' ? 'destructive' : 'secondary'}>{SUPPLY_STATUS[item.status] || item.status}</Badge>{item.rejectReason && <div className="mt-1 max-w-40 text-xs text-destructive">{item.rejectReason}</div>}</td><td className="p-3"><div className="flex gap-1">{item.status !== 'PUBLISHED' && <Button size="sm" variant="ghost" title="通过" onClick={() => review(item.id, 'PUBLISHED')}><Check className="h-4 w-4 text-emerald-600" /></Button>}{item.status === 'PENDING' && <Button size="sm" variant="ghost" title="驳回" onClick={() => review(item.id, 'REJECTED')}><X className="h-4 w-4 text-destructive" /></Button>}{item.status === 'PUBLISHED' && <Button size="sm" variant="ghost" onClick={() => review(item.id, 'OFFLINE')}>下架</Button>}</div></td></tr>)}</tbody></table></div>}</Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>平台代发供需信息</DialogTitle></DialogHeader><div className="grid gap-4 md:grid-cols-2"><Field label="类型"><select className="field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="SUPPLY">供应信息</option><option value="DEMAND">采购需求</option></select></Field><Field label="商品名称"><Input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} /></Field><Field label="规格"><Input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })} /></Field><Field label="数量"><Input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field><Field label="价格"><Input value={form.priceText} onChange={e => setForm({ ...form, priceText: e.target.value })} /></Field><Field label="地区"><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></Field><Field label="企业"><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></Field><Field label="联系人 / 电话"><div className="grid grid-cols-2 gap-2"><Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} /><Input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></div></Field><Field label="说明" className="md:col-span-2"><textarea className="field min-h-24" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field><Field label="保存状态"><select className="field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="PUBLISHED">直接发布</option><option value="PENDING">待审核</option></select></Field></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={save}>保存</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={className}><div className="mb-1 text-sm font-medium">{label}</div>{children}</label>; }
