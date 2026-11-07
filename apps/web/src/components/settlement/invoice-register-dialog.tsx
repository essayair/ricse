'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EMPTY = { invoiceNo: '', invoiceCode: '', issuedAt: '', materialName: '', quantity: '', unitPrice: '', taxRate: '', taxAmount: '', taxInclusiveAmount: '', remarks: '' };

/**
 * 发票登记弹窗：结算单详情、物流结算单详情和发票台账共用。
 * `basePath` 为结算依据地址，如 `/financial-settlements/{id}` 或 `/logistics-settlements/{id}`。
 */
export function InvoiceRegisterDialog({ open, onOpenChange, basePath, kindLabel, sourceLabel, defaults, quantityLabel = '数量（吨）', onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath: string;
  /** 进项 / 销项 */
  kindLabel: string;
  /** 弹窗说明中展示的结算依据，如“采购结算单 YF2026…” */
  sourceLabel?: string;
  defaults?: { materialName?: string; taxRate?: string };
  quantityLabel?: string;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ ...EMPTY, materialName: defaults?.materialName || '', taxRate: defaults?.taxRate || '' });
  }, [open, defaults?.materialName, defaults?.taxRate]);
  const set = (key: keyof typeof EMPTY, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.invoiceNo.trim() || !form.issuedAt || !form.materialName.trim() || !(Number(form.taxInclusiveAmount) > 0)) {
      alert('请填写发票号码、开票日期、品名规格和含税金额'); return;
    }
    setBusy(true);
    try {
      await api.post(`${basePath}/invoices`, {
        invoiceNo: form.invoiceNo.trim(), invoiceCode: form.invoiceCode.trim() || undefined,
        issuedAt: `${form.issuedAt}T00:00:00.000+08:00`, materialName: form.materialName.trim(),
        quantity: form.quantity ? Number(form.quantity) : undefined, unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined,
        taxRate: form.taxRate ? Number(form.taxRate) : undefined, taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
        taxInclusiveAmount: Number(form.taxInclusiveAmount), remarks: form.remarks.trim() || undefined,
      });
      onOpenChange(false);
      await onSaved();
    } catch (error: any) { alert(error.message || '发票登记失败'); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
    <DialogHeader><DialogTitle>登记{kindLabel}发票</DialogTitle><DialogDescription>{sourceLabel ? `${sourceLabel} · ` : ''}按实际发票填写，系统只作结算差异提示。</DialogDescription></DialogHeader>
    <div className="grid grid-cols-2 gap-3">
      <Field label="发票号码 *"><Input value={form.invoiceNo} onChange={event => set('invoiceNo', event.target.value)} /></Field>
      <Field label="发票代码"><Input value={form.invoiceCode} onChange={event => set('invoiceCode', event.target.value)} /></Field>
      <Field label="开票日期 *"><Input type="date" value={form.issuedAt} onChange={event => set('issuedAt', event.target.value)} /></Field>
      <Field label="品名规格 *" wide><Input value={form.materialName} onChange={event => set('materialName', event.target.value)} /></Field>
      <Field label={quantityLabel}><Input type="number" inputMode="decimal" min="0" step="0.001" value={form.quantity} onChange={event => set('quantity', event.target.value)} /></Field>
      <Field label="含税单价"><Input type="number" inputMode="decimal" min="0" step="0.0001" value={form.unitPrice} onChange={event => set('unitPrice', event.target.value)} /></Field>
      <Field label="税率（%）"><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.taxRate} onChange={event => set('taxRate', event.target.value)} /></Field>
      <Field label="税额"><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.taxAmount} onChange={event => set('taxAmount', event.target.value)} /></Field>
      <Field label="含税金额 *"><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={form.taxInclusiveAmount} onChange={event => set('taxInclusiveAmount', event.target.value)} /></Field>
      <Field label="备注" wide><Input value={form.remarks} onChange={event => set('remarks', event.target.value)} /></Field>
    </div>
    <DialogFooter className="sticky -bottom-4 -mx-4 mt-2 gap-2 border-t bg-background px-4 py-3 sm:static sm:mx-0 sm:mt-0 sm:border-0 sm:px-0 sm:pb-0 sm:pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? '保存中…' : '保存发票'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

/** 手机端两列紧凑排布；品名、备注等长文本在手机端占满一行。 */
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block min-w-0 space-y-1 text-sm ${wide ? 'col-span-2 sm:col-span-1' : ''}`}><span className="font-medium">{label}</span>{children}</label>;
}
