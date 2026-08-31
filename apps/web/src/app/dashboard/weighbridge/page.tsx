'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, Plus, Search, Scale } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ChildTicket {
  id: string; ticketNo: string; status: string; weighingStage: string; sequence: number;
  abnormal: boolean; netWeight: string | null; materialName: string | null; ticketDate: string;
}
interface WeightSelection {
  id: string; purpose: string; weighTicketId: string; quantity: string; selectedAt: string;
  selector: { id: string; name: string };
  weighTicket: { id: string; ticketNo: string; weighingStage: string; sequence: number; netWeight: string | null; status: string };
}
interface ManagementFile {
  id: string; waybillNo: string; status: string; plateNo: string | null; driverName: string | null;
  totalQuantity: string; originLocation: string | null; destinationLocation: string | null; createdAt: string;
  dispatchNotice: { noticeNo: string; type: string; order: { orderNo: string; name: string; contract: { contractNo: string; title: string } } };
  lineItems: Array<{ id: string; materialName: string | null; materialId: string; quantity: string; unit: string }>;
  weighTickets: ChildTicket[];
  weightSelections: WeightSelection[];
  weighTask: { id: string; taskNo: string; status: string; plannedQuantity: string; createdAt: string };
}

const TICKET_STATUS: Record<string, string> = {
  PENDING: '待称重', WEIGHING: '称重中', COMPLETED: '待复核', REVIEWED: '已复核', VOIDED: '已作废',
};

