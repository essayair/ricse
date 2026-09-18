'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ChinaRegionSelect } from '@/components/china-region-select';
import { WandSparkles } from 'lucide-react';
import { recognizePartnerAddress } from '@/lib/address-recognition';

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
  const [recognitionText, setRecognitionText] = useState('');
  const [recognitionResult, setRecognitionResult] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(initial ? {
      addressName: initial.addressName, province: initial.province, city: initial.city,
      district: initial.district, detailAddress: initial.detailAddress,
      contactPerson: initial.contactPerson, contactPhone: initial.contactPhone,
      isDefault: initial.isDefault, remark: initial.remark || '',
    } : EMPTY);
    setRecognitionText('');
    setRecognitionResult('');
  }, [open, initial]);

  const set = (key: keyof typeof EMPTY, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const recognize = () => {
    if (!recognitionText.trim()) return setRecognitionResult('请先粘贴完整的收发货信息');
    const result = recognizePartnerAddress(recognitionText);
    if (!result.recognizedFields.length) return setRecognitionResult('未识别到有效信息，请检查文字后重试或手工填写');
    setForm(current => ({
      ...current,
      addressName: result.addressName || current.addressName,
      province: result.province || current.province,
      city: result.city || current.city,
      district: result.district || current.district,
      detailAddress: result.detailAddress || current.detailAddress,
      contactPerson: result.contactPerson || current.contactPerson,
      contactPhone: result.contactPhone || current.contactPhone,
    }));
    setRecognitionResult(`已识别：${result.recognizedFields.join('、')}。请核对后保存。`);
  };
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
        <div className="rounded-lg border bg-muted/30 p-4 md:col-span-2">
          <div className="mb-2 flex items-start gap-2">
            <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div><div className="text-sm font-medium">收发货信息自动识别</div><p className="mt-0.5 text-xs text-muted-foreground">粘贴微信、短信或文档中的整段地址，系统自动拆分省市区县、详细地址、联系人和联系方式。</p></div>
          </div>
          <textarea className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={recognitionText} onChange={event => setRecognitionText(event.target.value)} placeholder={'例如：收货人：张三 13800138000\n收货地址：甘肃省兰州市城关区雁南路18号某某园区'} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{recognitionResult || '识别结果只用于辅助填入，不会自动保存。'}</span><Button type="button" size="sm" variant="outline" onClick={recognize}><WandSparkles className="mr-1.5 h-3.5 w-3.5" />识别并填入</Button></div>
        </div>
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
