'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageMinus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = {
  PENDING: '待出库', PARTIAL: '部分出库', COMPLETED: '已完成', CANCELLED: '已取消',
};

export default function OutboundPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api.get<{ items: any[] }>(`/outbound-receipts/orders?${params}`)
      .then(data => setItems(data.items))
      .catch(error => alert(error.message));
  }, [search, status]);

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">出库管理</h1>
      <p className="mt-1 text-sm text-muted-foreground">销售发货通知下达后自动生成；常规出库跟踪库存扣减，直拨发运跟踪物流、过磅、质检与签收</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-72 flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索出库管理单、发货通知、执行批次、合同或物料" />
      </div>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">全部状态</option>
        {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <Card className="overflow-hidden">
      {!items.length ? <div className="p-12 text-center text-muted-foreground"><PackageMinus className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无出库管理单；销售发货通知下达后将自动生成</div> :
        <div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr>
            <th className="p-3">管理单 / 当前阶段</th><th className="p-3">销售发货通知</th><th className="p-3">合同 / 执行批次</th>
            <th className="p-3">发货仓库</th><th className="p-3">物料</th><th className="p-3 text-right">通知数量</th>
            <th className="p-3 text-right">待出库冻结</th><th className="p-3 text-right">库存缺口</th><th className="p-3 text-right">实际出库</th>
            <th className="p-3">物流 / 磅单</th><th className="p-3">状态</th><th className="p-3">生成时间</th>
          </tr></thead>
          <tbody>{items.map(item => {
            const waybills = item.dispatchNotice.waybills || [];
            const tickets = waybills.flatMap((waybill: any) => waybill.weighTickets || []);
            return <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/outbound/${item.id}`)}>
              <td className="p-3"><div className="flex items-center gap-2"><span className="font-mono font-medium text-primary">{item.orderNo}</span><Badge variant="outline">{item.dispatchNotice.mode === 'DIRECT' ? '直拨' : '常规'}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{item.stageLabel}</div></td>
              <td className="p-3 font-mono text-xs">{item.dispatchNotice.noticeNo}</td>
              <td className="max-w-56 p-3"><div>{item.dispatchNotice.order.contract.contractNo}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.dispatchNotice.order.orderNo} · {item.dispatchNotice.order.name}</div></td>
              <td className="p-3">{item.warehouse?.name || '直拨，不经过我方仓库'}</td>
              <td className="p-3">{item.lineItems.map((line: any) => line.materialName || line.materialId).join('、')}</td>
              <td className="p-3 text-right">{weight(item.plannedQuantity)}</td><td className="p-3 text-right text-primary">{item.dispatchNotice.mode === 'DIRECT' ? '-' : weight(item.reservedQuantity)}</td>
              <td className={`p-3 text-right ${Number(item.shortageQuantity) > 0 ? 'font-medium text-destructive' : ''}`}>{item.dispatchNotice.mode === 'DIRECT' ? '-' : weight(item.shortageQuantity)}</td>
              <td className="p-3 text-right font-medium">{weight(item.actualQuantity)}</td>
              <td className="p-3"><div>{waybills.length} 个车次</div><div className="mt-1 text-xs text-muted-foreground">{tickets.length} 张磅单</div></td>
              <td className="p-3"><Badge variant={Number(item.shortageQuantity) > 0 ? 'destructive' : 'secondary'}>{STATUS[item.status] || item.status}</Badge></td>
              <td className="p-3 text-xs text-muted-foreground">{formatDateTimeToSecond(item.createdAt)}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </Card>
  </div>;
}

function weight(value: any) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
