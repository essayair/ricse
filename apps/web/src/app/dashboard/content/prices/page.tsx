'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const EMPTY = { productTypeId: '', businessDate: new Date().toISOString().slice(0, 10), region: '', marketName: '', spec: '', price: '', unit: '元/吨', changeAmount: '', source: 'MANUAL', remark: '' };
const SOURCE_LABEL: Record<string, string> = { MANUAL: '手工', BAIINFO: '百川', BUSINESS_ANALYTIQ: 'Business Analytiq', FLUORSPAR_COM: 'fluorspar.com', IMPORT: '导入' };

export default function PricesPage() {
  const [data, setData] = useState<any>({ list: [], total: 0 });
  const [types, setTypes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [productTypeId, setProductTypeId] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const loadTypes = () => api.get<any[]>('/content/product-types').then(setTypes).catch((error: any) => alert(error.message));
  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (search) params.set('search', search);
    if (productTypeId) params.set('productTypeId', productTypeId);
    api.get(`/content/prices?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [search, productTypeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { void loadTypes(); }, []);

  const createType = async () => {
    const name = window.prompt('请输入产品类型名称，例如：萤石粉');
    if (!name) return;
    const code = window.prompt('请输入唯一编码，例如：FLUORITE_97');
    if (!code) return;
    try { await api.post('/content/product-types', { name, code, unit: '元/吨' }); loadTypes(); } catch (error: any) { alert(error.message); }
  };
  const save = async () => {
    if (!form.productTypeId || !form.region || form.price === '') return alert('请填写产品、地区和价格');
    try {
      await api.post('/content/prices', { ...form, price: Number(form.price), changeAmount: form.changeAmount === '' ? undefined : Number(form.changeAmount) });
      setOpen(false); setForm(EMPTY); load();
    } catch (error: any) { alert(error.message); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">价格行情</h1><p className="mt-1 text-sm text-muted-foreground">统一维护手工、百川、fluorspar.com、Business Analytiq 和文件导入的价格数据</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={createType}>新增产品类型</Button><Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />新增价格</Button></div>
    </div>
    <div className="flex gap-3">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索市场、地区或产品" /></div>
      <select className="field w-auto min-w-44" value={productTypeId} onChange={(event) => setProductTypeId(event.target.value)}><option value="">全部产品</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name} {item.spec || ''}</option>)}</select>
    </div>
    <Card className="overflow-hidden">
      {!data.list.length ? <div className="p-12 text-center text-muted-foreground"><CircleDollarSign className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无价格记录</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">业务日期</th><th className="p-3">产品 / 规格</th><th className="p-3">地区 / 市场</th><th className="p-3 text-right">价格</th><th className="p-3 text-right">涨跌</th><th className="p-3">来源</th><th className="p-3">备注</th><th className="p-3">更新时间</th></tr></thead>
        <tbody>{data.list.map((item: any) => <tr key={item.id} className="border-b"><td className="p-3">{String(item.businessDate).slice(0, 10)}</td><td className="p-3"><div className="font-medium">{item.productType.name}</div><div className="text-xs text-muted-foreground">{item.spec || item.productType.spec || '-'}</div></td><td className="p-3">{item.region}<div className="text-xs text-muted-foreground">{item.marketName || '-'}</div></td><td className="p-3 text-right font-semibold">{Number(item.price).toLocaleString('zh-CN')} {item.unit}</td><td className={`p-3 text-right ${Number(item.changeAmount) > 0 ? 'text-red-600' : Number(item.changeAmount) < 0 ? 'text-emerald-600' : ''}`}>{Number(item.changeAmount || 0) > 0 ? '+' : ''}{Number(item.changeAmount || 0)}</td><td className="p-3"><Badge variant="outline">{SOURCE_LABEL[item.source] || item.source}</Badge></td><td className="max-w-52 p-3 text-xs">{item.remark || '-'}</td><td className="p-3 text-xs">{contentDate(item.updatedAt)}</td></tr>)}</tbody>
      </table></div>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>新增价格记录</DialogTitle></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="产品类型"><select className="field" value={form.productTypeId} onChange={(event) => setForm({ ...form, productTypeId: event.target.value })}><option value="">请选择</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name} {item.spec || ''}</option>)}</select></Field>
        <Field label="业务日期"><Input type="date" value={form.businessDate} onChange={(event) => setForm({ ...form, businessDate: event.target.value })} /></Field>
        <Field label="地区"><Input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
        <Field label="市场名称"><Input value={form.marketName} onChange={(event) => setForm({ ...form, marketName: event.target.value })} /></Field>
        <Field label="规格"><Input value={form.spec} onChange={(event) => setForm({ ...form, spec: event.target.value })} /></Field>
        <Field label="价格"><Input type="number" step="0.0001" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
        <Field label="涨跌"><Input type="number" step="0.0001" value={form.changeAmount} onChange={(event) => setForm({ ...form, changeAmount: event.target.value })} /></Field>
        <Field label="单位"><Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field>
        <Field label="备注" className="md:col-span-2"><textarea className="field min-h-20" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={save}>保存</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><div className="mb-1 text-sm font-medium">{label}</div>{children}</label>;
}
