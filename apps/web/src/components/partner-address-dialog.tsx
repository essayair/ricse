'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ChinaRegionSelect } from '@/components/china-region-select';

export interface PartnerAddress {
  id: string;
  partnerId: string;
  addressName: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  fullAddress: string;
  contactPerson: string;
  contactPhone: string;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  remark?: string | null;
}

const EMPTY = {
  addressName: '', province: '', city: '', district: '', detailAddress: '',
  contactPerson: '', contactPhone: '', isDefault: false, remark: '',
};

export function PartnerAddressDialog({
  open, partnerId, initial, onOpenChange, onSaved,
}: {
  open: boolean;
  partnerId: string;
  initial?: PartnerAddress | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (address: PartnerAddress) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? {
      addressName: initial.addressName, province: initial.province, city: initial.city,
      district: initial.district, detailAddress: initial.detailAddress,
      contactPerson: initial.contactPerson, contactPhone: initial.contactPhone,
      isDefault: initial.isDefault, remark: initial.remark || '',
    } : EMPTY);
  }, [open, initial]);

  const set = (key: keyof typeof EMPTY, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    const required = [form.addressName, form.province, form.city, form.district, form.detailAddress, form.contactPerson, form.contactPhone];
    if (required.some(value => !String(value).trim())) return alert('请完整填写地址简称、省、市、区县、详细地址、联系人和联系方式');
    setSaving(true);
    try {
      const address = initial
        ? await api.patch<PartnerAddress>(`/partners/addresses/${initial.id}`, form)
        : await api.post<PartnerAddress>(`/partners/${partnerId}/addresses`, form);
      onSaved(address);
      onOpenChange(false);
    } catch (error: any) { alert(error.message || '地址保存失败'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{initial ? '编辑收发货地址' : '新增收发货地址'}</DialogTitle>
        <DialogDescription>该地址可在采购、销售和直拨执行通知中快速选择，实际单据仍允许修改。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="地址简称 *"><Input value={form.addressName} onChange={e => set('addressName', e.target.value)} placeholder="例如：甘肃厂区" /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.isDefault} disabled={Boolean(initial?.isDefault)} onChange={e => set('isDefault', e.target.checked)} />{initial?.isDefault ? '当前默认地址（更换时请设置其他地址）' : '设为默认地址'}</label>
        <div className="md:col-span-2"><ChinaRegionSelect value={{ province: form.province, city: form.city, district: form.district }} onChange={region => setForm(current => ({ ...current, ...region }))} /></div>
        <div className="md:col-span-2"><Field label="详细地址 *"><Input value={form.detailAddress} onChange={e => set('detailAddress', e.target.value)} placeholder="街道、园区、门牌号或装卸区域" /></Field></div>
        <Field label="联系人 *"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></Field>
        <Field label="联系方式 *"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="备注"><Input value={form.remark} onChange={e => set('remark', e.target.value)} placeholder="入场要求、工作时间等" /></Field></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存地址'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>;
}
