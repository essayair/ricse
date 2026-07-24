'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, LayoutGrid, Plus, Search, Scale, TableProperties } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDateTimeToSecond } from '@/lib/date-time';

interface Ticket {
  id: string; ticketNo: string; direction: string; status: string; abnormal: boolean;
  ticketDate: string; plateNo: string | null; materialName: string | null; materialSpec: string | null;
  shipperName: string | null; receiverName: string | null; packageCount: number | null;
  driverName: string | null; weighmasterName: string | null; printedAt: string | null; remarks: string | null;
  selectedGrossRecordId: string | null; selectedTareRecordId: string | null;
  plannedQuantity: string; grossWeight: string | null; tareWeight: string | null;
  netWeight: string | null; settlementWeight: string | null; settlementBasis: string;
  varianceWeight: string | null; varianceRate: string | null; createdAt: string;
  creator: { name: string };
  records: Array<{ id: string; weighedAt: string }>;
  waybill: {
    waybillNo: string; plateNo: string | null;
    dispatchNotice: { noticeNo: string; order: { name: string; orderNo: string; contract: { contractNo: string } } };
  };
}

const STATUS: Record<string, string> = {
  PENDING: '待称重', WEIGHING: '称重中', COMPLETED: '已完成', REVIEWED: '已复核', VOIDED: '已作废',
};
const BASIS: Record<string, string> = {
  RECEIVING: '本次称重净重', SHIPPING: '发货重量', CUSTOMER: '客户收货', THIRD_PARTY: '第三方重量', MANUAL: '手工确认',
};

