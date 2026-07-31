'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = {
  PENDING: '作业中', RECEIVED: '已收货', POSTED: '已入账', CANCELLED: '已作废',
};

const STAGES: Record<string, string> = {
  WAITING_ARRIVAL: '待到货',
  WAITING_WEIGH: '已到达待过磅',
  WEIGHING: '过磅处理中',
  WAITING_WEIGH_REVIEW: '待磅单复核',
  WAITING_QUALITY: '已过磅待质检',
  QUALITY_IN_PROGRESS: '质检处理中',
  WAITING_ACCEPTANCE_SELECTION: '待确认验收依据',
  QUALITY_EXCEPTION: '质检异常',
  READY_TO_RECEIVE: '合格待收货',
  RECEIVED_WAIT_POSTING: '已收货待入账',
  POSTED: '已入账',
  CANCELLED: '已作废',
};

export default function InboundPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    setLoading(true);
    api.get<{ items: any[] }>(`/inbound-receipts?${params}`)
      .then(data => setItems(data.items))
      .catch(error => alert(error.message))
      .finally(() => setLoading(false));
  }, [search, status]);

  const visibleItems = useMemo(
    () => stage ? items.filter(item => item.workflow?.stage === stage) : items,
    [items, stage],
  );
  const pendingItems = items.filter(item => item.status === 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">入库单管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          采购运单确认发运后自动生成入库作业单，持续跟踪到货、签收、过磅、质检、收货与库存入账
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="待到货" value={items.filter(item => item.workflow?.stage === 'WAITING_ARRIVAL').length} />
        <Summary label="现场作业中" value={pendingItems.filter(item => !['WAITING_ARRIVAL', 'READY_TO_RECEIVE'].includes(item.workflow?.stage)).length} />
        <Summary label="合格待收货" value={items.filter(item => item.workflow?.stage === 'READY_TO_RECEIVE').length} />
        <Summary label="已收货待入账" value={items.filter(item => item.status === 'RECEIVED').length} />
        <Summary label="已入账" value={items.filter(item => item.status === 'POSTED').length} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-72 max-w-xl flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索入库作业单、运单、磅单、质检单、合同、物料、供应商或车牌"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={stage} onChange={event => setStage(event.target.value)}>
          <option value="">全部作业阶段</option>
          {Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">全部单据状态</option>
          {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">加载中...</div>
        ) : !visibleItems.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <Warehouse className="mx-auto mb-2 h-8 w-8 opacity-40" />
            暂无入库作业单；采购运单确认发运后将自动生成
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1880px] w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">入库作业单 / 阶段</th>
                  <th className="p-3">运单 / 车辆</th>
                  <th className="p-3">合同 / 执行批次</th>
                  <th className="p-3">物料 / 供应商</th>
                  <th className="p-3 text-right">计划 / 最终数量</th>
                  <th className="p-3">运输与签收</th>
                  <th className="p-3">过磅</th>
                  <th className="p-3">质检</th>
                  <th className="p-3">仓库 / 入库</th>
                  <th className="p-3">当前提示</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(item => {
                  const contract = item.waybill?.dispatchNotice?.order?.contract;
                  const order = item.waybill?.dispatchNotice?.order;
                  const workflow = item.workflow || {};
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/inbound/${item.id}`)}
                    >
                      <td className="p-3">
                        <div className="font-mono font-medium text-primary">{item.receiptNo}</div>
                        <Badge variant="outline" className={`mt-2 ${stageClass(workflow.tone)}`}>
                          {workflow.stageLabel || STATUS[item.status] || item.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-xs">{item.waybill?.waybillNo || '-'}</div>
                        <div className="mt-1 font-medium">{item.plateNo || item.waybill?.plateNo || '待调度'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">到达：{formatDateTimeToSecond(item.waybill?.arrivedAt)}</div>
                      </td>
                      <td className="max-w-64 p-3">
                        <div className="truncate font-mono text-xs">{contract?.contractNo || '-'}</div>
                        <div className="mt-1 truncate">{order?.name || order?.orderNo || '-'}</div>
                      </td>
                      <td className="max-w-56 p-3">
                        <div className="truncate font-medium">{item.materialName}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{item.supplierName || '-'}</div>
                      </td>
                      <td className="p-3 text-right">
                        <div>{weight(item.plannedQuantity)}</div>
                        <div className="mt-1 font-medium text-primary">{weight(item.receivedQuantity)}</div>
                      </td>
                      <MilestoneCell milestone={workflow.milestones?.transport} secondary={workflow.milestones?.signed?.label} />
                      <MilestoneCell milestone={workflow.milestones?.weigh} secondary={item.weighTicket?.ticketNo} />
                      <MilestoneCell milestone={workflow.milestones?.quality} secondary={item.qualityInspection?.inspectionNo} />
                      <td className="p-3">
                        <div>{item.warehouse?.name || '待选择仓库'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{workflow.milestones?.inbound?.label || STATUS[item.status]}</div>
                      </td>
                      <td className="max-w-72 p-3">
                        <div className={workflow.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}>{workflow.blocker || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">创建：{formatDateTimeToSecond(item.createdAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>;
}

function MilestoneCell({ milestone, secondary }: { milestone?: { label: string; complete: boolean }; secondary?: string }) {
  return (
    <td className="p-3">
      <div className={milestone?.complete ? 'font-medium text-success' : 'text-muted-foreground'}>{milestone?.label || '待处理'}</div>
      {secondary && <div className="mt-1 font-mono text-xs text-muted-foreground">{secondary}</div>}
    </td>
  );
}

function stageClass(tone?: string) {
  if (tone === 'success') return 'border-success/30 bg-success-bg text-success';
  if (tone === 'danger') return 'border-destructive/30 bg-destructive/5 text-destructive';
  if (tone === 'warning') return 'border-warning/30 bg-warning-bg text-warning';
  if (tone === 'info') return 'border-info/30 bg-info-bg text-info';
  return 'text-muted-foreground';
}

function weight(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '待确认';
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
