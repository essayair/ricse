'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, FileText, Plus, Scale, Truck, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTimeToSecond } from '@/lib/date-time';

interface Ticket {
  id: string; ticketNo: string; status: string; weighingStage: string; sequence: number; isSupplementary: boolean;
  additionReason: string | null; abnormal: boolean; ticketDate: string; plateNo: string | null;
  materialName: string | null; materialSpec: string | null; shipperName: string | null; receiverName: string | null;
  packageCount: number | null; driverName: string | null; weighmasterName: string | null; plannedQuantity: string;
  grossWeight: string | null; tareWeight: string | null; netWeight: string | null; remarks: string | null;
  reviewedAt: string | null; creator: { id: string; name: string }; reviewer: { id: string; name: string } | null;
  records: Array<{ id: string; weighingType: string; sequence: number; weight: string; weighedAt: string }>;
  attachments: Array<{ id: string; originalName: string }>;
}
interface Selection {
  id: string; purpose: string; weighTicketId: string; quantity: string; reason: string | null; selectedAt: string;
  selector: { id: string; name: string };
  weighTicket: { id: string; ticketNo: string; weighingStage: string; sequence: number; netWeight: string | null; status: string };
}
interface ManagementFile {
  id: string; waybillNo: string; status: string; plateNo: string | null; driverName: string | null; driverPhone: string | null;
  totalQuantity: string; originLocation: string | null; destinationLocation: string | null;
  dispatchNotice: { id: string; noticeNo: string; type: string; order: { id: string; orderNo: string; name: string; contract: { id: string; contractNo: string; title: string } } };
  lineItems: Array<{ id: string; materialName: string | null; materialId: string; quantity: string; unit: string }>;
  weighTickets: Ticket[]; weightSelections: Selection[];
  weighTask: { id: string; taskNo: string; status: string; plannedQuantity: string; completedAt: string | null; attachments: EvidenceAttachment[] };
}
interface EvidenceAttachment { id: string; originalName: string; category: string; sourceType: string | null; evidenceNode: string | null; capturedAt: string | null; createdAt: string; uploader: { name: string } | null }

const STATUS: Record<string, string> = { PENDING: '待称重', WEIGHING: '称重中', COMPLETED: '待复核', REVIEWED: '已复核', VOIDED: '已作废' };
const TASK_STATUS: Record<string, string> = { PENDING_WEIGHING: '待过磅', IN_PROGRESS: '过磅中', PENDING_CONFIRMATION: '待确认', COMPLETED: '已完成', EXCEPTION: '异常处理中', VOIDED: '已作废' };
const EVIDENCE_CATEGORY: Record<string, string> = { VEHICLE_PLATE: '车牌与车头', CARGO_STATE: '货物与车厢', ON_SCALE: '车辆上磅', SCALE_DISPLAY: '地磅显示屏', EMPTY_CARRIAGE: '空车状态', OTHER: '其他影像' };
const EVIDENCE_SOURCE: Record<string, string> = { WEB_UPLOAD: '电脑上传', RICSE_IMPORT: '系统导入', THIRD_PARTY_WATERMARK: '第三方水印相机', EXTERNAL: '外部影像', MINI_PROGRAM_CAPTURE: '小程序现场拍摄' };

