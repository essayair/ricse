'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function InventoryPage() {
  const [data, setData] = useState<any>({ lots: [], ownerSummaries: [], warehouseSummaries: [], ownerWarehouseSummaries: [], summary: {} });
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
        <p className="mt-1 text-sm text-muted-foreground">总库存仅作统计，库存所有权按我方采购主体区分，实物位置按仓库区分</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Summary label="总账面库存" value={`${Number(data.summary.totalPhysicalQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="业务预占" value={`${Number(data.summary.totalReservedQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="可用库存" value={`${Number(data.summary.totalAvailableQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="库存主体" value={data.summary.ownerCount || 0} />
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
          placeholder="搜索库存主体、批次、物料或供应商"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InventorySummaryTable
          title="各仓库库存"
          description="合并统计同一仓库内所有库存主体的货物"
          rows={data.warehouseSummaries}
          emptyText="暂无仓库库存"
          name={(row) => row.warehouseName}
          code={(row) => row.warehouseCode}
          extraHeader="库存主体"
          extraValue={(row) => row.ownerCount}
        />
        <InventorySummaryTable
          title="各主体库存"
          description="按货权归属的我方采购主体合并统计"
          rows={data.ownerSummaries}
          emptyText="暂无主体库存"
          name={(row) => row.ownerName}
          code={(row) => row.ownerCode || '未设置主体编码'}
          extraHeader="涉及仓库"
          extraValue={(row) => row.warehouseCount}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><div className="font-semibold">主体×仓库库存明细</div><div className="mt-1 text-xs text-muted-foreground">同一采购主体可分布在多个仓库；同一仓库内的不同主体库存分行核算，不会混用。</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">库存主体</th><th className="p-3">仓库位置</th><th className="p-3 text-right">账面库存</th><th className="p-3 text-right">业务预占</th><th className="p-3 text-right">可用库存</th><th className="p-3 text-right">批次数</th><th className="p-3 text-right">物料种类</th></tr></thead>
            <tbody>{data.ownerWarehouseSummaries.map((row: any) => <tr key={`${row.ownerPartnerId || 'unassigned'}:${row.warehouseId}`} className="border-b">
              <td className="p-3"><div className="font-medium">{row.ownerName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.ownerCode || '未设置主体编码'}</div></td>
              <td className="p-3"><div>{row.warehouseName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.warehouseCode}</div></td>
              <td className="p-3 text-right font-medium">{weight(row.totalPhysicalQuantity)}</td><td className="p-3 text-right text-amber-600">{weight(row.totalReservedQuantity)}</td><td className="p-3 text-right font-medium text-primary">{weight(row.totalAvailableQuantity)}</td><td className="p-3 text-right">{row.lotCount}</td><td className="p-3 text-right">{row.materialCount}</td>
            </tr>)}</tbody>
          </table>
          {!data.ownerWarehouseSummaries.length && <div className="p-10 text-center text-muted-foreground">暂无主体及仓库库存</div>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-semibold">库存批次</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">批次号</th>
                <th className="p-3">库存主体</th>
                <th className="p-3">仓库</th>
                <th className="p-3">物料</th>
                <th className="p-3">供应商</th>
                <th className="p-3">来源单据</th>
                <th className="p-3 text-right">初始数量</th>
                <th className="p-3 text-right">账面数量</th>
                <th className="p-3 text-right">销售预占</th>
                <th className="p-3 text-right">生产预占</th>
                <th className="p-3 text-right">可用数量</th>
                <th className="p-3">质量结论</th>
                <th className="p-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {data.lots.map((lot: any) => (
                <tr key={lot.id} className="border-b">
                  <td className="p-3 font-mono text-primary">{lot.lotNo}</td>
                  <td className="p-3"><div>{lot.inventoryOwner?.name || '未归属库存主体'}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{lot.inventoryOwner?.code || '-'}</div></td>
                  <td className="p-3">{lot.warehouse.name}</td>
                  <td className="p-3">{lot.materialName}</td>
                  <td className="p-3">{lot.supplierName || '-'}</td>
                  <td className="p-3">
                    <div className="font-mono text-xs">{lot.businessInbound?.inboundNo || lot.productionCompletion?.completionNo || '-'}</div>
                    {lot.productionCompletion?.task && <div className="mt-1 text-xs text-muted-foreground">生产任务 {lot.productionCompletion.task.taskNo}</div>}
                  </td>
                  <td className="p-3 text-right">{weight(lot.initialQuantity)}</td>
                  <td className="p-3 text-right">{weight(lot.availableQuantity)}</td>
                  <td className="p-3 text-right text-amber-600">{weight(lot.reservedOutboundQuantity)}</td>
                  <td className="p-3 text-right text-violet-600">{weight(lot.reservedProductionQuantity)}</td>
                  <td className="p-3 text-right font-medium text-primary">{weight(lot.availableToPromiseQuantity)}</td>
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

function InventorySummaryTable({ title, description, rows, emptyText, name, code, extraHeader, extraValue }: {
  title: string;
  description: string;
  rows: any[];
  emptyText: string;
  name: (row: any) => string;
  code: (row: any) => string;
  extraHeader: string;
  extraValue: (row: any) => number;
}) {
  return <Card className="overflow-hidden">
    <div className="border-b p-4"><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">{title.replace('各', '').replace('库存', '') || '名称'}</th><th className="p-3 text-right">账面库存</th><th className="p-3 text-right">冻结</th><th className="p-3 text-right">可用</th><th className="p-3 text-right">{extraHeader}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.warehouseId || row.ownerPartnerId || 'unassigned'} className="border-b">
          <td className="p-3"><div className="font-medium">{name(row)}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{code(row)}</div></td>
          <td className="p-3 text-right font-medium">{weight(row.totalPhysicalQuantity)}</td><td className="p-3 text-right text-amber-600">{weight(row.totalReservedQuantity)}</td><td className="p-3 text-right font-medium text-primary">{weight(row.totalAvailableQuantity)}</td><td className="p-3 text-right">{extraValue(row)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="p-10 text-center text-muted-foreground">{emptyText}</div>}
    </div>
  </Card>;
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
    PRODUCTION_ISSUE: '生产领料',
    PRODUCTION_RETURN: '生产退料',
    PRODUCTION_INBOUND: '生产入库',
    ADJUSTMENT: '库存调整',
  }[value] || value;
}
