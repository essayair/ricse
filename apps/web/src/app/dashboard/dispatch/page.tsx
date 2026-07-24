'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDot,
  Clock3, List, MapPin, Plus, RefreshCw, Search, Truck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';

interface Waybill {
  id: string;
  waybillNo: string;
  status: string;
  freightMode: string;
  carrierName: string | null;
  plateNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  totalQuantity: string;
  plannedDepartureAt: string | null;
  plannedArrivalAt: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  signedAt: string | null;
  originLocation: string | null;
  destinationLocation: string | null;
  lineItems: Array<{ materialName: string | null; quantity: string; unit: string }>;
  dispatchNotice: {
    noticeNo: string;
    type: string;
    order: { orderNo: string; name: string; contract: { contractNo: string; title: string } };
  };
}

type BoardKey = 'UNASSIGNED' | 'READY' | 'IN_TRANSIT' | 'ARRIVED' | 'SIGNED';

const COLUMNS: Array<{ key: BoardKey; label: string; description: string }> = [
  { key: 'UNASSIGNED', label: '待调度', description: '缺少车辆或司机' },
  { key: 'READY', label: '待发运', description: '调度完成，等待发车' },
  { key: 'IN_TRANSIT', label: '在途', description: '运输执行中' },
  { key: 'ARRIVED', label: '已到达', description: '等待签收确认' },
  { key: 'SIGNED', label: '已签收', description: '运输已完成' },
];

