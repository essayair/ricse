'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { promptAction } from '@/lib/system-dialog';

interface InvoiceRecord {
  id: string; invoiceNo: string; invoiceCode?: string | null; issuedAt: string; materialName: string;
  quantity?: string | null; unitPrice?: string | null; taxRate?: string | null; taxAmount?: string | null;
  taxInclusiveAmount: string; status: string; creator: { name: string }; voidReason?: string | null;
}
interface InvoiceSummary {
  direction: 'INPUT' | 'OUTPUT'; settlementQuantity?: string | null; invoiceQuantity: string;
  quantityDifference?: string | null; settlementAmount: string; invoiceAmount: string;
  amountDifference: string; warnings: string[]; matched: boolean;
}
const initial = { invoiceNo: '', invoiceCode: '', issuedAt: '', materialName: '', quantity: '', unitPrice: '', taxRate: '', taxAmount: '', taxInclusiveAmount: '', remarks: '' };

export function SettlementInvoicePanel({ settlementId, status, canCreate, canVoid, materialName }: {
  settlementId: string; status: string; canCreate: boolean; canVoid: boolean; materialName?: string;
}) {
  const [data, setData] = useState<{ records: InvoiceRecord[]; summary: InvoiceSummary } | null>(null);
  const [form, setForm] = useState({ ...initial, materialName: materialName || '' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api.get(`/financial-settlements/${settlementId}/invoices`)); }
    catch (error: any) { alert(error.message || '发票记录加载失败'); }
  }, [settlementId]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    if (!form.invoiceNo.trim() || !form.issuedAt || !form.materialName.trim() || !(Number(form.taxInclusiveAmount) > 0)) {
      alert('请填写发票号码、开票日期、品名规格和含税金额'); return;
    }
    setBusy(true);
    try {
      await api.post(`/financial-settlements/${settlementId}/invoices`, {
        invoiceNo: form.invoiceNo.trim(), invoiceCode: form.invoiceCode.trim() || undefined,
        issuedAt: `${form.issuedAt}T00:00:00.000+08:00`, materialName: form.materialName.trim(),
        quantity: form.quantity ? Number(form.quantity) : undefined, unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined,
        taxRate: form.taxRate ? Number(form.taxRate) : undefined, taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        taxInclusiveAmount: Number(form.taxInclusiveAmount), remarks: form.remarks.trim() || undefined,
      });
      setOpen(false); setForm({ ...initial, materialName: materialName || '' }); await load();
    } catch (error: any) { alert(error.message || '发票登记失败'); }
    finally { setBusy(false); }
  };
  const voidRecord = async (record: InvoiceRecord) => {
    const reason = await promptAction(`请输入发票 ${record.invoiceNo} 的作废原因`);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/financial-settlements/${settlementId}/invoices/${record.id}/void`, { reason: reason.trim() }); await load(); }
    catch (error: any) { alert(error.message || '发票作废失败'); }
    finally { setBusy(false); }
  };
  const set = (key: keyof typeof initial, value: string) => setForm(current => ({ ...current, [key]: value }));
  const money = (value?: string | null) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">发票登记与结算核对</h2><p className="mt-1 text-xs text-muted-foreground">仅登记进销项发票并核对数量、含税金额；不自动生成会计凭证或税务申报数据。</p></div>{canCreate && ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(status) && <Button onClick={() => setOpen(true)}>登记{data?.summary.direction === 'OUTPUT' ? '销项' : '进项'}发票</Button>}</div>
    {data && <><div className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"><div>结算数量 / 发票数量：{data.summary.settlementQuantity ?? '—'} / {data.summary.invoiceQuantity} 吨</div><div>结算金额 / 发票含税金额：{money(data.summary.settlementAmount)} / {money(data.summary.invoiceAmount)}</div><div className={data.summary.matched ? 'text-success' : 'text-warning'}>{data.summary.matched ? '数量金额已匹配' : data.summary.warnings.join('；')}</div></div><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-3">发票号码 / 代码</th><th className="p-3">开票日期</th><th className="p-3">品名规格</th><th className="p-3 text-right">数量（吨）</th><th className="p-3 text-right">含税金额</th><th className="p-3">状态 / 经办人</th><th className="p-3">操作</th></tr></thead><tbody>{data.records.length ? data.records.map(record => <tr key={record.id} className="border-t"><td className="p-3">{record.invoiceNo}<div className="text-xs text-muted-foreground">{record.invoiceCode || '—'}</div></td><td className="p-3">{record.issuedAt.slice(0, 10)}</td><td className="p-3">{record.materialName}</td><td className="p-3 text-right">{record.quantity ?? '—'}</td><td className="p-3 text-right">{money(record.taxInclusiveAmount)}</td><td className="p-3">{record.status === 'VOIDED' ? `已作废：${record.voidReason || ''}` : '有效'}<div className="text-xs text-muted-foreground">{record.creator.name}</div></td><td className="p-3">{record.status === 'ACTIVE' && canVoid && <Button variant="outline" size="sm" disabled={busy} onClick={() => void voidRecord(record)}>作废</Button>}</td></tr>) : <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">暂无发票记录</td></tr>}</tbody></table></div></>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>登记发票</DialogTitle><DialogDescription>按实际发票填写，系统只作结算差异提示。</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Field label="发票号码 *"><Input value={form.invoiceNo} onChange={event => set('invoiceNo', event.target.value)} /></Field><Field label="发票代码"><Input value={form.invoiceCode} onChange={event => set('invoiceCode', event.target.value)} /></Field><Field label="开票日期 *"><Input type="date" value={form.issuedAt} onChange={event => set('issuedAt', event.target.value)} /></Field><Field label="品名规格 *"><Input value={form.materialName} onChange={event => set('materialName', event.target.value)} /></Field><Field label="数量（吨）"><Input type="number" min="0" step="0.001" value={form.quantity} onChange={event => set('quantity', event.target.value)} /></Field><Field label="含税单价"><Input type="number" min="0" step="0.0001" value={form.unitPrice} onChange={event => set('unitPrice', event.target.value)} /></Field><Field label="税率（%）"><Input type="number" min="0" step="0.01" value={form.taxRate} onChange={event => set('taxRate', event.target.value)} /></Field><Field label="税额"><Input type="number" min="0" step="0.01" value={form.taxAmount} onChange={event => set('taxAmount', event.target.value)} /></Field><Field label="含税金额 *"><Input type="number" min="0.01" step="0.01" value={form.taxInclusiveAmount} onChange={event => set('taxInclusiveAmount', event.target.value)} /></Field><Field label="备注"><Input value={form.remarks} onChange={event => set('remarks', event.target.value)} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void submit()}>保存发票</Button></DialogFooter></DialogContent></Dialog>
  </Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
