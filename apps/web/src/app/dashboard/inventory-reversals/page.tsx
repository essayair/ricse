'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const STATUS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_APPROVAL: '待审批',
  APPROVED: '审批通过',
  REJECTED: '已驳回',
  POSTED: '已过账',
  CANCELLED: '已取消',
};

export default function InventoryReversalListPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    api.get<{ items: any[] }>(`/inventory-reversals?${params}`)
      .then((data) => setItems(data.items))
      .catch((error) => alert(error.message));
  }, [search, type, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">库存冲销</h1>
          <p className="mt-1 text-sm text-muted-foreground">通过审批和反向台账纠正已经入账的入库或销售出库业务</p>
        </div>
        <Button onClick={() => router.push('/dashboard/inventory-reversals/create')}>
          <Plus className="mr-2 h-4 w-4" />新建冲销单
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-72 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索冲销单、原业务单或冲销原因"
          />
        </div>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">全部类型</option>
          <option value="INBOUND">入库冲销</option>
          <option value="OUTBOUND">出库冲销</option>
        </select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        {!items.length ? (
          <div className="p-12 text-center text-muted-foreground">
            <RotateCcw className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无库存冲销单
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">冲销单 / 创建时间</th>
                  <th className="p-3">类型</th>
                  <th className="p-3">原业务单</th>
                  <th className="p-3">物料 / 仓库</th>
                  <th className="p-3 text-right">冲销数量</th>
                  <th className="p-3">冲销原因</th>
                  <th className="p-3">申请人</th>
                  <th className="p-3">审批人</th>
                  <th className="p-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const source = item.type === 'INBOUND' ? item.businessInbound : item.salesOutbound;
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-b hover:bg-muted/50"
                      onClick={() => router.push(`/dashboard/inventory-reversals/${item.id}`)}
                    >
                      <td className="p-3">
                        <div className="font-mono font-medium text-primary">{item.reversalNo}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDateTimeToSecond(item.createdAt)}</div>
                      </td>
                      <td className="p-3">{item.type === 'INBOUND' ? '入库冲销' : '出库冲销'}</td>
                      <td className="p-3 font-mono text-xs">{item.type === 'INBOUND' ? source?.inboundNo : source?.outboundNo}</td>
                      <td className="p-3">
                        <div>{source?.materialName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{source?.warehouse?.name}</div>
                      </td>
                      <td className="p-3 text-right font-medium">{weight(item.lines.reduce((sum: number, line: any) => sum + Number(line.quantity), 0))}</td>
                      <td className="max-w-64 p-3"><div className="truncate">{item.reason}</div></td>
                      <td className="p-3">{item.creator.name}</td>
                      <td className="p-3">{item.approver?.name || '-'}</td>
                      <td className="p-3"><Badge variant="secondary">{STATUS[item.status]}</Badge></td>
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

function weight(value: any) {
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
