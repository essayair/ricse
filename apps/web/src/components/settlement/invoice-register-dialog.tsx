'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, InvoiceDirection, InvoiceSourceType, Named, money } from './invoice-shared';

const EMPTY = { invoiceNo: '', invoiceCode: '', issuedAt: '', materialName: '', quantity: '', unitPrice: '', taxRate: '', taxAmount: '', taxInclusiveAmount: '', remarks: '', allocationAmount: '', allocationQuantity: '' };
const FREIGHT_DEFAULTS = { materialName: '运输服务*运输费', taxRate: '9' };

interface ContractOption { id: string; contractNo: string; title: string; seller: Named; buyer: Named; businessUnit: Named }
interface Options { contracts: ContractOption[]; carriers: Array<{ id: string; name: string }>; payers: Array<{ id: string; name: string }>; businessUnits: Array<{ id: string; name: string }> }

export type InvoiceRegisterMode =
  /** 在结算单（物流结算单）上登记，同时分摊到本单。 */
  | { kind: 'settlement'; basePath: string; sourceType: InvoiceSourceType; direction: InvoiceDirection; sourceLabel: string; remainingAmount?: string | null }
  /** 先登记、暂不对应结算单。 */
  | { kind: 'standalone'; direction: InvoiceDirection };

/** 发票登记弹窗：结算单详情、物流结算单详情和发票台账共用。 */
export function InvoiceRegisterDialog({ open, onOpenChange, mode, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: InvoiceRegisterMode | null;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [sourceType, setSourceType] = useState<InvoiceSourceType>('GOODS');
  const [contractId, setContractId] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [freight, setFreight] = useState({ carrierPartnerId: '', payerPartnerId: '', businessUnitId: '' });
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const standalone = mode?.kind === 'standalone';
  const direction = mode?.direction || 'INPUT';
  const kindLabel = direction === 'OUTPUT' ? '销项' : '进项';
  const effectiveSource: InvoiceSourceType = mode?.kind === 'settlement' ? mode.sourceType : sourceType;

  useEffect(() => {
    if (!open || !mode) return;
    const source = mode.kind === 'settlement' ? mode.sourceType : 'GOODS';
    setSourceType(source);
    setForm({ ...EMPTY, ...(source === 'FREIGHT' ? FREIGHT_DEFAULTS : {}) });
    setContractId(''); setContractFilter(''); setFreight({ carrierPartnerId: '', payerPartnerId: '', businessUnitId: '' });
    if (mode.kind === 'standalone') {
      setOptions(null);
      api.get<Options>(`/invoices/options?direction=${mode.direction}`).then(setOptions).catch((error: any) => alert(error.message || '登记选项加载失败'));
    }
  }, [open, mode]);

  const changeSource = (value: InvoiceSourceType) => {
    setSourceType(value);
    setForm(current => ({ ...current, ...(value === 'FREIGHT' ? FREIGHT_DEFAULTS : { materialName: '', taxRate: '' }) }));
  };
  const set = (key: keyof typeof EMPTY, value: string) => setForm(current => ({ ...current, [key]: value }));
  const contracts = useMemo(() => {
    const keyword = contractFilter.trim().toLowerCase();
    return (options?.contracts || []).filter(item => !keyword || `${item.contractNo} ${item.title} ${item.seller?.name || ''} ${item.buyer?.name || ''}`.toLowerCase().includes(keyword));
  }, [contractFilter, options]);
  const contract = options?.contracts.find(item => item.id === contractId);

  const submit = async () => {
    if (!mode) return;
    if (!form.invoiceNo.trim() || !form.issuedAt || !form.materialName.trim() || !(Number(form.taxInclusiveAmount) > 0)) { alert('请填写发票号码、开票日期、品名规格和含税金额'); return; }
    if (standalone && effectiveSource === 'GOODS' && !contractId) { alert('请选择发票所属合同'); return; }
    if (standalone && effectiveSource === 'FREIGHT' && (!freight.carrierPartnerId || !freight.payerPartnerId || !freight.businessUnitId)) { alert('请选择承运方、付款主体和事业部'); return; }
    const num = (value: string) => value ? Number(value) : undefined;
    const ticket = {
      invoiceNo: form.invoiceNo.trim(), invoiceCode: form.invoiceCode.trim() || undefined,
      issuedAt: `${form.issuedAt}T00:00:00.000+08:00`, materialName: form.materialName.trim(),
      quantity: num(form.quantity), unitPrice: num(form.unitPrice), taxRate: num(form.taxRate), taxAmount: num(form.taxAmount),
      taxInclusiveAmount: Number(form.taxInclusiveAmount), remarks: form.remarks.trim() || undefined,
    };
    setBusy(true);
    try {
      if (mode.kind === 'settlement') await api.post(`${mode.basePath}/invoices`, { ...ticket, allocationAmount: num(form.allocationAmount), allocationQuantity: num(form.allocationQuantity) });
      else await api.post('/invoices', { ...ticket, direction: mode.direction, sourceType: effectiveSource, ...(effectiveSource === 'GOODS' ? { contractId } : freight) });
      onOpenChange(false);
      await onSaved();
    } catch (error: any) { alert(error.message || '发票登记失败'); }
    finally { setBusy(false); }
  };

  const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
    <DialogHeader>
      <DialogTitle>登记{kindLabel}发票</DialogTitle>
      <DialogDescription>{mode?.kind === 'settlement'
        ? `${mode.sourceLabel} · 登记后分摊到本单${mode.remainingAmount != null ? `，本单未到票 ${money(mode.remainingAmount)}` : ''}。`
        : '票先到时先登记，结算单确认后再分摊；一张发票可分摊到多张结算单。'}</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-2 gap-3">
      {standalone && <>
        {direction === 'INPUT' && <Field label="发票类型 *" wide><div className="flex gap-2">{(['GOODS', 'FREIGHT'] as const).map(value => <Button key={value} type="button" size="sm" variant={sourceType === value ? 'default' : 'outline'} onClick={() => changeSource(value)}>{value === 'GOODS' ? '货款发票' : '运费发票'}</Button>)}</div></Field>}
        {effectiveSource === 'GOODS' ? <>
          <Field label="所属合同 *" wide hint={contract ? `开票方：${contract.seller?.name || '—'}　收票方：${contract.buyer?.name || '—'}` : '开票方、收票方按合同带出；分摊时可分到同一交易双方的其他合同结算单。'}>
            <Input className="mb-2 h-9" placeholder="按合同号、标题或单位筛选" value={contractFilter} onChange={event => setContractFilter(event.target.value)} />
            <select aria-label="所属合同" className={selectClass} value={contractId} onChange={event => setContractId(event.target.value)}>
              <option value="">{options ? `请选择（${contracts.length} 个合同）` : '加载中…'}</option>
              {contracts.map(item => <option key={item.id} value={item.id}>{item.contractNo} · {item.title} · {(direction === 'INPUT' ? item.seller : item.buyer)?.name || '—'}</option>)}
            </select>
          </Field>
        </> : <>
          <Field label="承运方（开票方）*" wide><select aria-label="承运方" className={selectClass} value={freight.carrierPartnerId} onChange={event => setFreight(current => ({ ...current, carrierPartnerId: event.target.value }))}><option value="">请选择</option>{options?.carriers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="付款主体（收票方）*"><select aria-label="付款主体" className={selectClass} value={freight.payerPartnerId} onChange={event => setFreight(current => ({ ...current, payerPartnerId: event.target.value }))}><option value="">请选择</option>{options?.payers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="事业部 *"><select aria-label="事业部" className={selectClass} value={freight.businessUnitId} onChange={event => setFreight(current => ({ ...current, businessUnitId: event.target.value }))}><option value="">请选择</option>{options?.businessUnits.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </>}
      </>}
      <Field label="发票号码 *"><Input value={form.invoiceNo} onChange={event => set('invoiceNo', event.target.value)} /></Field>
      <Field label="发票代码"><Input value={form.invoiceCode} onChange={event => set('invoiceCode', event.target.value)} /></Field>
      <Field label="开票日期 *"><Input type="date" value={form.issuedAt} onChange={event => set('issuedAt', event.target.value)} /></Field>
      <Field label="含税金额 *"><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={form.taxInclusiveAmount} onChange={event => set('taxInclusiveAmount', event.target.value)} /></Field>
      <Field label="品名规格 *" wide><Input value={form.materialName} onChange={event => set('materialName', event.target.value)} /></Field>
      <Field label={effectiveSource === 'FREIGHT' ? '数量' : '数量（吨）'}><Input type="number" inputMode="decimal" min="0" step="0.001" value={form.quantity} onChange={event => set('quantity', event.target.value)} /></Field>
      <Field label="含税单价"><Input type="number" inputMode="decimal" min="0" step="0.0001" value={form.unitPrice} onChange={event => set('unitPrice', event.target.value)} /></Field>
      <Field label="税率（%）"><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.taxRate} onChange={event => set('taxRate', event.target.value)} /></Field>
      <Field label="税额"><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.taxAmount} onChange={event => set('taxAmount', event.target.value)} /></Field>
      {mode?.kind === 'settlement' && <>
        <Field label="本次分摊到本单的金额" hint="不填时按发票金额与本单未到票金额的较小者分摊，其余留待分摊到其他结算单"><Input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="自动" value={form.allocationAmount} onChange={event => set('allocationAmount', event.target.value)} /></Field>
        {effectiveSource === 'GOODS' && <Field label="分摊数量（吨）" hint="选填，填写后核对数量"><Input type="number" inputMode="decimal" min="0" step="0.001" value={form.allocationQuantity} onChange={event => set('allocationQuantity', event.target.value)} /></Field>}
      </>}
      <Field label="备注" wide><Input value={form.remarks} onChange={event => set('remarks', event.target.value)} /></Field>
    </div>
    <DialogFooter className="sticky -bottom-4 -mx-4 mt-2 gap-2 border-t bg-background px-4 py-3 sm:static sm:mx-0 sm:mt-0 sm:border-0 sm:px-0 sm:pb-0 sm:pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={busy || !mode} onClick={() => void submit()}>{busy ? '保存中…' : '保存发票'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
