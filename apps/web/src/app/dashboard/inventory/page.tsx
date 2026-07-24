'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function InventoryPage() {
  const [data, setData] = useState<any>({ lots: [], summary: {} });
  const [ledger, setLedger] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    api.get(`/inventory/overview?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [search]);

  useEffect(() => {
    api.get<any[]>('/inventory/ledger').then(setLedger).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">在库总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">按仓库、物料和入库批次查看实时可用库存及出入库台账</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Summary label="可用库存" value={`${Number(data.summary.totalQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="库存批次" value={data.summary.lotCount || 0} />
        <Summary label="物料种类" value={data.summary.materialCount || 0} />
        <Summary label="涉及仓库" value={data.summary.warehouseCount || 0} />
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索库存批次、物料或供应商"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-semibold">库存批次</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">批次号</th>
                <th className="p-3">仓库</th>
                <th className="p-3">物料</th>
                <th className="p-3">供应商</th>
                <th className="p-3">业务入库单</th>
                <th className="p-3 text-right">初始数量</th>
                <th className="p-3 text-right">可用数量</th>
                <th className="p-3">质量结论</th>
                <th className="p-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {data.lots.map((lot: any) => (
                <tr key={lot.id} className="border-b">
                  <td className="p-3 font-mono text-primary">{lot.lotNo}</td>
                  <td className="p-3">{lot.warehouse.name}</td>
                  <td className="p-3">{lot.materialName}</td>
                  <td className="p-3">{lot.supplierName || '-'}</td>
                  <td className="p-3 font-mono text-xs">{lot.businessInbound.inboundNo}</td>
                  <td className="p-3 text-right">{weight(lot.initialQuantity)}</td>
                  <td className="p-3 text-right font-medium text-primary">{weight(lot.availableQuantity)}</td>
                  <td className="p-3">{lot.qualityConclusion === 'PASS' ? '合格' : '扣款入库'}</td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {lot.status === 'AVAILABLE' ? '可用' : lot.status === 'DEPLETED' ? '已耗尽' : lot.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.lots.length && <div className="p-10 text-center text-muted-foreground">暂无库存批次</div>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-semibold">最近库存台账</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">时间</th>
                <th className="p-3">类型</th>
                <th className="p-3">业务单号</th>
                <th className="p-3">批次</th>
                <th className="p-3">仓库</th>
                <th className="p-3">物料</th>
                <th className="p-3 text-right">数量变动</th>
                <th className="p-3 text-right">变动后余额</th>
                <th className="p-3">操作人</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => {
                const change = Number(entry.quantityChange);
                return (
                  <tr key={entry.id} className="border-b">
                    <td className="p-3">{formatDateTimeToSecond(entry.createdAt)}</td>
                    <td className="p-3">
                      <Badge variant="secondary">{ledgerType(entry.businessType)}</Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">{entry.businessNo}</td>
                    <td className="p-3">{entry.lot.lotNo}</td>
                    <td className="p-3">{entry.warehouse.name}</td>
                    <td className="p-3">{entry.material.name}</td>
                    <td className={`p-3 text-right font-medium ${change >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {change > 0 ? '+' : ''}{weight(change)}
                    </td>
                    <td className="p-3 text-right">{weight(entry.balanceAfter)}</td>
                    <td className="p-3">{entry.creator.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!ledger.length && <div className="p-10 text-center text-muted-foreground">暂无库存变动记录</div>}
        </div>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>;
}

function weight(value: any) {
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function ledgerType(value: string) {
  return {
    INBOUND: '入库',
    OUTBOUND: '出库',
    INBOUND_REVERSAL: '入库冲销',
    OUTBOUND_REVERSAL: '出库冲销',
    ADJUSTMENT: '库存调整',
  }[value] || value;
}
