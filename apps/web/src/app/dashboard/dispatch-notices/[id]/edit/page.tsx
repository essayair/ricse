'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { PartnerAddress } from '@/components/partner-address-dialog';

interface LocationValue { location: string; contactPerson: string; contactPhone: string; sourceType: 'MANUAL' | 'WAREHOUSE' | 'PARTNER_ADDRESS'; warehouseId: string; partnerAddressId: string }
interface Warehouse { id: string; code: string; name: string; address?: string; manager?: string; managerPhone?: string }
interface AddressPartner { id: string; name: string; addresses: PartnerAddress[] }
interface Options { warehouses: Warehouse[]; counterparty: AddressPartner | null; internalPartner: AddressPartner | null }

export default function EditDispatchLocationsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [notice, setNotice] = useState<any>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [origin, setOrigin] = useState<LocationValue | null>(null);
  const [destination, setDestination] = useState<LocationValue | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get<any>(`/dispatch-notices/${id}`), api.get<Options>(`/dispatch-notices/${id}/location-options`)]).then(([item, sourceOptions]) => {
      setNotice(item); setOptions(sourceOptions);
      setOrigin({ location: item.originLocation || '', contactPerson: item.originContactPerson || '', contactPhone: item.originContactPhone || '', sourceType: item.originSourceType || 'MANUAL', warehouseId: item.originWarehouseId || '', partnerAddressId: item.originPartnerAddressId || '' });
      setDestination({ location: item.destinationLocation || '', contactPerson: item.destinationContactPerson || '', contactPhone: item.destinationContactPhone || '', sourceType: item.destinationSourceType || 'MANUAL', warehouseId: item.destinationWarehouseId || '', partnerAddressId: item.destinationPartnerAddressId || '' });
    }).catch(error => { alert(error.message); router.back(); });
  }, [id, router]);

  if (!notice || !options || !origin || !destination) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const save = async () => {
    if (!origin.location.trim() || !destination.location.trim()) return alert('请完整填写起运地址和目的地址');
    setSaving(true);
    try {
      await api.patch(`/dispatch-notices/${id}/locations`, payload(origin, destination));
      router.push(`/dashboard/dispatch-notices/${id}`);
    } catch (error: any) { alert(error.message); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-2xl font-bold">修改执行地址</h1><p className="mt-1 text-sm text-muted-foreground">{notice.noticeNo} · 地址主数据用于快速填入，实际地址允许直接修改。</p></div><Card className="grid gap-5 p-6 md:grid-cols-2"><LocationEditor label={notice.type === 'PURCHASE' ? '起运地点（供应商发货地）' : '起运地点'} value={origin} setValue={setOrigin} warehouses={options.warehouses} groups={notice.type === 'PURCHASE' ? addressGroups('供应商地址', options.counterparty) : addressGroups('我方主体地址', options.internalPartner)} /><LocationEditor label={notice.type === 'PURCHASE' ? '目的地' : '目的地（客户收货地）'} value={destination} setValue={setDestination} warehouses={options.warehouses} groups={notice.type === 'PURCHASE' ? addressGroups('我方主体地址', options.internalPartner) : addressGroups('客户地址', options.counterparty)} /></Card><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存修改'}</Button></div></div>;
}

function payload(origin: LocationValue, destination: LocationValue) { return { originLocation: origin.location.trim(), destinationLocation: destination.location.trim(), originSourceType: origin.sourceType, destinationSourceType: destination.sourceType, originWarehouseId: origin.warehouseId || undefined, destinationWarehouseId: destination.warehouseId || undefined, originPartnerAddressId: origin.partnerAddressId || undefined, destinationPartnerAddressId: destination.partnerAddressId || undefined, originContactPerson: origin.contactPerson || undefined, originContactPhone: origin.contactPhone || undefined, destinationContactPerson: destination.contactPerson || undefined, destinationContactPhone: destination.contactPhone || undefined }; }

interface AddressGroup { label: string; partner: AddressPartner }
function addressGroups(label: string, partner: AddressPartner | null): AddressGroup[] { return partner ? [{ label, partner }] : []; }

function LocationEditor({ label, value, setValue, warehouses, groups }: { label: string; value: LocationValue; setValue: (value: LocationValue) => void; warehouses: Warehouse[]; groups: AddressGroup[] }) {
  const key = value.sourceType === 'WAREHOUSE' ? `warehouse:${value.warehouseId}` : value.sourceType === 'PARTNER_ADDRESS' ? `partner:${value.partnerAddressId}` : '';
  const choose = (choice: string) => {
    if (!choice) return setValue({ ...value, sourceType: 'MANUAL', warehouseId: '', partnerAddressId: '' });
    const [type, id] = choice.split(':');
    if (type === 'warehouse') { const item = warehouses.find(row => row.id === id); if (!item) return; setValue({ location: item.address || '', contactPerson: item.manager || '', contactPhone: item.managerPhone || '', sourceType: 'WAREHOUSE', warehouseId: item.id, partnerAddressId: '' }); if (!item.address) alert('该仓库尚未维护地址，请在下方手工填写本次实际地址'); }
    else { const item = groups.flatMap(group => group.partner.addresses).find(row => row.id === id); if (item) setValue({ location: item.fullAddress, contactPerson: item.contactPerson, contactPhone: item.contactPhone, sourceType: 'PARTNER_ADDRESS', warehouseId: '', partnerAddressId: item.id }); }
  };
  return <div><label className="mb-1 block text-sm font-medium">{label} *</label><select className="mb-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={key} onChange={event => choose(event.target.value)}><option value="">手工填写新地址</option><optgroup label="仓库地址">{warehouses.map(item => <option key={item.id} value={`warehouse:${item.id}`}>{item.code} · {item.name} · {item.address || '地址未维护'}</option>)}</optgroup>{groups.map(group => <optgroup key={group.partner.id} label={`${group.label} · ${group.partner.name}`}>{group.partner.addresses.map(item => <option key={item.id} value={`partner:${item.id}`}>{item.isDefault ? '默认 · ' : ''}{item.addressName} · {item.fullAddress}</option>)}</optgroup>)}</select><Input value={value.location} onChange={event => setValue({ ...value, location: event.target.value })} placeholder="可直接填写本次实际地址" /><div className="mt-2 grid grid-cols-2 gap-2"><Input value={value.contactPerson} onChange={event => setValue({ ...value, contactPerson: event.target.value })} placeholder="联系人" /><Input value={value.contactPhone} onChange={event => setValue({ ...value, contactPhone: event.target.value })} placeholder="联系方式" /></div><p className="mt-2 text-xs text-muted-foreground">选择后自动拼接为完整地址；手工修改只影响本单据地址快照。</p></div>;
}
