'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { confirmAction } from '@/lib/system-dialog';

const MARKET_LABEL: Record<string, string> = { SH: '沪市', SZ: '深市', HK: '港股' };
const EMPTY = { market: 'SH', code: '', name: '', tag: '', sort: '0', status: 'ACTIVE' };

interface StockSymbol {
  id: string; market: string; code: string; name: string; tag: string | null; sort: number; status: string;
  latestQuote: { name: string; price: number; changeRate: number; floatMarketCap: number | null; currency: string; quoteTime: string; tradeDate: string } | null;
}

function marketCap(value: number | null, currency: string) {
  if (value === null) return '-';
  return `${(value / 1e8).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 亿${currency === 'HKD' ? '港元' : ''}`;
}

export function StockPanel() {
  const [list, setList] = useState<StockSymbol[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const load = useCallback(() => {
    api.get<StockSymbol[]>('/content/stocks').then(setList).catch((error: any) => alert(error.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    const nextSort = list.reduce((max, item) => Math.max(max, item.sort), 0) + 10;
    setEditingId(null); setForm({ ...EMPTY, sort: String(nextSort) }); setOpen(true);
  };
  const startEdit = (item: StockSymbol) => {
    setEditingId(item.id);
    setForm({ market: item.market, code: item.code, name: item.name, tag: item.tag || '', sort: String(item.sort), status: item.status });
    setOpen(true);
  };
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return alert('请填写证券代码和名称');
    const payload = { ...form, code: form.code.trim(), name: form.name.trim(), tag: form.tag.trim() || undefined, sort: Number(form.sort || 0) };
    try {
      if (editingId) await api.patch(`/content/stocks/${editingId}`, payload);
      else await api.post('/content/stocks', payload);
      setOpen(false); load();
    } catch (error: any) { alert(error.message); }
  };
  const remove = async (item: StockSymbol) => {
    if (!await confirmAction(`确定从成分股名单中删除“${item.name}”吗？已采集的历史行情会一并删除；只想暂停展示请改为停用。`)) return;
    try { await api.delete(`/content/stocks/${item.id}`); load(); } catch (error: any) { alert(error.message); }
  };

  const latest = list.reduce<string | null>((value, item) => item.latestQuote && (!value || item.latestQuote.quoteTime > value) ? item.latestQuote.quoteTime : value, null);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">名单供数字大屏和官网共用。行情由东方财富在交易日 11:35、15:10 自动采集，最近一次：{contentDate(latest)}；可在“采集与 AI”中手工触发。</p>
      <Button onClick={startCreate}><Plus className="mr-1 h-4 w-4" />新增成分股</Button>
    </div>
    <Card className="overflow-hidden">
      {!list.length ? <div className="p-12 text-center text-muted-foreground"><TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无成分股</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">排序</th><th className="p-3">名称 / 代码</th><th className="p-3">标签</th><th className="p-3 text-right">最新价</th><th className="p-3 text-right">涨跌幅</th><th className="p-3 text-right">流通市值</th><th className="p-3">数据时间</th><th className="p-3">状态</th><th className="p-3 text-right">操作</th></tr></thead>
        <tbody>{list.map((item) => {
          const quote = item.latestQuote;
          return <tr key={item.id} className="border-b">
            <td className="p-3 text-muted-foreground">{item.sort}</td>
            <td className="p-3"><div className="font-medium">{quote?.name || item.name}</div><div className="text-xs text-muted-foreground">{MARKET_LABEL[item.market] || item.market} · {item.code}</div></td>
            <td className="p-3">{item.tag || '-'}</td>
            <td className="p-3 text-right font-semibold">{quote ? `${quote.price.toFixed(2)}${quote.currency === 'HKD' ? ' 港元' : ''}` : '-'}</td>
            <td className={`p-3 text-right ${quote && quote.changeRate > 0 ? 'text-destructive' : quote && quote.changeRate < 0 ? 'text-success' : ''}`}>{quote ? `${quote.changeRate > 0 ? '+' : ''}${quote.changeRate.toFixed(2)}%` : '-'}</td>
            <td className="p-3 text-right">{quote ? marketCap(quote.floatMarketCap, quote.currency) : '-'}</td>
            <td className="p-3 text-xs">{quote ? contentDate(quote.quoteTime) : '尚未采集'}</td>
            <td className="p-3"><Badge variant={item.status === 'ACTIVE' ? 'default' : 'outline'}>{item.status === 'ACTIVE' ? '展示中' : '已停用'}</Badge></td>
            <td className="p-3 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => startEdit(item)} aria-label="编辑"><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => remove(item)} aria-label="删除"><Trash2 className="h-4 w-4" /></Button></div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editingId ? '编辑成分股' : '新增成分股'}</DialogTitle></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="市场"><select className="field" value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })}><option value="SH">沪市</option><option value="SZ">深市</option><option value="HK">港股</option></select></Field>
        <Field label="证券代码"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={form.market === 'HK' ? '例如：00189' : '例如：603505'} /></Field>
        <Field label="名称"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="展示时优先使用来源返回的最新简称" /></Field>
        <Field label="标签"><Input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="例如：核心萤石" /></Field>
        <Field label="排序（越小越靠前）"><Input type="number" min={0} value={form.sort} onChange={(event) => setForm({ ...form, sort: event.target.value })} /></Field>
        <Field label="状态"><select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">展示中</option><option value="INACTIVE">已停用</option></select></Field>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={save}>保存</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><div className="mb-1 text-sm font-medium">{label}</div>{children}</label>;
}
