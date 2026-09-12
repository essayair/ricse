'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';
import { PartnerAddressDialog, type PartnerAddress } from '@/components/partner-address-dialog';

interface Order { id: string; orderNo: string; name: string; type: string; status: string; contract: { contractNo: string; title: string } }
interface Available {
  order: Order & { deliveryLocation?: string | null };
  lineItems: Array<{ orderLineItemId: string; materialName: string | null; materialId: string; unit: string; batchQuantity: number; availableQuantity: number }>;
  locationOptions: {
    counterparty: { id: string; name: string; role: 'SUPPLIER' | 'CUSTOMER'; addresses: PartnerAddress[] } | null;
    internalPartner: { id: string; name: string; addresses: PartnerAddress[] } | null;
  };
}
interface Warehouse { id: string; code: string; name: string; address?: string; manager?: string; managerPhone?: string; status: string }
interface LocationValue {
  location: string; contactPerson: string; contactPhone: string; sourceType: 'MANUAL' | 'WAREHOUSE' | 'PARTNER_ADDRESS';
  warehouseId: string; partnerAddressId: string;
}

const EMPTY_LOCATION: LocationValue = { location: '', contactPerson: '', contactPhone: '', sourceType: 'MANUAL', warehouseId: '', partnerAddressId: '' };

function warehouseLocation(warehouse: Warehouse) {
  return warehouse.address?.trim() || '';
}