export default function WeighbridgePage() {
  const router = useRouter();
  const [items, setItems] = useState<Ticket[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [abnormal, setAbnormal] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('table');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (abnormal) params.set('abnormal', 'true');
    api.get<{ items: Ticket[] }>(`/weigh-tickets?${params}`).then(data => setItems(data.items)).catch(error => alert(error.message));
  }, [search, status, abnormal]);

  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-bold">磅单管理</h1><p className="mt-1 text-sm text-muted-foreground">支持毛重、皮重多次复磅，有效记录选择及结算重量口径管理</p></div>
      <Button onClick={() => router.push('/dashboard/weighbridge/create')}><Plus className="mr-1 h-4 w-4" />新建磅单</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Summary label="全部磅单" value={items.length} />
      <Summary label="称重中" value={items.filter(item => ['PENDING', 'WEIGHING'].includes(item.status)).length} />
      <Summary label="待复核" value={items.filter(item => item.status === 'COMPLETED').length} />
      <Summary label="磅差异常" value={items.filter(item => item.abnormal).length} danger />
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索磅单、车牌、货物或发收货单位" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Button variant={abnormal ? 'default' : 'outline'} onClick={() => setAbnormal(value => !value)}><AlertTriangle className="mr-1 h-4 w-4" />只看异常</Button>
      <div className="flex rounded-md border bg-background p-1">
        <Button className="h-8" size="sm" variant={view === 'cards' ? 'secondary' : 'ghost'} onClick={() => setView('cards')}><LayoutGrid className="mr-1 h-4 w-4" />完整卡片</Button>
        <Button className="h-8" size="sm" variant={view === 'table' ? 'secondary' : 'ghost'} onClick={() => setView('table')}><TableProperties className="mr-1 h-4 w-4" />横向表格</Button>
      </div>
    </div>
    {!items.length ? <Card><div className="p-12 text-center text-muted-foreground"><Scale className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无磅单数据</div></Card> : view === 'cards' ?
      <div className="space-y-4">{items.map((item, index) => <TicketCard key={item.id} item={item} index={index} onOpen={() => router.push(`/dashboard/weighbridge/${item.id}`)} />)}</div> :
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">下方表格包含全部字段，可横向滚动查看。</div>
        <div className="overflow-x-auto"><table className="min-w-[3000px] w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
            <th className="px-3 py-3">序号</th><th className="px-3 py-3">磅单日期</th><th className="px-3 py-3">磅单编号</th><th className="px-3 py-3">车牌号</th><th className="px-3 py-3">货物名称</th><th className="px-3 py-3">规格型号</th><th className="px-3 py-3">发货单位</th><th className="px-3 py-3">收货单位</th><th className="px-3 py-3 text-right">毛重（吨）</th><th className="px-3 py-3 text-right">皮重（吨）</th><th className="px-3 py-3 text-right">净重（吨）</th><th className="px-3 py-3 text-right">包/袋数</th><th className="px-3 py-3">毛重时间</th><th className="px-3 py-3">皮重时间</th><th className="px-3 py-3">打印时间</th><th className="px-3 py-3">司机姓名</th><th className="px-3 py-3">司磅员</th><th className="px-3 py-3">备注</th><th className="px-3 py-3">状态</th>
          </tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/weighbridge/${item.id}`)}>
            <td className="px-3 py-3 text-center">{index + 1}</td><td className="px-3 py-3">{dateOnly(item.ticketDate)}</td><td className="px-3 py-3 font-mono text-xs font-medium text-primary">{item.ticketNo}</td><td className="px-3 py-3">{item.plateNo || item.waybill.plateNo || '-'}</td><td className="max-w-48 truncate px-3 py-3" title={item.materialName || ''}>{item.materialName || '-'}</td><td className="max-w-48 truncate px-3 py-3" title={item.materialSpec || ''}>{item.materialSpec || '-'}</td><td className="max-w-56 truncate px-3 py-3" title={item.shipperName || ''}>{item.shipperName || '-'}</td><td className="max-w-56 truncate px-3 py-3" title={item.receiverName || ''}>{item.receiverName || '-'}</td><td className="px-3 py-3 text-right">{plainWeight(item.grossWeight)}</td><td className="px-3 py-3 text-right">{plainWeight(item.tareWeight)}</td><td className="px-3 py-3 text-right font-medium">{plainWeight(item.netWeight)}</td><td className="px-3 py-3 text-right">{item.packageCount ?? '-'}</td><td className="px-3 py-3 text-xs">{recordDate(item, item.selectedGrossRecordId)}</td><td className="px-3 py-3 text-xs">{recordDate(item, item.selectedTareRecordId)}</td><td className="px-3 py-3 text-xs">{dateTime(item.printedAt)}</td><td className="px-3 py-3">{item.driverName || '-'}</td><td className="px-3 py-3">{item.weighmasterName || item.creator.name}</td><td className="max-w-56 truncate px-3 py-3" title={item.remarks || ''}>{item.remarks || '-'}</td>
            <td className="px-3 py-3"><div className="flex items-center gap-2"><Badge variant={item.status === 'VOIDED' ? 'destructive' : 'secondary'}>{STATUS[item.status]}</Badge>{item.abnormal && <Badge variant="destructive">异常</Badge>}</div></td>
          </tr>)}</tbody>
        </table></div>
      </Card>}
  </div>;
}

function TicketCard({ item, index, onOpen }: { item: Ticket; index: number; onOpen: () => void }) {
  return <Card className="overflow-hidden transition-shadow hover:shadow-md">
    <button type="button" className="flex w-full items-center justify-between border-b bg-muted/30 px-5 py-3 text-left hover:bg-muted/50" onClick={onOpen}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex h-7 items-center justify-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">序号 {index + 1}</span>
        <span className="text-sm"><span className="text-muted-foreground">磅单编号：</span><span className="font-mono font-semibold text-primary">{item.ticketNo}</span></span>
        <span className="text-sm text-muted-foreground">磅单日期：{dateOnly(item.ticketDate)}</span>
        <Badge variant={item.status === 'VOIDED' ? 'destructive' : 'secondary'}>{STATUS[item.status]}</Badge>
        {item.abnormal && <Badge variant="destructive">磅差异常</Badge>}
      </div>
      <span className="flex shrink-0 items-center text-xs text-muted-foreground">查看详情<ChevronRight className="ml-1 h-4 w-4" /></span>
    </button>

    <div className="space-y-5 p-5">
      <section>
        <div className="mb-3 text-xs font-medium text-muted-foreground">运输与货物信息</div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="车牌号" value={item.plateNo || item.waybill.plateNo} missing />
          <Field label="司机姓名" value={item.driverName} missing />
          <Field label="司磅员" value={item.weighmasterName || item.creator.name} missing />
          <Field label="货物名称" value={item.materialName} missing />
          <Field label="规格型号" value={item.materialSpec} missing />
          <Field label="包/袋数" value={item.packageCount} missing />
        </div>
      </section>

      <section className="rounded-lg border bg-muted/20 p-4">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <Field label="发货单位" value={item.shipperName} missing />
          <ChevronRight className="hidden h-5 w-5 text-muted-foreground md:block" />
          <Field label="收货单位" value={item.receiverName} missing />
        </div>
      </section>

      <section>
        <div className="mb-3 text-xs font-medium text-muted-foreground">称重信息</div>
        <div className="grid overflow-hidden rounded-lg border sm:grid-cols-3">
          <WeightField label="毛重（吨）" value={item.grossWeight} />
          <WeightField label="皮重（吨）" value={item.tareWeight} />
          <WeightField label="净重（吨）" value={item.netWeight} emphasized />
        </div>
      </section>

      <section className="grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="毛重时间" value={recordDate(item, item.selectedGrossRecordId)} />
        <Field label="皮重时间" value={recordDate(item, item.selectedTareRecordId)} />
        <Field label="打印时间" value={dateTime(item.printedAt)} />
        <Field label="备注" value={item.remarks} missing />
      </section>
    </div>
  </Card>;
}

function Field({ label, value, missing = false }: { label: string; value: string | number | null | undefined; missing?: boolean }) {
  const empty = value === null || value === undefined || value === '' || value === '-';
  return <div className="min-w-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 break-words text-sm font-medium ${empty ? 'text-muted-foreground' : ''}`}>{empty ? (missing ? '待补录' : '-') : value}</div>
  </div>;
}

function WeightField({ label, value, emphasized = false }: { label: string; value: string | number | null; emphasized?: boolean }) {
  return <div className={`px-5 py-4 sm:border-r sm:last:border-r-0 ${emphasized ? 'bg-primary/5' : ''}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 text-xl font-semibold ${emphasized ? 'text-primary' : ''}`}>{weight(value)}</div>
  </div>;
}

function Summary({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-bold ${danger && value ? 'text-destructive' : ''}`}>{value}</div></Card>;
}

function weight(value: string | number | null) {
  return value === null ? '-' : `${Number(value).toLocaleString()} 吨`;
}
function plainWeight(value: string | number | null) { return value === null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 }); }
function dateOnly(value: string) { return new Date(value).toLocaleDateString('zh-CN'); }
function dateTime(value: string | null) { return formatDateTimeToSecond(value); }
function recordDate(item: Ticket, id: string | null) { return dateTime(item.records.find(record => record.id === id)?.weighedAt || null); }
