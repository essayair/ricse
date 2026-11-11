'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Contract = { id: string; title: string; type: string; lineItems: Array<{ id: string; materialName: string; quantity: string }>; seller?: { address?: string }; buyer?: { address?: string } };
type Order = { id: string; orderNo: string; name: string; type: string; status: string; remaining: Array<{ contractLineItemId: string; quantity: string }> };
type Options = { orders: Order[]; unallocated: Array<{ contractLineItemId: string; PURCHASE: string; SALES: string }>; sellerId: string; buyerId: string; partners: Array<{ id: string; name: string; businessAddresses: Array<{ id: string; addressName: string; fullAddress: string; contactPerson: string; contactPhone: string; isDefault: boolean }> }>; warehouses: Array<{ id: string; name: string; address: string; manager?: string; managerPhone?: string }> };
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export default function NewDirectExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contract, setContract] = useState<Contract>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [options, setOptions] = useState<Options>();
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ contractLineItemId: '', quantity: '', name: '', purchaseOrderId: '', salesOrderId: '', originLocation: '', destinationLocation: '', plannedDate: '', remarks: '', originSourceType: 'MANUAL', destinationSourceType: 'MANUAL', originWarehouseId: '', destinationWarehouseId: '', originPartnerAddressId: '', destinationPartnerAddressId: '', originContactPerson: '', originContactPhone: '', destinationContactPerson: '', destinationContactPhone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get<Contract>(`/contracts/${id}`), api.get<Options>(`/bilateral-direct/contracts/${id}/execution-options`)]).then(([c, o]) => {
      setContract(c); setOptions(o); setOrders(o.orders);
      setForm(v => ({ ...v, contractLineItemId: c.lineItems.length === 1 ? c.lineItems[0].id : '', originLocation: c.seller?.address || '', destinationLocation: c.buyer?.address || '' }));
    }).catch(e => setError(e.message));
  }, [id]);
  const set = (key: keyof typeof form, value: string) => setForm(v => ({ ...v, [key]: value }));
  function selectAddress(side: 'origin' | 'destination', selected: string) {
    const [type, key] = selected.split(':');
    const address = options?.partners.flatMap(p => p.businessAddresses).find(a => a.id === key);
    const warehouse = options?.warehouses.find(w => w.id === key);
    setForm(v => ({ ...v, [`${side}SourceType`]: type === 'partner' ? 'PARTNER_ADDRESS' : type === 'warehouse' ? 'WAREHOUSE' : 'MANUAL', [`${side}PartnerAddressId`]: type === 'partner' ? key : '', [`${side}WarehouseId`]: type === 'warehouse' ? key : '', ...(type === 'partner' && address ? { [`${side}Location`]: address.fullAddress, [`${side}ContactPerson`]: address.contactPerson, [`${side}ContactPhone`]: address.contactPhone } : type === 'warehouse' && warehouse ? { [`${side}Location`]: warehouse.address || '', [`${side}ContactPerson`]: warehouse.manager || '', [`${side}ContactPhone`]: warehouse.managerPhone || '' } : {}) }));
  }
  const remaining = (direction: 'PURCHASE' | 'SALES') => {
    const orderId = direction === 'PURCHASE' ? form.purchaseOrderId : form.salesOrderId;
    return Number(orderId ? orders.find(o => o.id === orderId)?.remaining.find(l => l.contractLineItemId === form.contractLineItemId)?.quantity || 0 : options?.unallocated.find(l => l.contractLineItemId === form.contractLineItemId)?.[direction] || 0);
  };
  async function save() {
    if (!form.contractLineItemId || !(Number(form.quantity) > 0) || !form.originLocation.trim() || !form.destinationLocation.trim()) {
      setError('请选择合同货物，填写正数通知数量、起运地点和目的地点'); return;
    }
    setBusy(true); setError('');
    try {
      const result = await api.post<{ salesNotice: { id: string } }>('/bilateral-direct/executions', { ...form, contractId: id, requestId, quantity: Number(form.quantity), plannedDate: form.plannedDate || undefined, purchaseOrderId: form.purchaseOrderId || undefined, salesOrderId: form.salesOrderId || undefined });
      router.push(`/dashboard/dispatch-notices/${result.salesNotice.id}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '创建失败'); }
    finally { setBusy(false); }
  }
  if (!contract) return <div className="p-6">{error || '加载中…'}</div>;
  if (contract.type !== 'BILATERAL') return <div className="p-6 text-destructive">仅双边合同支持配对直拨</div>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <Button variant="ghost" onClick={() => router.push(`/dashboard/contracts/${id}`)}>返回合同</Button>
    <h1 className="text-2xl font-semibold">新建直拨执行</h1><p className="text-sm text-muted-foreground">{contract.title}</p>
    <Card className="space-y-5 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="合同货物 *"><select className={selectClass} value={form.contractLineItemId} onChange={e => set('contractLineItemId', e.target.value)}><option value="">请选择</option>{contract.lineItems.map(l => <option key={l.id} value={l.id}>{l.materialName} · 合同数量 {l.quantity}</option>)}</select></Field>
        <Field label="本次通知数量（吨） *"><Input type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => set('quantity', e.target.value)} /></Field>
        <Field label="采购执行批次"><select className={selectClass} value={form.purchaseOrderId} onChange={e => set('purchaseOrderId', e.target.value)}><option value="">新建采购批次</option>{orders.filter(o => o.type === 'PURCHASE').map(o => <option value={o.id} key={o.id}>{o.orderNo} · {o.name}</option>)}</select></Field>
        <Field label="销售执行批次"><select className={selectClass} value={form.salesOrderId} onChange={e => set('salesOrderId', e.target.value)}><option value="">新建销售批次</option>{orders.filter(o => o.type === 'SALES').map(o => <option value={o.id} key={o.id}>{o.orderNo} · {o.name}</option>)}</select></Field>
        {form.contractLineItemId && <p className="text-sm text-muted-foreground md:col-span-2">采购剩余可通知 {remaining('PURCHASE').toFixed(3)} 吨 · 销售剩余可通知 {remaining('SALES').toFixed(3)} 吨 · 本次最多 {Math.max(0, Math.min(remaining('PURCHASE'), remaining('SALES'))).toFixed(3)} 吨</p>}
        <Field label="批次名称"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="可填写便于识别的名称" /></Field>
        <Field label="计划发货日期"><Input type="date" value={form.plannedDate} onChange={e => set('plannedDate', e.target.value)} /></Field>
        {(['origin', 'destination'] as const).map(side => <Field key={side} label={side === 'origin' ? '起运地点 *' : '目的地点 *'}>
          <select aria-label={side === 'origin' ? '快速填入起运地址' : '快速填入目的地址'} className={selectClass} value={form[`${side}SourceType`] === 'PARTNER_ADDRESS' ? `partner:${form[`${side}PartnerAddressId`]}` : form[`${side}SourceType`] === 'WAREHOUSE' ? `warehouse:${form[`${side}WarehouseId`]}` : ''} onChange={e => selectAddress(side, e.target.value)}>
            <option value="">手工填写地址</option>
            {options?.partners.map(p => <optgroup key={p.id} label={`${p.id === options.sellerId ? '供应商' : p.id === options.buyerId ? '客户' : '我方'} · ${p.name}`}>{p.businessAddresses.map(a => <option key={a.id} value={`partner:${a.id}`}>{a.isDefault ? '默认 · ' : ''}{a.addressName} · {a.fullAddress}</option>)}</optgroup>)}
            <optgroup label="仓库地址">{options?.warehouses.map(w => <option key={w.id} value={`warehouse:${w.id}`}>{w.name} · {w.address || '地址未维护'}</option>)}</optgroup>
          </select>
          <Input value={form[`${side}Location`]} onChange={e => set(`${side}Location`, e.target.value)} placeholder={side === 'origin' ? '请填写起运地址' : '请填写目的地址'} />
          <div className="grid grid-cols-2 gap-2"><Input value={form[`${side}ContactPerson`]} onChange={e => set(`${side}ContactPerson`, e.target.value)} placeholder="现场联系人" /><Input value={form[`${side}ContactPhone`]} onChange={e => set(`${side}ContactPhone`, e.target.value)} placeholder="联系电话" /></div>
        </Field>)}
      </div>
      <Field label="备注"><Input value={form.remarks} onChange={e => set('remarks', e.target.value)} /></Field>
      <p className="text-sm text-muted-foreground">同时确认两向批次并下达配对通知；一车只建一张共享运单，不预占仓库库存。</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy} onClick={() => void save()}>{busy ? '创建中…' : '创建并下达配对通知'}</Button>
    </Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-sm"><span>{label}</span>{children}</label>; }
