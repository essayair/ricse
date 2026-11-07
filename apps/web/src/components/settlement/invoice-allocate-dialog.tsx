'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { day, money, total } from './invoice-shared';

/** 从发票出发分给多张结算单，或从结算单出发关联多张已登记发票。 */
export type AllocateSource =
  | { kind: 'invoice'; invoiceId: string; invoiceNo: string; remainingAmount: string; freight: boolean }
  | { kind: 'target'; settlementId?: string; logisticsSettlementId?: string; label: string; remainingAmount: string; freight: boolean };

interface Candidate {
  key: string; title: string; subtitle: string; meta: string; totalAmount: string; remainingAmount: string; sameContract: boolean;
  item: (amount: number, quantity?: number) => Record<string, unknown>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function InvoiceAllocateDialog({ open, onOpenChange, source, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; source: AllocateSource | null; onSaved: () => void | Promise<void>;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Record<string, { amount: string; quantity: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    setCandidates(null); setPicked({});
    const load = async () => {
      if (source.kind === 'invoice') {
        const rows = await api.get<any[]>(`/invoices/${source.invoiceId}/allocation-candidates`);
        setCandidates(rows.map(row => ({
          key: `${row.kind}:${row.id}`, title: row.no,
          subtitle: row.contract ? `${row.contract.contractNo} · ${row.contract.title}` : `运费结算 ${day(row.periodStart)} ～ ${day(row.periodEnd)}`,
          meta: `${row.kind === 'SETTLEMENT' ? '确认' : '复核'} ${day(row.confirmedAt)}`,
          totalAmount: row.settlementAmount, remainingAmount: row.remainingAmount, sameContract: row.sameContract,
          item: (amount, quantity) => ({ invoiceId: source.invoiceId, ...(row.kind === 'SETTLEMENT' ? { settlementId: row.id } : { logisticsSettlementId: row.id }), amount, quantity }),
        })));
      } else {
        const params = new URLSearchParams(source.settlementId ? { settlementId: source.settlementId } : { logisticsSettlementId: source.logisticsSettlementId! });
        const rows = await api.get<any[]>(`/invoices/candidates?${params}`);
        setCandidates(rows.map(row => ({
          key: row.id, title: row.invoiceNo,
          subtitle: `${day(row.issuedAt)} · ${row.materialName}`,
          meta: row.contract ? `归属合同 ${row.contract.contractNo}` : '运费发票',
          totalAmount: row.taxInclusiveAmount, remainingAmount: row.remainingAmount, sameContract: row.sameContract,
          item: (amount, quantity) => ({ invoiceId: row.id, ...(source.settlementId ? { settlementId: source.settlementId } : { logisticsSettlementId: source.logisticsSettlementId }), amount, quantity }),
        })));
      }
    };
    load().catch((error: any) => { alert(error.message || '候选加载失败'); setCandidates([]); });
  }, [open, source]);

  const pool = Number(source?.remainingAmount || 0);
  const selectedTotal = useMemo(() => total(Object.values(picked).map(value => value.amount)), [picked]);
  const left = round2(pool - selectedTotal);

  const toggle = (candidate: Candidate) => setPicked(current => {
    if (current[candidate.key]) { const next = { ...current }; delete next[candidate.key]; return next; }
    const used = total(Object.values(current).map(value => value.amount));
    const amount = Math.max(0, Math.min(Number(candidate.remainingAmount), round2(pool - used)));
    return { ...current, [candidate.key]: { amount: amount ? amount.toFixed(2) : '', quantity: '' } };
  });
  const change = (key: string, field: 'amount' | 'quantity', value: string) => setPicked(current => ({ ...current, [key]: { ...current[key], [field]: value } }));

  const submit = async () => {
    if (!candidates) return;
    const items = candidates.filter(candidate => picked[candidate.key]).map(candidate => {
      const value = picked[candidate.key];
      return candidate.item(Number(value.amount), value.quantity ? Number(value.quantity) : undefined);
    });
    if (!items.length) { alert('请至少选择一项并填写分摊金额'); return; }
    if (items.some(item => !(Number(item.amount) > 0))) { alert('分摊金额必须大于零'); return; }
    if (left < 0) { alert(source?.kind === 'invoice' ? '分摊合计超过发票可分摊余额' : '分摊合计超过本单未到票金额'); return; }
    const over = candidates.find(candidate => picked[candidate.key] && Number(picked[candidate.key].amount) > Number(candidate.remainingAmount));
    if (over) { alert(`${over.title} 本次金额超过其${source?.kind === 'invoice' ? '未到票金额' : '可分摊余额'}`); return; }
    setBusy(true);
    try { await api.post('/invoices/allocations', { items }); onOpenChange(false); await onSaved(); }
    catch (error: any) { alert(error.message || '分摊失败'); }
    finally { setBusy(false); }
  };

  const fromInvoice = source?.kind === 'invoice';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
    <DialogHeader>
      <DialogTitle>{fromInvoice ? `分摊发票 ${source.invoiceNo}` : '关联已登记发票'}</DialogTitle>
      <DialogDescription>{fromInvoice
        ? '选择同一开票方、收票方且已确认的结算单，填写每张分摊的含税金额；同合同的排在前面。'
        : `${source?.kind === 'target' ? source.label : ''}：选择同一开票方、收票方且仍有余额的发票，填写分摊到本单的金额。`}</DialogDescription>
    </DialogHeader>
    <div className="space-y-2">
      {candidates == null ? <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
        : !candidates.length ? <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">{fromInvoice ? '没有可分摊的结算单：需同一开票方、收票方，已确认且仍有未到票金额。' : '没有可关联的发票：需同一开票方、收票方，且仍有未分摊余额。可先登记发票。'}</p>
        : candidates.map(candidate => {
          const value = picked[candidate.key];
          return <div key={candidate.key} className={`rounded-md border p-3 ${value ? 'border-primary bg-primary/5' : ''}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={Boolean(value)} onChange={() => toggle(candidate)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-medium">{candidate.title}</span>{candidate.sameContract && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">同合同</span>}</div>
                <div className="truncate text-xs text-muted-foreground">{candidate.subtitle}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground"><span>{candidate.meta}</span><span>{fromInvoice ? '结算金额' : '发票金额'} {money(candidate.totalAmount)}</span><span className="font-medium text-foreground">{fromInvoice ? '未到票' : '可分摊'} {money(candidate.remainingAmount)}</span></div>
              </div>
            </label>
            {value && <div className="mt-3 grid grid-cols-2 gap-2 pl-7">
              <label className="space-y-1 text-xs"><span className="text-muted-foreground">分摊含税金额 *</span><Input type="number" inputMode="decimal" min="0.01" step="0.01" className="h-9" value={value.amount} onChange={event => change(candidate.key, 'amount', event.target.value)} /></label>
              {!source?.freight && <label className="space-y-1 text-xs"><span className="text-muted-foreground">分摊数量（吨，选填）</span><Input type="number" inputMode="decimal" min="0" step="0.001" className="h-9" value={value.quantity} onChange={event => change(candidate.key, 'quantity', event.target.value)} /></label>}
            </div>}
          </div>;
        })}
    </div>
    <DialogFooter className="sticky -bottom-4 -mx-4 mt-2 flex-wrap items-center gap-2 border-t bg-background px-4 py-3 sm:static sm:mx-0 sm:mt-0 sm:border-0 sm:px-0 sm:pb-0 sm:pt-4">
      <div className="mr-auto text-xs text-muted-foreground">{fromInvoice ? '发票可分摊' : '本单未到票'} {money(pool)} · 本次 {money(selectedTotal)} · <span className={left < 0 ? 'text-destructive' : ''}>剩余 {money(left)}</span></div>
      <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
      <Button disabled={busy || !candidates?.length} onClick={() => void submit()}>{busy ? '提交中…' : '确认分摊'}</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
}
