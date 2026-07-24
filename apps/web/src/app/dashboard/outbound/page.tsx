'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageMinus, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = {
  DRAFT: '草稿',
  DEPARTURE_CONFIRMED: '已确认离场',
  POSTED: '已扣减库存',
  CANCELLED: '已作废',
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
    api.get<{ items: any[] }>(`/outbound-receipts?${params}`)
      .then((data) => setItems(data.items))
      .catch((error) => alert(error.message));
  }, [search, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">出库单管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">销售物流离场、库存批次拣配、销售出库和库存扣减</p>
        </div>
        <Button onClick={() => router.push('/dashboard/outbound/create')}>
          <Plus className="mr-2 h-4 w-4" />新建物流出库单
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-72 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索出库单、运单、磅单、物料、客户或车牌"
          />
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        {!items.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <PackageMinus className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无物流出库单
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1350px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">出库单 / 离场时间</th>
                  <th className="p-3">运单 / 车辆</th>
                  <th className="p-3">物料 / 客户</th>
                  <th className="p-3">出库磅单</th>
                  <th className="p-3">发货仓库</th>
                  <th className="p-3">库存批次</th>
                  <th className="p-3 text-right">出库数量</th>
                  <th className="p-3">操作人</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">销售出库单</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b hover:bg-muted/50"
                    onClick={() => router.push(`/dashboard/outbound/${item.id}`)}
                  >
                    <td className="p-3">
                      <div className="font-mono font-medium text-primary">{item.receiptNo}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTimeToSecond(item.departedAt)}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-xs">{item.waybill.waybillNo}</div>
                      <div className="mt-1">{item.plateNo || '-'}</div>
                    </td>
                    <td className="max-w-56 p-3">
                      <div className="truncate font-medium">{item.materialName}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{item.customerName || '-'}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{item.weighTicket.ticketNo}</td>
                    <td className="p-3">{item.warehouse.name}</td>
                    <td className="p-3">{item.allocations.map((line: any) => line.inventoryLot.lotNo).join('、')}</td>
                    <td className="p-3 text-right font-medium">{weight(item.outboundQuantity)}</td>
                    <td className="p-3">{item.operatorName}</td>
                    <td className="p-3"><Badge variant="secondary">{STATUS[item.status]}</Badge></td>
                    <td className="p-3 font-mono text-xs">{item.salesOutbound?.outboundNo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function weight(value: any) {
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