export default function WeighbridgeManagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ManagementFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [evidenceCategory, setEvidenceCategory] = useState('VEHICLE_PLATE');
  const [evidenceSource, setEvidenceSource] = useState('WEB_UPLOAD');
  const load = useCallback(async () => {
    try { setItem(await api.get<ManagementFile>(`/weigh-tickets/management-files/${id}`)); }
    catch (error: any) { alert(error.message); router.push('/dashboard/weighbridge'); }
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);

  const selectEffective = async (ticket: Ticket) => {
    if (!item || currentSelection(item)?.weighTicketId === ticket.id) return;
    let reason: string | undefined;
    if (currentSelection(item)) {
      reason = prompt('请输入更换结算入库磅单的原因')?.trim() || undefined;
      if (!reason) return;
    }
    if (!confirm(`确定将 ${ticket.ticketNo} 选为结算入库磅单？该净重将同步用于库存执行与结算。`)) return;
    try {
      await api.patch(`/weigh-tickets/waybills/${item.id}/effective-ticket`, { weighTicketId: ticket.id, reason });
      await load();
    } catch (error: any) { alert(error.message); }
  };

  const uploadEvidence = async (files: FileList | null) => {
    if (!files?.length || !item) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file); body.append('category', evidenceCategory); body.append('sourceType', evidenceSource);
        body.append('evidenceNode', EVIDENCE_CATEGORY[evidenceCategory] || evidenceCategory);
        body.append('capturedAt', new Date().toISOString());
        await api.upload(`/weigh-tickets/tasks/${item.weighTask.id}/attachments`, body);
      }
      await load();
    } catch (error: any) { alert(error.message || '现场影像上传失败'); }
    finally { setSaving(false); }
  };

  const viewEvidence = async (attachmentId: string) => {
    try { await openStoredAttachment(`/weigh-tickets/task-attachments/${attachmentId}/view-url`); }
    catch (error: any) { alert(error.message || '现场影像打开失败'); }
  };

  if (!item) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const current = currentSelection(item);
  const shipping = activeTickets(item, 'SHIPPING');
  const receiving = activeTickets(item, 'RECEIVING');
  const difference = latestReviewed(shipping) && latestReviewed(receiving)
    ? Number(latestReviewed(receiving)!.netWeight) - Number(latestReviewed(shipping)!.netWeight)
    : null;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/weighbridge')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{item.weighTask.taskNo}</h1><Badge variant="outline">{item.dispatchNotice.type === 'PURCHASE' ? '采购' : '销售'}</Badge><Badge variant="secondary">{TASK_STATUS[item.weighTask.status] || item.weighTask.status}</Badge></div><p className="mt-1 font-mono text-sm text-primary">物流运单 {item.waybillNo}</p></div></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => router.push(`/dashboard/waybills/${item.id}`)}><Truck className="mr-1 h-4 w-4" />查看物流运单</Button><Button onClick={() => router.push(`/dashboard/weighbridge/create?waybillId=${item.id}`)}><Plus className="mr-1 h-4 w-4" />新增称重磅单</Button></div>
    </div>

    <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">过磅现场证据</h2><p className="mt-1 text-xs text-muted-foreground">订单计划重量仅写入影像元数据；实际重量以地磅显示屏照片和称重记录为准。</p></div>{!['COMPLETED', 'VOIDED'].includes(item.weighTask.status) && <div className="flex flex-wrap gap-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={evidenceCategory} onChange={event => setEvidenceCategory(event.target.value)}>{Object.entries(EVIDENCE_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="h-9 rounded-md border bg-background px-2 text-sm" value={evidenceSource} onChange={event => setEvidenceSource(event.target.value)}>{Object.entries(EVIDENCE_SOURCE).filter(([value]) => value !== 'MINI_PROGRAM_CAPTURE').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm text-primary"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp" disabled={saving} onChange={event => { void uploadEvidence(event.currentTarget.files); event.currentTarget.value = ''; }} /><Upload className="mr-1 h-4 w-4" />上传影像</label></div>}</div>{item.weighTask.attachments.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{item.weighTask.attachments.map(attachment => <button key={attachment.id} className="rounded-md border p-3 text-left hover:bg-muted" onClick={() => void viewEvidence(attachment.id)}><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{attachment.originalName}</span><Eye className="h-4 w-4 text-muted-foreground" /></div><div className="mt-2 text-xs text-muted-foreground">{EVIDENCE_CATEGORY[attachment.category] || attachment.category} · {EVIDENCE_SOURCE[attachment.sourceType || ''] || attachment.sourceType || '未知来源'}</div><div className="mt-1 text-xs text-muted-foreground">{attachment.uploader?.name || '-'} · {formatDateTimeToSecond(attachment.capturedAt || attachment.createdAt)}</div></button>)}</div> : <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无过磅现场影像</div>}</Card>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-4 p-5 lg:col-span-2"><h2 className="font-semibold">磅单基本信息</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="物流运单" value={item.waybillNo} /><Field label="车牌号" value={item.plateNo || '-'} /><Field label="司机" value={item.driverName || '-'} /><Field label="计划数量" value={`${number(item.totalQuantity)} 吨`} /><Field label="起运地" value={item.originLocation || '-'} /><Field label="目的地" value={item.destinationLocation || '-'} /><Field label="货物" value={materialNames(item)} /><Field label="发/收磅单" value={`${shipping.length} / ${receiving.length} 张`} /></div></Card>
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="font-semibold">上游业务单据</h2></div><button className="w-full text-left" onClick={() => router.push(`/dashboard/dispatch-notices/${item.dispatchNotice.id}`)}><div className="font-medium">{item.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-primary">{item.dispatchNotice.order.orderNo} · {item.dispatchNotice.noticeNo}</div><div className="mt-2 text-xs text-muted-foreground">合同 {item.dispatchNotice.order.contract.contractNo} · {item.dispatchNotice.order.contract.title}</div></button></Card>
    </div>

    <Card className={`p-5 ${current ? 'border-primary/40 bg-primary/5' : 'border-amber-300 bg-amber-50/50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CheckCircle2 className={`h-5 w-5 ${current ? 'text-primary' : 'text-amber-600'}`} /><h2 className="font-semibold">当前结算入库磅单</h2></div><p className="mt-1 text-xs text-muted-foreground">唯一选用口径：该磅单净重同时同步到库存执行与结算，不允许分别选择。</p></div>{current ? <Badge>已确定</Badge> : <Badge variant="outline">待选择</Badge>}</div>
      {current ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Field label="磅单编号" value={current.weighTicket.ticketNo} /><Field label="称重节点" value={stageLabel(item, current.weighTicket.weighingStage)} /><Field label="执行数量" value={`${number(current.quantity)} 吨`} /><Field label="选用人" value={current.selector.name} /><Field label="选用时间" value={formatDateTimeToSecond(current.selectedAt)} />{current.reason && <div className="sm:col-span-2 lg:col-span-5"><Field label="选用/变更原因" value={current.reason} /></div>}</div> : <div className="mt-4 text-sm text-amber-800">完成并复核至少一张称重磅单后，请在下方选择结算入库磅单。</div>}
    </Card>

    {difference !== null && <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="text-sm font-medium">发货与收货最新已复核磅差</div><div className="mt-1 text-xs text-muted-foreground">收货净重 − 发货净重</div></div><div className={`text-xl font-bold ${difference === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{difference > 0 ? '+' : ''}{number(difference)} 吨</div></Card>}

    <div className="grid gap-5 xl:grid-cols-2">
      {(['SHIPPING', 'RECEIVING'] as const).map(stage => {
        const tickets = activeTickets(item, stage);
        const canCreate = stage === 'SHIPPING' || ['ARRIVED', 'SIGNED'].includes(item.status);
        return <Card key={stage} className="overflow-hidden"><div className="flex items-center justify-between border-b bg-muted/30 p-5"><div><h2 className="font-semibold">{stageLabel(item, stage)}</h2><p className="mt-1 text-xs text-muted-foreground">共 {tickets.length} 张完整称重磅单；每张内部可保留多次毛重、皮重记录</p></div>{canCreate ? <Button size="sm" variant={tickets.length ? 'outline' : 'default'} onClick={() => router.push(`/dashboard/weighbridge/create?waybillId=${item.id}&stage=${stage}`)}><Plus className="mr-1 h-4 w-4" />{tickets.length ? '追加磅单' : '创建磅单'}</Button> : <Badge variant="outline">到达后可录入</Badge>}</div>
          <div className="space-y-3 p-4">{tickets.length ? tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} selected={current?.weighTicketId === ticket.id} onOpen={() => router.push(`/dashboard/weighbridge/${ticket.id}`)} onSelect={() => void selectEffective(ticket)} />) : <div className="py-10 text-center text-sm text-muted-foreground"><Scale className="mx-auto mb-2 h-7 w-7 opacity-40" />暂无{stageLabel(item, stage)}</div>}</div>
        </Card>;
      })}
    </div>
  </div>;
}

function TicketCard({ ticket, selected, onOpen, onSelect }: { ticket: Ticket; selected: boolean; onOpen: () => void; onSelect: () => void }) {
  return <div className={`rounded-lg border p-4 ${selected ? 'border-primary bg-primary/5' : ''}`}><button className="w-full text-left" onClick={onOpen}><div className="flex items-center justify-between gap-3"><div><div className="font-mono font-semibold text-primary">{ticket.ticketNo}</div><div className="mt-1 text-xs text-muted-foreground">第 {ticket.sequence} 张 · {formatDateTimeToSecond(ticket.ticketDate)}</div></div><div className="flex items-center gap-1">{ticket.isSupplementary && <Badge variant="outline">追加</Badge>}<Badge variant={ticket.status === 'VOIDED' || ticket.abnormal ? 'destructive' : 'secondary'}>{ticket.abnormal ? '磅差异常' : STATUS[ticket.status]}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground" /></div></div><div className="mt-4 grid grid-cols-3 gap-3 rounded-md bg-muted/50 p-3 text-sm"><Field label="毛重" value={weight(ticket.grossWeight)} /><Field label="皮重" value={weight(ticket.tareWeight)} /><Field label="净重" value={weight(ticket.netWeight)} /></div><div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><div>发货单位：{ticket.shipperName || '-'}</div><div>收货单位：{ticket.receiverName || '-'}</div><div>称重记录：{ticket.records.length} 条</div><div>附件：{ticket.attachments.length} 份</div></div>{ticket.additionReason && <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">追加原因：{ticket.additionReason}</div>}</button>{ticket.status === 'REVIEWED' && <div className="mt-4 border-t pt-3"><Button className="w-full" size="sm" variant={selected ? 'default' : 'outline'} disabled={selected} onClick={onSelect}>{selected ? '当前结算入库磅单' : '选为结算入库磅单'}</Button></div>}</div>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value}</div></div>; }
function currentSelection(item: ManagementFile) { return item.weightSelections.find(value => value.purpose === 'INVENTORY') || item.weightSelections[0]; }
function activeTickets(item: ManagementFile, stage: string) { return item.weighTickets.filter(ticket => ticket.weighingStage === stage && ticket.status !== 'VOIDED'); }
function latestReviewed(tickets: Ticket[]) { return [...tickets].reverse().find(ticket => ticket.status === 'REVIEWED' && ticket.netWeight); }
function number(value: string | number) { return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 }); }
function weight(value: string | null) { return value ? `${number(value)} 吨` : '-'; }
function materialNames(item: ManagementFile) { return [...new Set(item.lineItems.map(line => line.materialName || line.materialId))].join('、') || '-'; }
function stageLabel(item: ManagementFile, stage: string) {
  if (item.dispatchNotice.type === 'PURCHASE') return stage === 'SHIPPING' ? '供应商发货称重' : '我方收货称重';
  return stage === 'SHIPPING' ? '我方发货称重' : '客户收货称重';
}