export default function CreateDispatchNoticePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [data, setData] = useState<Available | null>(null);
  const [mode, setMode] = useState('STANDARD');
  const [qualityRequired, setQualityRequired] = useState(true);
  const [plannedDate, setPlannedDate] = useState('');
  const [origin, setOrigin] = useState<LocationValue>(EMPTY_LOCATION);
  const [destination, setDestination] = useState<LocationValue>(EMPTY_LOCATION);
  const [remarks, setRemarks] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addressTarget, setAddressTarget] = useState<'origin' | 'destination' | null>(null);
  const [canManageAddresses, setCanManageAddresses] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setCanManageAddresses(user.role === 'ADMIN' || (user.permissions || []).includes('master_data.manage'));
    } catch {}
    Promise.all([
      api.get<{ items: Order[] }>('/orders?status=CONFIRMED&pageSize=100'),
      api.get<{ items: Order[] }>('/orders?status=DISPATCHED&pageSize=100'),
      api.get<Warehouse[]>('/master-data/warehouses'),
    ]).then(([confirmed, executing, warehouseData]) => {
      setOrders([...confirmed.items, ...executing.items]);
      setWarehouses(warehouseData.filter(item => item.status === 'ACTIVE'));
    }).catch(error => alert(error.message));
  }, []);

  const selectOrder = async (id: string) => {
    if (!id) {
      setData(null);
      setOrigin(EMPTY_LOCATION);
      setDestination(EMPTY_LOCATION);
      return;
    }
    try {
      const result = await api.get<Available>(`/dispatch-notices/orders/${id}/availability`);
      setData(result);
      setQualityRequired(result.order.type === 'PURCHASE');
      const defaultAddress = result.locationOptions.counterparty?.addresses.find(item => item.isDefault)
        || result.locationOptions.counterparty?.addresses[0];
      const counterpartyLocation: LocationValue = defaultAddress ? {
        location: defaultAddress.fullAddress, contactPerson: defaultAddress.contactPerson,
        contactPhone: defaultAddress.contactPhone, sourceType: 'PARTNER_ADDRESS',
        warehouseId: '', partnerAddressId: defaultAddress.id,
      } : EMPTY_LOCATION;
      if (result.order.type === 'PURCHASE') {
        setOrigin(counterpartyLocation);
        setDestination({ ...EMPTY_LOCATION, location: result.order.deliveryLocation || '' });
      } else {
        setOrigin(EMPTY_LOCATION);
        setDestination(defaultAddress ? counterpartyLocation : { ...EMPTY_LOCATION, location: result.order.deliveryLocation || '' });
      }
      setQuantities(Object.fromEntries(result.lineItems.map(item => [item.orderLineItemId, item.availableQuantity])));
    } catch (error: any) { alert(error.message); }
  };

  useEffect(() => {
    const orderId = params.get('orderId');
    if (orderId && orders.some(item => item.id === orderId) && data?.order.id !== orderId) void selectOrder(orderId);
  }, [orders, params, data]);

  const total = useMemo(() => Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0), [quantities]);

  const submit = async () => {
    if (!data) return alert('请选择执行批次');
    if (!origin.location.trim()) return alert('请填写起运地址，或快速选择仓库/合作伙伴地址');
    if (!destination.location.trim()) return alert('请填写目的地址，或快速选择仓库/合作伙伴地址');
    const inventoryWarehouseId = data.order.type === 'PURCHASE' ? destination.warehouseId : origin.warehouseId;
    const lineItems = data.lineItems.filter(item => quantities[item.orderLineItemId] > 0).map(item => ({ orderLineItemId: item.orderLineItemId, quantity: quantities[item.orderLineItemId] }));
    try {
      const notice = await api.post<{ id: string }>('/dispatch-notices', {
        orderId: data.order.id, mode, qualityRequired, warehouseId: inventoryWarehouseId || undefined, plannedDate: plannedDate || undefined,
        originLocation: origin.location.trim(), destinationLocation: destination.location.trim(),
        originSourceType: origin.sourceType, destinationSourceType: destination.sourceType,
        originWarehouseId: origin.warehouseId || undefined, destinationWarehouseId: destination.warehouseId || undefined,
        originPartnerAddressId: origin.partnerAddressId || undefined, destinationPartnerAddressId: destination.partnerAddressId || undefined,
        originContactPerson: origin.contactPerson.trim() || undefined, originContactPhone: origin.contactPhone.trim() || undefined,
        destinationContactPerson: destination.contactPerson.trim() || undefined, destinationContactPhone: destination.contactPhone.trim() || undefined,
        remarks: remarks || undefined, lineItems,
      });
      router.push(`/dashboard/dispatch-notices/${notice.id}`);
    } catch (error: any) { alert(error.message); }
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold">新建执行通知</h1><p className="mt-1 text-sm text-muted-foreground">采购生成供应商发货指令，销售生成销售发货通知单</p></div>
    <Card className="space-y-5 p-6">
      <div><label className="mb-1 block text-sm font-medium">合同执行批次 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={data?.order.id || ''} onChange={e => void selectOrder(e.target.value)}><option value="">请选择</option>{orders.map(item => <option key={item.id} value={item.id}>{item.name} · {item.orderNo} · {item.contract.contractNo}</option>)}</select></div>
      {data && <>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="mb-1 block text-sm font-medium">单据类型</label><Input disabled value={data.order.type === 'PURCHASE' ? '供应商发货指令' : '销售发货通知单'} /></div>
          <div><label className="mb-1 block text-sm font-medium">执行模式</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={e => setMode(e.target.value)}><option value="STANDARD">常规</option><option value="DIRECT">直拨</option></select></div>
          <div><label className="mb-1 block text-sm font-medium">计划日期</label><Input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} /></div>
        </div>
        <label className="flex items-start gap-3 rounded-md border bg-muted/20 p-4 text-sm"><input className="mt-0.5" type="checkbox" checked={qualityRequired} onChange={event => setQualityRequired(event.target.checked)} /><span><span className="block font-medium">{data.order.type === 'PURCHASE' ? '到货后需要质检' : '送达后需要交付质检'}</span><span className="mt-1 block text-xs text-muted-foreground">勾选后，运单到达或送达时自动生成质检任务；销售默认不勾选。</span></span></label>
        <div className="grid gap-4 md:grid-cols-2">
          <LocationField
            label={data.order.type === 'PURCHASE' ? '起运地点（供应商发货地）' : '起运地点'}
            placeholder={data.order.type === 'PURCHASE' ? '请填写起运地址' : '可选择仓库或我方地址快速填入，也可直接填写'}
            value={origin}
            onChange={setOrigin}
            warehouses={warehouses}
            partners={data.order.type === 'PURCHASE'
              ? addressGroups('供应商地址', data.locationOptions.counterparty)
              : addressGroups('我方主体地址', data.locationOptions.internalPartner)}
            onAddPartnerAddress={canManageAddresses && data.order.type === 'PURCHASE' ? () => setAddressTarget('origin') : undefined}
          />
          <LocationField
            label={data.order.type === 'PURCHASE' ? '目的地' : '目的地（客户收货地）'}
            placeholder={data.order.type === 'PURCHASE' ? '可选择仓库或我方地址快速填入，也可直接填写' : '请填写客户收货地址'}
            value={destination}
            onChange={setDestination}
            warehouses={warehouses}
            partners={data.order.type === 'PURCHASE'
              ? addressGroups('我方主体地址', data.locationOptions.internalPartner)
              : addressGroups('客户地址', data.locationOptions.counterparty)}
            onAddPartnerAddress={canManageAddresses && data.order.type === 'SALES' ? () => setAddressTarget('destination') : undefined}
          />
        </div>
        <div><h2 className="mb-2 font-semibold">通知明细</h2><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-3 py-2 text-left">物料</th><th className="px-3 py-2 text-right">批次数量</th><th className="px-3 py-2 text-right">剩余可通知</th><th className="px-3 py-2 text-right">本次通知数量</th></tr></thead><tbody>{data.lineItems.map(item => <tr key={item.orderLineItemId} className="border-b"><td className="px-3 py-2">{item.materialName || item.materialId}</td><td className="px-3 py-2 text-right">{item.batchQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2 text-right">{item.availableQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2"><Input className="ml-auto w-36 text-right" type="number" min="0" max={item.availableQuantity} value={quantities[item.orderLineItemId] || 0} onChange={e => setQuantities(current => ({ ...current, [item.orderLineItemId]: Number(e.target.value) }))} /></td></tr>)}</tbody></table><div className="mt-3 text-right font-bold">通知总数量：{total.toLocaleString()} 吨</div></div>
        <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
      </>}
    </Card>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={!data} onClick={() => void submit()}>创建执行通知</Button></div>
    {data?.locationOptions.counterparty && <PartnerAddressDialog
      open={addressTarget !== null}
      partnerId={data.locationOptions.counterparty.id}
      onOpenChange={open => { if (!open) setAddressTarget(null); }}
      onSaved={address => {
        setData(current => current ? { ...current, locationOptions: { ...current.locationOptions, counterparty: current.locationOptions.counterparty ? { ...current.locationOptions.counterparty, addresses: [address, ...current.locationOptions.counterparty.addresses.filter(item => item.id !== address.id)].map(item => address.isDefault ? { ...item, isDefault: item.id === address.id } : item) } : null } } : current);
        const next: LocationValue = { location: address.fullAddress, contactPerson: address.contactPerson, contactPhone: address.contactPhone, sourceType: 'PARTNER_ADDRESS', warehouseId: '', partnerAddressId: address.id };
        if (addressTarget === 'origin') setOrigin(next); else setDestination(next);
      }}
    />}
  </div>;
}