export default function DispatchPage() {
  const router = useRouter();
  const [items, setItems] = useState<Waybill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [onlyException, setOnlyException] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: Waybill[] }>('/waybills');
      setItems(data.items || []);
    } catch (error: any) {
      alert(error.message || '物流运单加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeItems = useMemo(() => items.filter(item => item.status !== 'CANCELLED'), [items]);
  const filtered = useMemo(() => activeItems.filter(item => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword || [
      item.waybillNo, item.plateNo, item.driverName, item.dispatchNotice.noticeNo,
      item.dispatchNotice.order.name, item.dispatchNotice.order.orderNo, item.dispatchNotice.order.contract.contractNo,
      item.dispatchNotice.order.contract.title,
    ].some(value => value?.toLowerCase().includes(keyword));
    const matchesType = !type || item.dispatchNotice.type === type;
    return matchesSearch && matchesType && (!onlyException || exceptionText(item));
  }), [activeItems, onlyException, search, type]);

  const transition = async (event: React.MouseEvent, item: Waybill, status: string, label: string) => {
    event.stopPropagation();
    if (!confirm(`确定${label} ${item.waybillNo}？`)) return;
    setUpdatingId(item.id);
    try {
      await api.patch(`/waybills/${item.id}/status`, { status });
      await load();
    } catch (error: any) {
      alert(error.message || `${label}失败`);
    } finally {
      setUpdatingId(null);
    }
  };

  const exceptions = activeItems.filter(item => exceptionText(item)).length;
  const inTransitQuantity = activeItems
    .filter(item => item.status === 'IN_TRANSIT')
    .reduce((sum, item) => sum + Number(item.totalQuantity), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">物流调度工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">完成车辆调度、发运、在途跟踪、到达和签收闭环</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/waybills')}>
            <List className="mr-1 h-4 w-4" />运单列表
          </Button>
          <Button onClick={() => router.push('/dashboard/waybills/create')}>
            <Plus className="mr-1 h-4 w-4" />新建物流运单
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Summary icon={Truck} label="有效运单" value={activeItems.length} note="不含已取消" />
        <Summary icon={CircleDot} label="待调度" value={activeItems.filter(item => boardKey(item) === 'UNASSIGNED').length} note="需补车辆司机" />
        <Summary icon={Clock3} label="在途车辆" value={activeItems.filter(item => item.status === 'IN_TRANSIT').length} note={`${inTransitQuantity.toLocaleString()} 吨在途`} />
        <Summary icon={CheckCircle2} label="已签收" value={activeItems.filter(item => item.status === 'SIGNED').length} note="运输闭环" />
        <Summary icon={AlertTriangle} label="调度异常" value={exceptions} note="超时或资料缺失" danger={exceptions > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索运单、通知、合同、车辆或司机" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={event => setType(event.target.value)}>
          <option value="">全部业务类型</option>
          <option value="PURCHASE">采购运输</option>
          <option value="SALES">销售运输</option>
        </select>
        <Button variant={onlyException ? 'default' : 'outline'} onClick={() => setOnlyException(value => !value)}>
          <AlertTriangle className="mr-1 h-4 w-4" />只看异常
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void load()} title="刷新">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1480px] grid-cols-5 gap-4">
          {COLUMNS.map(column => {
            const rows = filtered.filter(item => boardKey(item) === column.key);
            return (
              <section key={column.key} className="rounded-xl bg-muted/30 p-3">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold">{column.label}</h2>
                    <p className="text-[11px] text-muted-foreground">{column.description}</p>
                  </div>
                  <Badge variant="secondary">{rows.length}</Badge>
                </div>
                <div className="space-y-3">
                  {!rows.length ? (
                    <div className="rounded-lg border border-dashed bg-background/60 p-8 text-center text-xs text-muted-foreground">
                      {loading ? '加载中...' : '暂无运单'}
                    </div>
                  ) : rows.map(item => (
                    <WaybillCard
                      key={item.id}
                      item={item}
                      updating={updatingId === item.id}
                      onOpen={() => router.push(`/dashboard/waybills/${item.id}`)}
                      onTransition={transition}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WaybillCard({ item, updating, onOpen, onTransition }: {
  item: Waybill;
  updating: boolean;
  onOpen: () => void;
  onTransition: (event: React.MouseEvent, item: Waybill, status: string, label: string) => void;
}) {
  const exception = exceptionText(item);
  const key = boardKey(item);
  return (
    <Card className={`cursor-pointer p-4 transition-colors hover:border-primary ${exception ? 'border-warning/60' : ''}`} onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-xs font-medium text-primary">{item.waybillNo}</div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {item.dispatchNotice.type === 'PURCHASE' ? '采购' : '销售'}
        </Badge>
      </div>
      <div className="mt-2 font-medium">{item.plateNo || '待分配车辆'}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {item.driverName || '待分配司机'}{item.driverPhone ? ` · ${item.driverPhone}` : ''}
      </div>
      <div className="mt-3 rounded-md bg-muted/50 p-2 text-xs">
        <div className="truncate">{item.lineItems?.[0]?.materialName || '未记录物料'}</div>
        <div className="mt-1 text-muted-foreground">{quantityText(item)} · {item.freightMode === 'SELF' ? '自营' : item.carrierName || '委外'}</div>
      </div>
      <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{item.originLocation || '-'} → {item.destinationLocation || '-'}</span></div>
        <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3 shrink-0" /><span>{scheduleText(item)}</span></div>
        <div className="truncate font-medium text-foreground">{item.dispatchNotice.order.name}</div>
        <div className="truncate">{item.dispatchNotice.noticeNo} · {item.dispatchNotice.order.orderNo}</div>
        <div className="truncate">{item.dispatchNotice.order.contract.contractNo} · {item.dispatchNotice.order.contract.title}</div>
      </div>
      {exception && (
        <div className="mt-3 flex items-start gap-1 rounded bg-warning-bg px-2 py-1.5 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{exception}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        {key === 'UNASSIGNED' && <Button size="sm" variant="outline" disabled={updating} onClick={event => { event.stopPropagation(); onOpen(); }}>去调度<ArrowRight className="ml-1 h-3 w-3" /></Button>}
        {key === 'READY' && <Button size="sm" disabled={updating} onClick={event => onTransition(event, item, 'IN_TRANSIT', '确认发运')}>确认发运</Button>}
        {key === 'IN_TRANSIT' && <Button size="sm" disabled={updating} onClick={event => onTransition(event, item, 'ARRIVED', '确认到达')}>确认到达</Button>}
        {key === 'ARRIVED' && <Button size="sm" disabled={updating} onClick={event => onTransition(event, item, 'SIGNED', '确认签收')}>确认签收</Button>}
        {key === 'SIGNED' && <span className="text-xs text-success">已完成运输</span>}
      </div>
    </Card>
  );
}

function Summary({ icon: Icon, label, value, note, danger = false }: {
  icon: React.ElementType; label: string; value: number; note: string; danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${danger ? 'text-destructive' : 'text-primary'}`} />
      </div>
      <div className={`mt-2 text-2xl font-bold ${danger ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </Card>
  );
}

function boardKey(item: Waybill): BoardKey {
  if (item.status === 'PENDING') return item.plateNo && item.driverName ? 'READY' : 'UNASSIGNED';
  return item.status as BoardKey;
}

function exceptionText(item: Waybill) {
  const now = Date.now();
  if (item.status === 'PENDING' && item.plannedDepartureAt && new Date(item.plannedDepartureAt).getTime() < now) return '已超过计划发运时间';
  if (item.status === 'IN_TRANSIT' && item.plannedArrivalAt && new Date(item.plannedArrivalAt).getTime() < now) return '已超过预计到达时间';
  if (item.status === 'PENDING' && (!item.plateNo || !item.driverName)) return '车辆或司机信息未完成';
  return '';
}

function scheduleText(item: Waybill) {
  if (item.status === 'IN_TRANSIT') return `预计到达 ${formatTime(item.plannedArrivalAt)}`;
  if (item.status === 'ARRIVED' || item.status === 'SIGNED') return `到达 ${formatTime(item.arrivedAt)}`;
  return `计划发运 ${formatTime(item.plannedDepartureAt)}`;
}

function quantityText(item: Waybill) {
  if (!item.lineItems?.length) return `${Number(item.totalQuantity).toLocaleString()} ${unitLabel('TON')}`;
  const totals = new Map<string, number>();
  item.lineItems.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, value]) => `${value.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function formatTime(value: string | null) {
  if (!value) return '未设置';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
