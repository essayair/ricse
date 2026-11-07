'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { promptAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusText } from '@/components/status-text';
import { InvoiceAllocateDialog } from './invoice-allocate-dialog';
import { ALLOCATION_TONE, AllocationRow, AllocationState, InvoiceDirection, InvoiceSourceType, Named, SOURCE_LABEL, day, money, qty, targetHref, useInvoicePermission } from './invoice-shared';

interface InvoiceDetail {
  id: string; sourceType: InvoiceSourceType; direction: InvoiceDirection; invoiceNo: string; invoiceCode?: string | null; issuedAt: string;
  materialName: string; quantity?: string | null; unitPrice?: string | null; taxRate?: string | null; taxAmount?: string | null; taxInclusiveAmount: string;
  status: 'ACTIVE' | 'VOIDED'; remarks?: string | null; voidReason?: string | null; voidedAt?: string | null;
  seller: Named; buyer: Named; contract: { id: string; contractNo: string; title: string } | null; businessUnit: Named; creator: { name: string };
  allocatedAmount: string; remainingAmount: string; allocationState: AllocationState; allocationStateLabel: string;
  allocations: AllocationRow[];
}

/** 发票详情：分摊记录、继续分摊、撤销分摊和作废。 */
export function InvoiceDetailDialog({ invoiceId, onOpenChange, onChanged }: { invoiceId: string | null; onOpenChange: (open: boolean) => void; onChanged: () => void | Promise<void> }) {
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const { canCreate, canReverse } = useInvoicePermission();

  const load = useCallback(async () => {
    if (!invoiceId) return;
    try { setData(await api.get<InvoiceDetail>(`/invoices/${invoiceId}`)); }
    catch (error: any) { alert(error.message || '发票加载失败'); onOpenChange(false); }
  }, [invoiceId, onOpenChange]);
  useEffect(() => { setData(null); void load(); }, [load]);
  const refresh = async () => { await load(); await onChanged(); };

  const reverse = async (row: AllocationRow) => {
    const reason = await promptAction(`撤销发票 ${row.invoice.invoiceNo} 分摊到 ${(row.settlement || row.logisticsSettlement)?.settlementNo} 的 ${money(row.amount)}，请填写原因`);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/invoices/allocations/${row.id}/reverse`, { reason: reason.trim() }); await refresh(); }
    catch (error: any) { alert(error.message || '撤销分摊失败'); }
    finally { setBusy(false); }
  };
  const voidInvoice = async () => {
    if (!data) return;
    const reason = await promptAction(`作废发票 ${data.invoiceNo}，请填写原因`);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/invoices/${data.id}/void`, { reason: reason.trim() }); await refresh(); }
    catch (error: any) { alert(error.message || '发票作废失败'); }
    finally { setBusy(false); }
  };

  const active = data?.allocations.filter(row => !row.reversedAt) || [];
  const history = data?.allocations.filter(row => row.reversedAt) || [];
  const editable = data?.status === 'ACTIVE';
  return <>
    <Dialog open={Boolean(invoiceId)} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
      {!data ? <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p> : <>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{data.invoiceNo}</span><StatusText status={data.status === 'VOIDED' ? 'VOIDED' : ALLOCATION_TONE[data.allocationState]}>{data.allocationStateLabel}</StatusText></DialogTitle>
          <DialogDescription>{data.direction === 'INPUT' ? '进项' : '销项'} · {SOURCE_LABEL[data.sourceType]}发票 · 开票日期 {day(data.issuedAt)}{data.invoiceCode ? ` · 代码 ${data.invoiceCode}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3">
            <Amount label="发票含税金额" value={money(data.taxInclusiveAmount)} />
            <Amount label="已分摊" value={money(data.allocatedAmount)} />
            <Amount label="待分摊" value={money(data.remainingAmount)} warn={editable && Number(data.remainingAmount) > 0} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <Info label="开票方" value={data.seller?.name} /><Info label="收票方" value={data.buyer?.name} />
            <Info label={data.sourceType === 'GOODS' ? '归属合同' : '事业部'} value={data.sourceType === 'GOODS' ? (data.contract ? `${data.contract.contractNo} · ${data.contract.title}` : '—') : data.businessUnit?.name} />
            <Info label="品名规格" value={data.materialName} />
            <Info label="数量 / 税率 / 税额" value={`${qty(data.quantity)} / ${data.taxRate != null ? `${Number(data.taxRate)}%` : '—'} / ${money(data.taxAmount)}`} />
            <Info label="登记人" value={data.creator.name} />
            {data.remarks && <Info label="备注" value={data.remarks} />}
            {data.status === 'VOIDED' && <Info label="作废原因" value={`${data.voidReason || '—'}（${day(data.voidedAt)}）`} />}
          </dl>
          <div>
            <h3 className="mb-2 font-medium">分摊记录</h3>
            {!active.length ? <p className="rounded-md border p-4 text-center text-xs text-muted-foreground">尚未分摊到结算单</p> : <div className="divide-y rounded-md border">{active.map(row => {
              const target = row.settlement ? { kind: 'SETTLEMENT' as const, id: row.settlement.id, no: row.settlement.settlementNo } : { kind: 'LOGISTICS_SETTLEMENT' as const, id: row.logisticsSettlement!.id, no: row.logisticsSettlement!.settlementNo };
              return <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0"><Link href={targetHref(target, data.direction)} className="font-mono text-sm text-primary hover:underline">{target.no}</Link><div className="text-xs text-muted-foreground">{row.settlement?.contract?.contractNo || '运费结算'} · {row.creator.name} {day(row.createdAt)}{row.quantity ? ` · ${qty(row.quantity)} 吨` : ''}</div></div>
                <div className="flex items-center gap-2"><span className="font-medium tabular-nums">{money(row.amount)}</span>{canReverse(data.sourceType) && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void reverse(row)}>撤销分摊</Button>}</div>
              </div>;
            })}</div>}
            {history.length > 0 && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">已撤销 {history.length} 条</summary><ul className="mt-1 space-y-1">{history.map(row => <li key={row.id}>{(row.settlement || row.logisticsSettlement)?.settlementNo} · {money(row.amount)} · {row.reverser?.name || '—'} {day(row.reversedAt)} 撤销：{row.reversalReason}</li>)}</ul></details>}
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2 pt-4">
          {editable && canReverse(data.sourceType) && <Button variant="outline" className="sm:mr-auto" disabled={busy || active.length > 0} title={active.length ? '请先撤销全部分摊' : undefined} onClick={() => void voidInvoice()}>作废发票</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          {editable && canCreate(data.sourceType) && Number(data.remainingAmount) > 0 && <Button disabled={busy} onClick={() => setAllocating(true)}>分摊到结算单</Button>}
        </DialogFooter>
      </>}
    </DialogContent></Dialog>
    <InvoiceAllocateDialog open={allocating} onOpenChange={setAllocating}
      source={data ? { kind: 'invoice', invoiceId: data.id, invoiceNo: data.invoiceNo, remainingAmount: data.remainingAmount, freight: data.sourceType === 'FREIGHT' } : null}
      onSaved={refresh} />
  </>;
}

function Amount({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{label}</div><div className={`break-all text-sm font-semibold tabular-nums sm:text-base ${warn ? 'text-warning' : ''}`}>{value}</div></div>;
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="truncate" title={value || undefined}>{value || '—'}</dd></div>;
}