type AddressPartner = NonNullable<Available['locationOptions']['counterparty']> | NonNullable<Available['locationOptions']['internalPartner']>;
interface AddressGroup { label: string; partner: AddressPartner }

function addressGroups(label: string, partner: AddressPartner | null): AddressGroup[] {
  return partner ? [{ label, partner }] : [];
}

function LocationField({ label, placeholder, value, onChange, warehouses, partners, onAddPartnerAddress }: {
  label: string;
  placeholder: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  warehouses: Warehouse[];
  partners: AddressGroup[];
  onAddPartnerAddress?: () => void;
}) {
  const sourceValue = value.sourceType === 'WAREHOUSE' ? `warehouse:${value.warehouseId}` : value.sourceType === 'PARTNER_ADDRESS' ? `partner:${value.partnerAddressId}` : '';
  const selectSource = (selected: string) => {
    if (!selected) return onChange({ ...value, sourceType: 'MANUAL', warehouseId: '', partnerAddressId: '' });
    const [type, id] = selected.split(':');
    if (type === 'warehouse') {
      const warehouse = warehouses.find(item => item.id === id);
      if (!warehouse) return;
      onChange({ location: warehouseLocation(warehouse), contactPerson: warehouse.manager || '', contactPhone: warehouse.managerPhone || '', sourceType: 'WAREHOUSE', warehouseId: id, partnerAddressId: '' });
      if (!warehouse.address?.trim()) alert('该仓库尚未维护地址，请在下方手工填写本次实际地址');
      return;
    }
    const address = partners.flatMap(group => group.partner.addresses).find(item => item.id === id);
    if (address) onChange({ location: address.fullAddress, contactPerson: address.contactPerson, contactPhone: address.contactPhone, sourceType: 'PARTNER_ADDRESS', warehouseId: '', partnerAddressId: id });
  };
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label} *</label>
      <select
        className="mb-2 h-9 w-full rounded-md border bg-muted/30 px-3 text-sm"
        value={sourceValue}
        onChange={(event) => selectSource(event.target.value)}
      >
        <option value="">手工填写新地址</option>
        <optgroup label="仓库地址">
        {warehouses.map(warehouse => (
          <option key={warehouse.id} value={`warehouse:${warehouse.id}`}>{warehouse.code} · {warehouse.name}{warehouse.address ? ` · ${warehouse.address}` : ' · 地址未维护'}</option>
        ))}
        </optgroup>
        {partners.map(group => <optgroup key={group.partner.id} label={`${group.label} · ${group.partner.name}`}>
          {group.partner.addresses.map(address => <option key={address.id} value={`partner:${address.id}`}>{address.isDefault ? '默认 · ' : ''}{address.addressName} · {address.fullAddress}</option>)}
        </optgroup>)}
      </select>
      <Input
        value={value.location}
        onChange={(event) => onChange({ ...value, location: event.target.value })}
        placeholder={placeholder}
        required
      />
      <div className="mt-2 grid grid-cols-2 gap-2"><Input value={value.contactPerson} onChange={event => onChange({ ...value, contactPerson: event.target.value })} placeholder="联系人（可填写）" /><Input value={value.contactPhone} onChange={event => onChange({ ...value, contactPhone: event.target.value })} placeholder="联系方式（可填写）" /></div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>选择后自动拼接为完整地址，仍可修改并保存本次地址快照</span>{onAddPartnerAddress && <button type="button" className="font-medium text-primary hover:underline" onClick={onAddPartnerAddress}>新增合作伙伴地址</button>}</div>
    </div>
  );
}
