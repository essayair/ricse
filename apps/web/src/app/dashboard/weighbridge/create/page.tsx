'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Paperclip, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Waybill {
  id: string; waybillNo: string; plateNo: string | null; totalQuantity: string;
  driverName: string | null;
  lineItems: Array<{ materialId: string; materialName: string | null }>;
  dispatchNotice: { type: string; noticeNo: string; order: { name: string; orderNo: string; contract: {
    contractNo: string; type: string;
    seller: { name: string } | null; buyer: { name: string } | null; signingPartner: { name: string } | null;
  } } };
}
interface Material { id: string; spec?: string | null; grade?: string | null }

const BASIS_OPTIONS = [
  ['RECEIVING', '本次称重净重（默认）'], ['SHIPPING', '发货重量'], ['CUSTOMER', '客户收货重量'],
  ['THIRD_PARTY', '第三方重量'], ['MANUAL', '手工确认重量'],
];
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);

export default function CreateWeighTicketPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [waybillId, setWaybillId] = useState('');
  const [direction, setDirection] = useState('INBOUND');
  const [basis, setBasis] = useState('RECEIVING');
  const [basisWeight, setBasisWeight] = useState('');
  const [toleranceRate, setToleranceRate] = useState('0.5');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [ticketDate, setTicketDate] = useState(new Date().toISOString().slice(0, 10));
  const [plateNo, setPlateNo] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [materialSpec, setMaterialSpec] = useState('');
  const [shipperName, setShipperName] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [packageCount, setPackageCount] = useState('0');
  const [driverName, setDriverName] = useState('');
  const [weighmasterName, setWeighmasterName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Waybill[]>('/weigh-tickets/eligible-waybills').then(items => {
      setWaybills(items);
      const requestedWaybillId = params.get('waybillId');
      const selected = items.find(item => item.id === requestedWaybillId);
      if (selected) {
        setWaybillId(selected.id);
        setDirection(selected.dispatchNotice.type === 'PURCHASE' ? 'INBOUND' : 'OUTBOUND');
      }
    }).catch(error => alert(error.message));
    api.get<{ items: Material[] }>('/master-data/materials?pageSize=500').then(data => setMaterials(data.items || [])).catch(() => {});
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { setWeighmasterName(JSON.parse(storedUser).name || ''); } catch {}
    }
  }, []);

  useEffect(() => {
    const item = waybills.find(value => value.id === waybillId);
    if (!item) return;
    const isPurchase = item.dispatchNotice.type === 'PURCHASE';
    const contract = item.dispatchNotice.order.contract;
    setDirection(isPurchase ? 'INBOUND' : 'OUTBOUND');
    setPlateNo(item.plateNo || '');
    setDriverName(item.driverName || '');
    setMaterialName([...new Set(item.lineItems.map(line => line.materialName || line.materialId))].join('、'));
    setMaterialSpec([...new Set(item.lineItems.map(line => { const material = materials.find(value => value.id === line.materialId); return material?.spec || material?.grade || ''; }).filter(Boolean))].join('、'));
    setShipperName(isPurchase ? (contract.seller?.name || '') : (contract.signingPartner?.name || ''));
    setReceiverName(isPurchase ? (contract.signingPartner?.name || '') : (contract.type === 'BILATERAL' ? contract.buyer?.name || '' : contract.seller?.name || ''));
  }, [waybillId, waybills, materials]);

  const selectWaybill = (id: string) => {
    setWaybillId(id);
  };

  const addFiles = (selected: FileList | null) => {
    const candidates = Array.from(selected || []);
    const errors: string[] = [];
    const accepted = candidates.filter(file => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
        errors.push(`${file.name}：仅支持 JPG、PNG、WEBP 或 PDF`);
        return false;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        errors.push(`${file.name}：文件不能超过 20 MB`);
        return false;
      }
      if (!file.size) {
        errors.push(`${file.name}：文件内容为空`);
        return false;
      }
      return true;
    });
    if (errors.length) alert(errors.join('\n'));
    if (accepted.length) setFiles(current => [...current, ...accepted]);
  };

  const submit = async () => {
    if (!waybillId) return alert('请选择物流运单');
    if (!files.length) return alert('请至少上传一份磅单附件');
    if (files.some(file => file.size > MAX_ATTACHMENT_SIZE || !file.size)) return alert('附件不能为空且单个文件不能超过 20 MB');
    if (!ticketDate || !plateNo.trim() || !materialName.trim() || !materialSpec.trim() || !shipperName.trim() || !receiverName.trim() || packageCount === '' || !driverName.trim() || !weighmasterName.trim()) return alert('请完整填写磅单日期、车牌、货物、规格、发收货单位、包/袋数、司机和司磅员');
    if (basis !== 'RECEIVING' && Number(basisWeight) <= 0) return alert('请填写所选结算口径的重量');
    const weightField: Record<string, string> = { SHIPPING: 'shippingWeight', CUSTOMER: 'customerWeight', THIRD_PARTY: 'thirdPartyWeight', MANUAL: 'manualWeight' };
    setSaving(true);
    try {
      const ticket = await api.post<{ id: string }>('/weigh-tickets', {
        waybillId, direction, settlementBasis: basis, toleranceRate: Number(toleranceRate) || 0.5,
        ticketDate, plateNo: plateNo.trim(), materialName: materialName.trim(), materialSpec: materialSpec.trim(),
        shipperName: shipperName.trim(), receiverName: receiverName.trim(), packageCount: Number(packageCount),
        driverName: driverName.trim(), weighmasterName: weighmasterName.trim(),
        ...(basis !== 'RECEIVING' ? { [weightField[basis]]: Number(basisWeight) } : {}),
        remarks: remarks || undefined,
      });
      try {
        for (const file of files) {
          const body = new FormData();
          body.append('file', file);
          await api.upload(`/weigh-tickets/${ticket.id}/attachments`, body);
        }
      } catch (error: any) {
        alert(`磅单已创建，但附件上传未完成：${error.message || '上传失败'}。请在详情页重新上传。`);
      }
      router.push(`/dashboard/weighbridge/${ticket.id}`);
    } catch (error: any) {
      alert(error.message || '磅单创建失败');
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <div><h1 className="text-2xl font-bold">新建磅单</h1><p className="mt-1 text-sm text-muted-foreground">采购运单到达后称重，销售运单发运前称重；后续均可追加多次毛重或皮重复磅记录</p></div>
    <Card className="space-y-5 p-6">
      <div><label className="mb-1 block text-sm font-medium">物流运单 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={waybillId} onChange={event => selectWaybill(event.target.value)}><option value="">请选择可称重运单</option>{waybills.map(item => <option key={item.id} value={item.id}>{item.dispatchNotice.order.name} · {item.waybillNo} · {item.plateNo || '无车牌'} · {Number(item.totalQuantity)} 吨</option>)}</select></div>
      {!waybills.length && <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">暂无可创建磅单的运单。采购运单到达后、销售运单发运前会出现在这里。</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium">业务方向</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={direction} onChange={event => setDirection(event.target.value)}><option value="INBOUND">采购入场</option><option value="OUTBOUND">销售出场</option></select></div>
        <div><label className="mb-1 block text-sm font-medium">磅差容差（%）</label><Input type="number" min="0" step="0.01" value={toleranceRate} onChange={event => setToleranceRate(event.target.value)} /></div>
      </div>
      <div><h2 className="mb-3 border-b pb-2 font-semibold">磅单基本信息</h2><div className="grid gap-4 md:grid-cols-3"><div><label className="mb-1 block text-sm font-medium">磅单日期 *</label><Input type="date" value={ticketDate} onChange={event => setTicketDate(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">车牌号 *</label><Input value={plateNo} onChange={event => setPlateNo(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">司机姓名 *</label><Input value={driverName} onChange={event => setDriverName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">货物名称 *</label><Input value={materialName} onChange={event => setMaterialName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">规格型号 *</label><Input value={materialSpec} onChange={event => setMaterialSpec(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">包/袋数 *</label><Input type="number" min="0" step="1" value={packageCount} onChange={event => setPackageCount(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">散装货物填写 0</p></div><div><label className="mb-1 block text-sm font-medium">发货单位 *</label><Input value={shipperName} onChange={event => setShipperName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">收货单位 *</label><Input value={receiverName} onChange={event => setReceiverName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">司磅员 *</label><Input value={weighmasterName} onChange={event => setWeighmasterName(event.target.value)} /></div></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium">结算重量口径</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={basis} onChange={event => { setBasis(event.target.value); setBasisWeight(''); }}>{BASIS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {basis !== 'RECEIVING' && <div><label className="mb-1 block text-sm font-medium">对应重量（吨）*</label><Input type="number" min="0" step="0.001" value={basisWeight} onChange={event => setBasisWeight(event.target.value)} /></div>}
      </div>
      <p className="text-xs text-muted-foreground">选择“本次称重净重”时，完成毛重和皮重后自动以净重作为结算重量；其他口径仍保留本次净重，但以所填重量结算。</p>
      <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={event => setRemarks(event.target.value)} /></div>
      <div className="space-y-3"><div><label className="block text-sm font-medium">磅单附件 *</label><p className="mt-1 text-xs text-muted-foreground">上传现场磅单照片、设备磅单或扫描件，支持 JPG/PNG/WEBP/PDF，单个文件不超过 20 MB</p></div><label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed p-5 text-sm text-primary hover:bg-primary/5"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /><Paperclip className="mr-2 h-4 w-4" />选择磅单附件</label>{files.length > 0 && <div className="space-y-2">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"><span className="min-w-0 truncate">{file.name}<span className="ml-2 text-xs text-muted-foreground">{formatFileSize(file.size)}</span></span><button type="button" className="ml-3 text-destructive" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></button></div>)}</div>}</div>
    </Card>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.push('/dashboard/weighbridge')}>取消</Button><Button disabled={saving || !waybillId} onClick={() => void submit()}>{saving ? '创建中...' : '创建磅单'}</Button></div>
  </div>;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
