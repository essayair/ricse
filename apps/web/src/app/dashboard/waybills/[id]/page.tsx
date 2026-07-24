'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleDot, Clock3, FileText, MapPin, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';
import { AttachmentPanel, BusinessAttachment } from '@/components/attachment-panel';

interface Vehicle { id: string; plateNo: string; driverName?: string; driverPhone?: string }
interface CarrierProfile { id: string; partnerId: string; partner: { id: string; code: string; name: string } }
interface Waybill {
  id: string; waybillNo: string; status: string; freightMode: string; totalQuantity: string;
  vehicleId: string | null; carrierPartnerId: string | null; carrierName: string | null; plateNo: string | null; driverName: string | null; driverPhone: string | null;
  originLocation: string | null; destinationLocation: string | null; plannedDepartureAt: string | null;
  plannedArrivalAt: string | null;
  departedAt: string | null; arrivedAt: string | null; signedAt: string | null; remarks: string | null;
  dispatchNotice: { id: string; noticeNo: string; type: string; order: { orderNo: string; name: string; contract: { contractNo: string; title: string } } };
  lineItems: Array<{ id: string; materialName: string | null; materialId: string; quantity: string; unit: string }>;
  weighTickets: Array<{ id: string; ticketNo: string; status: string; netWeight: string | null; settlementWeight: string | null; abnormal: boolean }>;
  attachments: BusinessAttachment[];
}
const STATUS: Record<string, string> = { PENDING: '待发运', IN_TRANSIT: '在途', ARRIVED: '已到达', SIGNED: '已签收', CANCELLED: '已取消' };
const ACTIONS: Record<string, Array<{ status: string; label: string; variant?: 'default' | 'destructive' | 'outline' }>> = {
  PENDING: [{ status: 'IN_TRANSIT', label: '确认发运' }, { status: 'CANCELLED', label: '取消运单', variant: 'destructive' }],
  IN_TRANSIT: [{ status: 'ARRIVED', label: '确认到达' }],
  ARRIVED: [{ status: 'SIGNED', label: '确认签收' }],
};
export default function WaybillDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const [waybill, setWaybill] = useState<Waybill | null>(null); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [vehicleId, setVehicleId] = useState(''); const [plateNo, setPlateNo] = useState(''); const [driverName, setDriverName] = useState(''); const [driverPhone, setDriverPhone] = useState(''); const [carrierPartnerId, setCarrierPartnerId] = useState(''); const [freightMode, setFreightMode] = useState('SELF'); const [plannedDepartureAt, setPlannedDepartureAt] = useState(''); const [plannedArrivalAt, setPlannedArrivalAt] = useState('');
  const load = async () => {
    try {
      const data = await api.get<Waybill>(`/waybills/${id}`); setWaybill(data); setVehicleId(data.vehicleId || ''); setPlateNo(data.plateNo || ''); setDriverName(data.driverName || ''); setDriverPhone(data.driverPhone || ''); setCarrierPartnerId(data.carrierPartnerId || ''); setFreightMode(data.freightMode); setPlannedDepartureAt(data.plannedDepartureAt ? data.plannedDepartureAt.slice(0, 16) : ''); setPlannedArrivalAt(data.plannedArrivalAt ? data.plannedArrivalAt.slice(0, 16) : '');
    } catch (error: any) { alert(error.message); router.push('/dashboard/waybills'); }
  };
  useEffect(() => { void load(); Promise.all([api.get<{ items: Vehicle[] }>('/partners/vehicles?status=ACTIVE&pageSize=100'), api.get<{ items: CarrierProfile[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200')]).then(([vehicleData, carrierData]) => { setVehicles(vehicleData.items); setCarriers(carrierData.items || []); }); }, [id]);
  const selectVehicle = (value: string) => { setVehicleId(value); const v = vehicles.find(item => item.id === value); if (v) { setPlateNo(v.plateNo); setDriverName(v.driverName || ''); setDriverPhone(v.driverPhone || ''); } };
  const saveAssignment = async () => { if (freightMode === 'THIRD_PARTY' && !carrierPartnerId) return alert('请选择已维护的物流承运商'); try { setWaybill(await api.patch(`/waybills/${id}/assignment`, { vehicleId: vehicleId || undefined, plateNo, driverName, driverPhone, carrierPartnerId: carrierPartnerId || undefined, freightMode, plannedDepartureAt: plannedDepartureAt || undefined, plannedArrivalAt: plannedArrivalAt || undefined })); } catch (error: any) { alert(error.message); } };
  const transition = async (status: string, label: string) => { if (!confirm(`确定${label}？`)) return; try { setWaybill(await api.patch(`/waybills/${id}/status`, { status })); } catch (error: any) { alert(error.message); } };
  if (!waybill) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  return <div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/dispatch')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{waybill.waybillNo}</h1><Badge>{STATUS[waybill.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">物流运单 · {waybill.freightMode === 'SELF' ? '自有运力' : '第三方承运'}</p></div></div><div className="flex gap-2">{(ACTIONS[waybill.status] || []).map(action => { const needsReceipt = action.status === 'SIGNED' && !waybill.attachments.some(item => item.category === 'RECEIPT'); return <Button key={action.status} variant={action.variant || 'default'} disabled={needsReceipt} title={needsReceipt ? '请先上传物流收货附件' : undefined} onClick={() => void transition(action.status, action.label)}>{needsReceipt ? '上传收货附件后签收' : action.label}</Button>; })}</div></div>
    <TransportProgress waybill={waybill} />
    <div className="grid gap-5 lg:grid-cols-3"><Card className="space-y-4 p-5 lg:col-span-2"><h2 className="font-semibold">运输信息</h2><div className="grid grid-cols-2 gap-4 md:grid-cols-3"><Field label="运输数量" value={`${Number(waybill.totalQuantity).toLocaleString()} 吨`} /><Field label="计划发运时间" value={formatDate(waybill.plannedDepartureAt)} /><Field label="预计到达时间" value={formatDate(waybill.plannedArrivalAt)} /><Field label="起运地点" value={waybill.originLocation || '-'} /><Field label="目的地点" value={waybill.destinationLocation || '-'} /><Field label="实际发运" value={formatDate(waybill.departedAt)} /><Field label="实际到达" value={formatDate(waybill.arrivedAt)} /><Field label="签收时间" value={formatDate(waybill.signedAt)} /><Field label="备注" value={waybill.remarks || '-'} /></div></Card><Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="font-semibold">上游执行通知</h2></div><button className="text-left" onClick={() => router.push(`/dashboard/dispatch-notices/${waybill.dispatchNotice.id}`)}><div className="font-medium">{waybill.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-primary">{waybill.dispatchNotice.noticeNo} · {waybill.dispatchNotice.order.orderNo}</div><div className="mt-1 text-xs text-muted-foreground">{waybill.dispatchNotice.order.contract.contractNo} · {waybill.dispatchNotice.order.contract.title}</div></button></Card></div>
    {waybill.status === 'PENDING' && <Card className="space-y-4 p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">车辆调度</h2><p className="text-xs text-muted-foreground">确认发运前必须填写车牌和司机；委外运输还需选择已维护的物流承运商</p></div><Button onClick={() => void saveAssignment()}>保存调度</Button></div><div className="grid gap-4 md:grid-cols-4"><div><label className="mb-1 block text-sm">运输方式</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={freightMode} onChange={e => { setFreightMode(e.target.value); if (e.target.value === 'SELF') setCarrierPartnerId(''); }}><option value="SELF">自有运力</option><option value="THIRD_PARTY">第三方承运</option></select></div><div><label className="mb-1 block text-sm">车辆</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={vehicleId} onChange={e => selectVehicle(e.target.value)}><option value="">手工填写</option>{vehicles.map(item => <option key={item.id} value={item.id}>{item.plateNo}</option>)}</select></div><div><label className="mb-1 block text-sm">计划发运时间</label><Input type="datetime-local" value={plannedDepartureAt} onChange={e => setPlannedDepartureAt(e.target.value)} /></div><div><label className="mb-1 block text-sm">预计到达时间</label><Input type="datetime-local" min={plannedDepartureAt || undefined} value={plannedArrivalAt} onChange={e => setPlannedArrivalAt(e.target.value)} /></div><div><label className="mb-1 block text-sm">车牌号 *</label><Input value={plateNo} onChange={e => setPlateNo(e.target.value)} /></div><div><label className="mb-1 block text-sm">司机 *</label><Input value={driverName} onChange={e => setDriverName(e.target.value)} /></div><div><label className="mb-1 block text-sm">司机电话</label><Input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} /></div>{freightMode === 'THIRD_PARTY' && <div><label className="mb-1 block text-sm">物流承运商 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={carrierPartnerId} onChange={e => setCarrierPartnerId(e.target.value)}><option value="">请选择</option>{carriers.map(item => <option key={item.id} value={item.partnerId}>{item.partner.code} · {item.partner.name}</option>)}</select></div>}</div></Card>}
    {waybill.status !== 'PENDING' && <Card className="grid gap-4 p-5 md:grid-cols-4"><Field label="车牌号" value={waybill.plateNo || '-'} /><Field label="司机" value={waybill.driverName || '-'} /><Field label="司机电话" value={waybill.driverPhone || '-'} /><Field label="承运单位" value={waybill.carrierName || (waybill.freightMode === 'SELF' ? '自有运力' : '-')} /></Card>}
    {['ARRIVED', 'SIGNED'].includes(waybill.status) && <AttachmentPanel title="物流收货附件" description="上传签收单、收货现场照片或交接凭证；确认签收前至少需要一份" attachments={waybill.attachments.filter(item => item.category === 'RECEIPT')} uploadPath={`/waybills/${waybill.id}/attachments`} attachmentPath="/waybills/attachments" canUpload canDelete={waybill.status === 'ARRIVED'} onChanged={load} />}
    {['ARRIVED', 'SIGNED'].includes(waybill.status) && <Card className="space-y-4 p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">关联磅单</h2><p className="mt-1 text-xs text-muted-foreground">运单到达后进行收货称重，支持毛重、皮重及多次复磅</p></div>{!waybill.weighTickets.some(item => item.status !== 'VOIDED') && <Button onClick={() => router.push(`/dashboard/weighbridge/create?waybillId=${waybill.id}`)}>创建磅单</Button>}</div>{waybill.weighTickets.length ? <div className="grid gap-3 md:grid-cols-2">{waybill.weighTickets.map(item => <button key={item.id} className="flex items-center justify-between rounded-md border p-3 text-left hover:bg-muted" onClick={() => router.push(`/dashboard/weighbridge/${item.id}`)}><div><div className="font-mono text-sm font-medium text-primary">{item.ticketNo}</div><div className="mt-1 text-xs text-muted-foreground">净重 {item.netWeight ? `${Number(item.netWeight).toLocaleString()} 吨` : '-'} · 结算 {item.settlementWeight ? `${Number(item.settlementWeight).toLocaleString()} 吨` : '-'}</div></div><div className="flex gap-2"><Badge variant={item.abnormal ? 'destructive' : 'outline'}>{item.abnormal ? '异常' : STATUS_WEIGH[item.status] || item.status}</Badge></div></button>)}</div> : <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">尚未建立磅单</div>}</Card>}
    <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">运单明细</h2></div><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-4 py-3 text-left">物料</th><th className="px-4 py-3 text-right">数量</th></tr></thead><tbody>{waybill.lineItems.map(item => <tr key={item.id} className="border-b"><td className="px-4 py-3">{item.materialName || item.materialId}</td><td className="px-4 py-3 text-right">{Number(item.quantity).toLocaleString()} {unitLabel(item.unit)}</td></tr>)}</tbody></table></Card>
  </div>;
}
const STATUS_WEIGH: Record<string, string> = { PENDING: '待称重', WEIGHING: '称重中', COMPLETED: '待复核', REVIEWED: '已复核', VOIDED: '已作废' };
function Field({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>; }

function TransportProgress({ waybill }: { waybill: Waybill }) {
  const steps = [
    { status: 'PENDING', label: '运单创建', icon: CircleDot, time: null },
    { status: 'IN_TRANSIT', label: '已发运', icon: Truck, time: waybill.departedAt },
    { status: 'ARRIVED', label: '已到达', icon: MapPin, time: waybill.arrivedAt },
    { status: 'SIGNED', label: '已签收', icon: CheckCircle2, time: waybill.signedAt },
  ];
  const order = ['PENDING', 'IN_TRANSIT', 'ARRIVED', 'SIGNED'];
  const currentIndex = waybill.status === 'CANCELLED' ? -1 : order.indexOf(waybill.status);
  return <Card className="p-5"><div className="grid grid-cols-4 gap-2">{steps.map((step, index) => { const active = index <= currentIndex; const Icon = step.icon; return <div key={step.status} className="relative flex flex-col items-center text-center">{index < steps.length - 1 && <div className={`absolute left-1/2 top-4 h-0.5 w-full ${index < currentIndex ? 'bg-primary' : 'bg-border'}`} />}<div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></div><div className={`mt-2 text-xs font-medium ${active ? '' : 'text-muted-foreground'}`}>{step.label}</div><div className="mt-1 text-[11px] text-muted-foreground">{step.time ? formatDate(step.time) : index === 0 ? '已建立' : '待完成'}</div></div>; })}</div></Card>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}