export default function WeighbridgePage() {
  const router = useRouter();
  const [items, setItems] = useState<ManagementFile[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [abnormal, setAbnormal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (abnormal) params.set('abnormal', 'true');
    api.get<{ items: ManagementFile[] }>(`/weigh-tickets/management-files?${params}`)
      .then(data => setItems(data.items))
      .catch(error => alert(error.message));
  }, [search, status, abnormal]);

  const summary = useMemo(() => ({
    tickets: items.reduce((sum, item) => sum + item.weighTickets.length, 0),
    pending: items.filter(item => !effectiveSelection(item)).length,
    abnormal: items.filter(item => item.weighTickets.some(ticket => ticket.abnormal)).length,
  }), [items]);

  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">磅单管理</h1><p className="mt-1 text-sm text-muted-foreground">统一管理过磅任务、现场影像、发货称重、收货称重、磅单和执行口径</p></div>
      <Button onClick={() => router.push('/dashboard/weighbridge/create')}><Plus className="mr-1 h-4 w-4" />新建称重磅单</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Summary label="过磅任务" value={items.length} />
      <Summary label="称重磅单" value={summary.tickets} />
      <Summary label="待确定结算入库磅单" value={summary.pending} warn />
      <Summary label="存在磅差异常" value={summary.abnormal} danger />
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索运单、磅单、执行通知、批次、车牌或货物" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">全部子磅单状态</option>{Object.entries(TICKET_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Button variant={abnormal ? 'default' : 'outline'} onClick={() => setAbnormal(value => !value)}><AlertTriangle className="mr-1 h-4 w-4" />只看异常</Button>
    </div>
    {!items.length ? <Card><div className="p-12 text-center text-muted-foreground"><Scale className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无磅单信息</div></Card> : <Card className="overflow-hidden">
      <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
          <th className="px-4 py-3">序号</th><th className="px-4 py-3">任务 / 物流运单</th><th className="px-4 py-3">业务类型</th><th className="px-4 py-3">执行批次 / 通知</th><th className="px-4 py-3">车牌 / 司机</th><th className="px-4 py-3">货物</th><th className="px-4 py-3 text-right">计划数量（吨）</th><th className="px-4 py-3">发货称重</th><th className="px-4 py-3">收货称重</th><th className="px-4 py-3">结算入库磅单</th><th className="px-4 py-3">状态</th><th className="px-4 py-3"></th>
        </tr></thead>
        <tbody>{items.map((item, index) => {
          const shipping = stageTickets(item, 'SHIPPING');
          const receiving = stageTickets(item, 'RECEIVING');
          const effective = effectiveSelection(item);
          const state = managementState(item);
          return <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/weighbridge/management/${item.id}`)}>
            <td className="px-4 py-4 text-center">{index + 1}</td>
            <td className="px-4 py-4"><div className="font-mono font-medium text-primary">{item.weighTask.taskNo}</div><div className="mt-1 font-mono text-xs">{item.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{item.originLocation || '-'} → {item.destinationLocation || '-'}</div></td>
            <td className="px-4 py-4"><Badge variant="outline">{item.dispatchNotice.type === 'PURCHASE' ? '采购' : '销售'}</Badge></td>
            <td className="px-4 py-4"><div className="font-medium">{item.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.dispatchNotice.order.orderNo} · {item.dispatchNotice.noticeNo}</div></td>
            <td className="px-4 py-4"><div>{item.plateNo || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.driverName || '待补录司机'}</div></td>
            <td className="max-w-56 px-4 py-4"><div className="truncate" title={materialNames(item)}>{materialNames(item)}</div></td>
            <td className="px-4 py-4 text-right font-medium">{number(item.totalQuantity)}</td>
            <td className="px-4 py-4"><StageSummary tickets={shipping} /></td>
            <td className="px-4 py-4"><StageSummary tickets={receiving} /></td>
            <td className="px-4 py-4">{effective ? <div><div className="font-mono font-medium text-primary">{effective.weighTicket.ticketNo}</div><div className="mt-1 text-xs text-muted-foreground">{stageName(item, effective.weighTicket.weighingStage)} · {number(effective.quantity)} 吨</div></div> : <span className="text-amber-700">尚未确定</span>}</td>
            <td className="px-4 py-4"><Badge variant={state.variant}>{state.label}</Badge>{item.weighTickets.some(ticket => ticket.abnormal) && <Badge className="ml-1" variant="destructive">异常</Badge>}</td>
            <td className="px-4 py-4"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
          </tr>;
        })}</tbody>
      </table></div>
    </Card>}
  </div>;
}

function StageSummary({ tickets }: { tickets: ChildTicket[] }) {
  const latest = tickets[tickets.length - 1];
  if (!latest) return <span className="text-muted-foreground">未录入</span>;
  return <div><div>{tickets.length} 张 · 最新 {latest.netWeight ? `${number(latest.netWeight)} 吨` : '待称重'}</div><div className="mt-1 text-xs text-muted-foreground">{latest.ticketNo} · {TICKET_STATUS[latest.status]}</div></div>;
}
function Summary({ label, value, danger = false, warn = false }: { label: string; value: number; danger?: boolean; warn?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-bold ${danger && value ? 'text-destructive' : warn && value ? 'text-amber-700' : ''}`}>{value}</div></Card>;
}
function effectiveSelection(item: ManagementFile) { return item.weightSelections.find(value => value.purpose === 'INVENTORY') || item.weightSelections[0]; }
function stageTickets(item: ManagementFile, stage: string) { return item.weighTickets.filter(ticket => ticket.weighingStage === stage && ticket.status !== 'VOIDED'); }
function materialNames(item: ManagementFile) { return [...new Set(item.lineItems.map(line => line.materialName || line.materialId))].join('、') || '-'; }
function number(value: string | number) { return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 }); }
function stageName(item: ManagementFile, stage: string) {
  if (item.dispatchNotice.type === 'PURCHASE') return stage === 'SHIPPING' ? '供应商发货称重' : '我方收货称重';
  return stage === 'SHIPPING' ? '我方发货称重' : '客户收货称重';
}
function managementState(item: ManagementFile): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (effectiveSelection(item)) return { label: '已确定', variant: 'default' };
  if (item.weighTickets.some(ticket => ticket.status === 'REVIEWED')) return { label: '待选择依据', variant: 'outline' };
  if (item.weighTickets.some(ticket => ticket.status === 'COMPLETED')) return { label: '待复核', variant: 'secondary' };
  return { label: '称重处理中', variant: 'secondary' };
}
