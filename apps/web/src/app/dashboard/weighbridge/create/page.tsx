'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Paperclip, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Waybill {
  id: string; waybillNo: string; status: string; plateNo: string | null; totalQuantity: string;
  driverName: string | null;
  weighTickets: Array<{
    id: string; ticketNo: string; status: string; weighingStage: string;
    sequence: number; isSupplementary: boolean; additionReason: string | null;
  }>;
  lineItems: Array<{ materialId: string; materialName: string | null }>;
  dispatchNotice: { id: string; type: string; noticeNo: string; order: { name: string; orderNo: string; contract: {
    contractNo: string; type: string;
    seller: { name: string } | null; buyer: { name: string } | null; signingPartner: { name: string } | null;
  } } };
}
interface Material { id: string; spec?: string | null; grade?: string | null }

const BASIS_OPTIONS = [
  ['RECEIVING', '本张磅单净重（默认）'], ['SHIPPING', '外部发货重量'], ['CUSTOMER', '外部收货重量'],
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
  const [noticeId, setNoticeId] = useState('');
  const [direction, setDirection] = useState('INBOUND');
  const [weighingStage, setWeighingStage] = useState<'SHIPPING' | 'RECEIVING'>('RECEIVING');
  const [additionReason, setAdditionReason] = useState('');
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
        setNoticeId(selected.dispatchNotice.type === 'SALES' ? selected.dispatchNotice.id : '');
        setWaybillId(selected.id);
        setDirection(selected.dispatchNotice.type === 'PURCHASE' ? 'INBOUND' : 'OUTBOUND');
        const requestedStage = params.get('stage');
        setWeighingStage(requestedStage === 'SHIPPING' || requestedStage === 'RECEIVING'
          ? requestedStage
          : selected.dispatchNotice.type === 'PURCHASE' ? 'RECEIVING' : 'SHIPPING');
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
    const requestedStage = params.get('stage');
    if (requestedStage !== 'SHIPPING' && requestedStage !== 'RECEIVING') {
      setWeighingStage(isPurchase ? 'RECEIVING' : 'SHIPPING');
    }
    setAdditionReason('');
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

  const salesNotices = [...new Map(waybills
    .filter(item => item.dispatchNotice.type === 'SALES')
    .map(item => [item.dispatchNotice.id, item.dispatchNotice])).values()];
  const selectableWaybills = noticeId
    ? waybills.filter(item => item.dispatchNotice.id === noticeId)
    : waybills;
  const selectedWaybill = waybills.find(item => item.id === waybillId);
  const existingAtStage = selectedWaybill?.weighTickets
    .filter(item => item.weighingStage === weighingStage)
    .sort((a, b) => b.sequence - a.sequence) || [];

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
    if (!stageAllowed(weighingStage, selectedWaybill?.status)) return alert('当前运单状态不允许录入该称重节点的磅单');
    if (existingAtStage.length && !additionReason.trim()) return alert('追加完整磅单必须填写追加原因');
    if (!files.length) return alert('请至少上传一份磅单附件');
    if (files.some(file => file.size > MAX_ATTACHMENT_SIZE || !file.size)) return alert('附件不能为空且单个文件不能超过 20 MB');
    if (!ticketDate || !plateNo.trim() || !materialName.trim() || !materialSpec.trim() || !shipperName.trim() || !receiverName.trim() || packageCount === '' || !driverName.trim() || !weighmasterName.trim()) return alert('请完整填写磅单日期、车牌、货物、规格、发收货单位、包/袋数、司机和司磅员');
    if (basis !== 'RECEIVING' && Number(basisWeight) <= 0) return alert('请填写所选结算口径的重量');
    const weightField: Record<string, string> = { SHIPPING: 'shippingWeight', CUSTOMER: 'customerWeight', THIRD_PARTY: 'thirdPartyWeight', MANUAL: 'manualWeight' };
    setSaving(true);
    try {
      const ticket = await api.post<{ id: string }>('/weigh-tickets', {
        waybillId, direction, weighingStage, additionReason: additionReason.trim() || undefined,
        settlementBasis: basis, toleranceRate: Number(toleranceRate) || 0.5,
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
    <div><h1 className="text-2xl font-bold">{existingAtStage.length ? '追加完整磅单' : '新建磅单'}</h1><p className="mt-1 text-sm text-muted-foreground">每个物流运单分别维护发货称重和收货称重；一张磅单内部仍可追加多次毛重、皮重复磅记录</p></div>
    <Card className="space-y-5 p-6">
      {salesNotices.length > 0 && <div><label className="mb-1 block text-sm font-medium">销售发货通知（筛选）</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={noticeId} onChange={event => { setNoticeId(event.target.value); setWaybillId(''); }}><option value="">全部执行通知</option>{salesNotices.map((notice: any) => <option key={notice.id} value={notice.id}>{notice.noticeNo} · {notice.order.name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">先选通知可快速定位车次；最终关联以具体物流运单为准</p></div>}
      <div><label className="mb-1 block text-sm font-medium">物流运单 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={waybillId} onChange={event => selectWaybill(event.target.value)}><option value="">请选择可称重运单</option>{selectableWaybills.map(item => <option key={item.id} value={item.id}>{item.dispatchNotice.order.name} · {item.waybillNo} · {item.plateNo || '无车牌'} · {Number(item.totalQuantity)} 吨</option>)}</select></div>
      {!waybills.length && <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">暂无可创建磅单的物流运单。</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium">业务方向</label><Input value={direction === 'INBOUND' ? '采购入场' : '销售出场'} disabled /></div>
        <div><label className="mb-1 block text-sm font-medium">称重节点 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={weighingStage} onChange={event => { setWeighingStage(event.target.value as 'SHIPPING' | 'RECEIVING'); setAdditionReason(''); }}><option value="SHIPPING">发货称重</option><option value="RECEIVING" disabled={!stageAllowed('RECEIVING', selectedWaybill?.status)}>收货称重{selectedWaybill && !stageAllowed('RECEIVING', selectedWaybill.status) ? '（到达后可录入）' : ''}</option></select></div>
        <div><label className="mb-1 block text-sm font-medium">磅差容差（%）</label><Input type="number" min="0" step="0.01" value={toleranceRate} onChange={event => setToleranceRate(event.target.value)} /></div>
      </div>
      {existingAtStage.length > 0 && <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="text-sm font-medium">该节点已有 {existingAtStage.length} 张完整磅单，最近一张为 {existingAtStage[0].ticketNo}</div><p className="text-xs">本次将作为第 {existingAtStage[0].sequence + 1} 张追加磅单保留，原磅单不会被覆盖。</p><div><label className="mb-1 block text-sm font-medium">追加原因 *</label><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm text-foreground" value={additionReason} onChange={event => setAdditionReason(event.target.value)} placeholder="例如：客户复磅、原凭证更正、第三方复核称重" /></div></div>}
      <div><h2 className="mb-3 border-b pb-2 font-semibold">磅单基本信息</h2><div className="grid gap-4 md:grid-cols-3"><div><label className="mb-1 block text-sm font-medium">磅单日期 *</label><Input type="date" value={ticketDate} onChange={event => setTicketDate(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">车牌号 *</label><Input value={plateNo} onChange={event => setPlateNo(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">司机姓名 *</label><Input value={driverName} onChange={event => setDriverName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">货物名称 *</label><Input value={materialName} onChange={event => setMaterialName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">规格型号 *</label><Input value={materialSpec} onChange={event => setMaterialSpec(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">包/袋数 *</label><Input type="number" min="0" step="1" value={packageCount} onChange={event => setPackageCount(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">散装货物填写 0</p></div><div><label className="mb-1 block text-sm font-medium">发货单位 *</label><Input value={shipperName} onChange={event => setShipperName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">收货单位 *</label><Input value={receiverName} onChange={event => setReceiverName(event.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">司磅员 *</label><Input value={weighmasterName} onChange={event => setWeighmasterName(event.target.value)} /></div></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium">结算重量口径</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={basis} onChange={event => { setBasis(event.target.value); setBasisWeight(''); }}>{BASIS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {basis !== 'RECEIVING' && <div><label className="mb-1 block text-sm font-medium">对应重量（吨）*</label><Input type="number" min="0" step="0.001" value={basisWeight} onChange={event => setBasisWeight(event.target.value)} /></div>}
      </div>
      <p className="text-xs text-muted-foreground">这里确定本张磅单内部的有效净重；运单最终用于入出库、结算的完整磅单，在运单详情中分别选用并留痕。</p>
      <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={event => setRemarks(event.target.value)} /></div>
      <div className="space-y-3"><div><label className="block text-sm font-medium">磅单附件 *</label><p className="mt-1 text-xs text-muted-foreground">上传现场磅单照片、设备磅单或扫描件，支持 JPG/PNG/WEBP/PDF，单个文件不超过 20 MB</p></div><label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed p-5 text-sm text-primary hover:bg-primary/5"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /><Paperclip className="mr-2 h-4 w-4" />选择磅单附件</label>{files.length > 0 && <div className="space-y-2">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"><span className="min-w-0 truncate">{file.name}<span className="ml-2 text-xs text-muted-foreground">{formatFileSize(file.size)}</span></span><button type="button" className="ml-3 text-destructive" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></button></div>)}</div>}</div>
    </Card>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.push('/dashboard/weighbridge')}>取消</Button><Button disabled={saving || !waybillId} onClick={() => void submit()}>{saving ? '创建中...' : existingAtStage.length ? '确认追加磅单' : '创建磅单'}</Button></div>
  </div>;
}

function stageAllowed(stage: 'SHIPPING' | 'RECEIVING', status?: string) {
  if (!status || status === 'CANCELLED') return false;
  return stage === 'SHIPPING' || ['ARRIVED', 'SIGNED'].includes(status);
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
