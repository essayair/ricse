'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { StatusText } from '@/components/status-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type InventoryDimension = 'BUSINESS_UNIT' | 'WAREHOUSE' | 'OWNER';

const DIMENSIONS: Array<{ value: InventoryDimension; label: string; description: string }> = [
  { value: 'BUSINESS_UNIT', label: '按业务单元（事业部）', description: '查看各业务线的经营归属库存' },
  { value: 'WAREHOUSE', label: '按仓库', description: '查看货物实际存放位置的库存' },
  { value: 'OWNER', label: '按库存主体', description: '查看各法律主体拥有货权的库存' },
];

export default function InventoryPage() {
  const [data, setData] = useState<any>({ lots: [], businessUnitSummaries: [], ownerSummaries: [], warehouseSummaries: [], ownerWarehouseSummaries: [], summary: {} });
  const [ledger, setLedger] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [dimension, setDimension] = useState<InventoryDimension>('BUSINESS_UNIT');
  const [selectedScope, setSelectedScope] = useState<{ dimension: InventoryDimension; id: string; label: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    api.get(`/inventory/overview?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [search]);

  useEffect(() => {
    api.get<any[]>('/inventory/ledger').then(setLedger).catch(() => {});
  }, []);

  const dimensionConfig = dimension === 'BUSINESS_UNIT'
    ? {
        title: '各业务单元（事业部）库存', description: '按经营与利润责任归属分别统计', rows: data.businessUnitSummaries,
        emptyText: '暂无业务单元库存', name: (row: any) => row.businessUnitName, code: (row: any) => row.businessUnitCode || '未设置业务单元编码',
        id: (row: any) => row.businessUnitId || 'unassigned', extraHeader: '库存主体', extraValue: (row: any) => row.ownerCount,
      }
    : dimension === 'WAREHOUSE'
      ? {
          title: '各仓库库存', description: '合并统计同一仓库内所有库存主体的货物', rows: data.warehouseSummaries,
          emptyText: '暂无仓库库存', name: (row: any) => row.warehouseName, code: (row: any) => row.warehouseCode,
          id: (row: any) => row.warehouseId, extraHeader: '库存主体', extraValue: (row: any) => row.ownerCount,
        }
      : {
          title: '各主体库存', description: '按货权归属的我方采购主体合并统计', rows: data.ownerSummaries,
          emptyText: '暂无主体库存', name: (row: any) => row.ownerName, code: (row: any) => row.ownerCode || '未设置主体编码',
          id: (row: any) => row.ownerPartnerId || 'unassigned', extraHeader: '涉及仓库', extraValue: (row: any) => row.warehouseCount,
        };

  const scopeMatches = (row: any) => {
    if (!selectedScope) return true;
    if (selectedScope.dimension === 'BUSINESS_UNIT') return (row.businessUnitId || 'unassigned') === selectedScope.id;
    if (selectedScope.dimension === 'WAREHOUSE') return row.warehouseId === selectedScope.id;
    return (row.ownerPartnerId || 'unassigned') === selectedScope.id;
  };
  const visibleOwnerWarehouseSummaries = data.ownerWarehouseSummaries.filter(scopeMatches);
  const visibleLots = data.lots.filter((lot: any) => scopeMatches({
    businessUnitId: lot.businessUnit?.id,
    warehouseId: lot.warehouse?.id,
    ownerPartnerId: lot.inventoryOwner?.id,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">在库总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">总库存仅作统计；经营归属按业务单元（事业部）区分，库存所有权按法律主体区分，实物位置按仓库区分</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Summary label="总账面库存" value={`${Number(data.summary.totalPhysicalQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="业务预占" value={`${Number(data.summary.totalReservedQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="可用库存" value={`${Number(data.summary.totalAvailableQuantity || 0).toLocaleString()} 吨`} />
        <Summary label="库存主体" value={data.summary.ownerCount || 0} />
        <Summary label="业务单元" value={data.summary.businessUnitCount || 0} />
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
          placeholder="搜索业务单元、库存主体、批次、物料或供应商"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">库存查看维度</div>
              <div className="mt-1 text-xs text-muted-foreground">根据工作场景切换统计口径，点击统计行可继续查看该范围内的明细和库存批次。</div>
            </div>
            {selectedScope && <Button size="sm" variant="ghost" onClick={() => setSelectedScope(null)}>查看全部库存</Button>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {DIMENSIONS.map(item => <button
              key={item.value}
              type="button"
              className={`rounded-lg border px-4 py-2 text-left transition-colors ${dimension === item.value ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted/60'}`}
              onClick={() => { setDimension(item.value); setSelectedScope(null); }}
            >
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
            </button>)}
          </div>
        </div>
        <InventorySummaryTable
          {...dimensionConfig}
          selectedId={selectedScope?.dimension === dimension ? selectedScope.id : null}
          onSelect={(row) => {
            const id = dimensionConfig.id(row);
            setSelectedScope(current => current?.dimension === dimension && current.id === id ? null : { dimension, id, label: dimensionConfig.name(row) });
          }}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><div className="font-semibold">业务单元×主体×仓库库存明细{selectedScope ? ` · ${selectedScope.label}` : ''}</div><div className="mt-1 text-xs text-muted-foreground">业务单元、货权主体或仓库任一维度不同即分行核算，不会相互混用。</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">业务单元（事业部）</th><th className="p-3">库存主体</th><th className="p-3">仓库位置</th><th className="p-3 text-right">账面库存</th><th className="p-3 text-right">业务预占</th><th className="p-3 text-right">可用库存</th><th className="p-3 text-right">批次数</th><th className="p-3 text-right">物料种类</th></tr></thead>
            <tbody>{visibleOwnerWarehouseSummaries.map((row: any) => <tr key={`${row.businessUnitId || 'unassigned'}:${row.ownerPartnerId || 'unassigned'}:${row.warehouseId}`} className="border-b">
              <td className="p-3"><div className="font-medium">{row.businessUnitName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.businessUnitCode || '-'}</div></td>
              <td className="p-3"><div className="font-medium">{row.ownerName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.ownerCode || '未设置主体编码'}</div></td>
              <td className="p-3"><div>{row.warehouseName}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{row.warehouseCode}</div></td>
              <td className="p-3 text-right font-medium">{weight(row.totalPhysicalQuantity)}</td><td className="p-3 text-right text-amber-600">{weight(row.totalReservedQuantity)}</td><td className="p-3 text-right font-medium text-primary">{weight(row.totalAvailableQuantity)}</td><td className="p-3 text-right">{row.lotCount}</td><td className="p-3 text-right">{row.materialCount}</td>
            </tr>)}</tbody>
          </table>
          {!visibleOwnerWarehouseSummaries.length && <div className="p-10 text-center text-muted-foreground">当前查看范围暂无库存明细</div>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-semibold">库存批次{selectedScope ? ` · ${selectedScope.label}` : ''}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1520px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">批次号</th>
                <th className="p-3">物料</th>
                <th className="p-3">业务单元（事业部）</th>
                <th className="p-3">状态 / 质量结论</th>
                <th className="p-3">库存主体</th>
                <th className="p-3">仓库</th>
                <th className="p-3">供应商</th>
                <th className="p-3">来源单据</th>
                <th className="p-3 text-right">初始数量</th>
                <th className="p-3 text-right">账面数量</th>
                <th className="p-3 text-right">销售预占</th>
                <th className="p-3 text-right">生产预占</th>
                <th className="p-3 text-right">可用数量</th>
              </tr>
            </thead>
            <tbody>
              {visibleLots.map((lot: any) => (
                <tr key={lot.id} className="border-b">
                  <td className="p-3 font-mono text-primary">{lot.lotNo}</td>
                  <td className="p-3">{lot.materialName}</td>
                  <td className="p-3"><div>{lot.businessUnit?.name || '未归属'}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{lot.businessUnit?.code || '-'}</div></td>
                  <td className="p-3"><StatusText status={lot.status}>{lot.status === 'AVAILABLE' ? '可用' : lot.status === 'DEPLETED' ? '已耗尽' : lot.status}</StatusText><div className="mt-1 text-xs text-muted-foreground">{lot.qualityConclusion === 'PASS' ? '质量合格' : '扣款入库'}</div></td>
                  <td className="p-3"><div>{lot.inventoryOwner?.name || '未归属库存主体'}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{lot.inventoryOwner?.code || '-'}</div></td>
                  <td className="p-3">{lot.warehouse.name}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleLots.length && <div className="p-10 text-center text-muted-foreground">当前查看范围暂无库存批次</div>}
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
                <th className="p-3">业务单元（事业部）</th>
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
                    <td className="p-3">{entry.businessUnit ? `${entry.businessUnit.code} · ${entry.businessUnit.name}` : '未归属'}</td>
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

function InventorySummaryTable({ title, description, rows, emptyText, name, code, id, extraHeader, extraValue, selectedId, onSelect }: {
  title: string;
  description: string;
  rows: any[];
  emptyText: string;
  name: (row: any) => string;
  code: (row: any) => string;
  id: (row: any) => string;
  extraHeader: string;
  extraValue: (row: any) => number;
  selectedId: string | null;
  onSelect: (row: any) => void;
}) {
  return <div className="overflow-hidden">
    <div className="border-b p-4"><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">{title.replace('各', '').replace('库存', '') || '名称'}</th><th className="p-3 text-right">账面库存</th><th className="p-3 text-right">冻结</th><th className="p-3 text-right">可用</th><th className="p-3 text-right">{extraHeader}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={id(row)} className={`cursor-pointer border-b transition-colors hover:bg-muted/60 ${selectedId === id(row) ? 'bg-primary/5' : ''}`} onClick={() => onSelect(row)}>
          <td className="p-3"><div className="font-medium">{name(row)}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{code(row)}</div></td>
          <td className="p-3 text-right font-medium">{weight(row.totalPhysicalQuantity)}</td><td className="p-3 text-right text-amber-600">{weight(row.totalReservedQuantity)}</td><td className="p-3 text-right font-medium text-primary">{weight(row.totalAvailableQuantity)}</td><td className="p-3 text-right">{extraValue(row)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="p-10 text-center text-muted-foreground">{emptyText}</div>}
    </div>
  </div>;
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
