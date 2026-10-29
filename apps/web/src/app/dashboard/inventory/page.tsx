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
  const onlyUnit = data.summary.quantityTotalsByUnit?.length === 1 ? data.summary.quantityTotalsByUnit[0] : null;
  const pricingGroups = new Map<string, { unit: string; basis: string; quantity: number }>();
  for (const lot of data.lots) {
    const unit = lot.material?.unit || '吨';
    const basis = lot.pricingQuantityBasis || 'PHYSICAL';
    const key = `${unit}:${basis}`;
    const group = pricingGroups.get(key) || { unit, basis, quantity: 0 };
    group.quantity += Number(lot.pricingAvailableQuantity || 0);
    pricingGroups.set(key, group);
  }
  const onlyPricingGroup = pricingGroups.size === 1 && data.summary.materialCount === 1 ? [...pricingGroups.values()][0] : null;

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
  const visibleLots = data.lots.filter((lot: any) => scopeMatches({
    businessUnitId: lot.businessUnitId,
    warehouseId: lot.warehouseId,
    ownerPartnerId: lot.ownerPartnerId,
  }));
  const materialLocationGroups = new Map<string, any>();
  for (const lot of visibleLots) {
    const key = [lot.businessUnitId || 'unassigned', lot.ownerPartnerId || 'unassigned', lot.warehouseId, lot.materialId, lot.pricingQuantityBasis || 'PHYSICAL'].join(':');
    const group = materialLocationGroups.get(key) || {
      key,
      materialName: lot.materialName,
      materialCode: lot.material?.code || '-',
      unit: lot.material?.unit || '吨',
      basis: lot.pricingQuantityBasis || 'PHYSICAL',
      businessUnitName: lot.businessUnit?.name || '未归属',
      ownerName: lot.inventoryOwner?.name || '未归属库存主体',
      warehouseName: lot.warehouse?.name || '-',
      physicalQuantity: 0,
      pricingQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      lotCount: 0,
    };
    group.physicalQuantity += Number(lot.availableQuantity || 0);
    group.pricingQuantity += Number(lot.pricingAvailableQuantity || 0);
    group.reservedQuantity += Number(lot.totalReservedQuantity || 0);
    group.availableQuantity += Number(lot.availableToPromiseQuantity || 0);
    group.lotCount += 1;
    materialLocationGroups.set(key, group);
  }
  const materialLocationRows = [...materialLocationGroups.values()].sort((a, b) => a.materialName.localeCompare(b.materialName, 'zh-CN'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">在库总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">总库存仅作统计；经营归属按业务单元（事业部）区分，库存所有权按法律主体区分，实物位置按仓库区分</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="实物库存" value={onlyUnit ? weight(onlyUnit.physicalQuantity, onlyUnit.unit) : '按单位查看'} />
        <Summary label="结算数量" value={onlyPricingGroup ? weight(onlyPricingGroup.quantity, onlyPricingGroup.unit) : '按商品查看'} hint={onlyPricingGroup ? pricingBasisLabel(onlyPricingGroup.basis) : '不同商品或计价口径不合并'} />
        <Summary label="业务预占" value={onlyUnit ? weight(onlyUnit.reservedQuantity, onlyUnit.unit) : '按单位查看'} />
        <Summary label="可用实物" value={onlyUnit ? weight(onlyUnit.availableQuantity, onlyUnit.unit) : '按单位查看'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Summary label="库存主体" value={data.summary.ownerCount || 0} />
        <Summary label="业务单元" value={data.summary.businessUnitCount || 0} />
        <Summary label="库存批次" value={data.summary.lotCount || 0} />
        <Summary label="物料种类" value={data.summary.materialCount || 0} />
        <Summary label="涉及仓库" value={data.summary.warehouseCount || 0} />
      </div>
      {(data.summary.quantityTotalsByUnit?.length > 1 || pricingGroups.size > 1 || data.summary.materialCount > 1) && <Card className="space-y-1 p-4 text-sm text-muted-foreground">{data.summary.quantityTotalsByUnit?.length > 1 && <div>实物库存按单位：{data.summary.quantityTotalsByUnit.map((row: any) => weight(row.physicalQuantity, row.unit)).join(' · ')}</div>}{pricingGroups.size > 1 && <div>结算数量按口径：{[...pricingGroups.values()].map(row => `${pricingBasisLabel(row.basis)} ${weight(row.quantity, row.unit)}`).join(' · ')}</div>}{data.summary.materialCount > 1 && <div>不同商品的结算数量请查看下方商品库存明细，不在总览卡片中合并。</div>}</Card>}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索业务单元、库存主体、批次、商品或供应商"
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
          quantityUnit={onlyUnit?.unit || null}
          selectedId={selectedScope?.dimension === dimension ? selectedScope.id : null}
          onSelect={(row) => {
            const id = dimensionConfig.id(row);
            setSelectedScope(current => current?.dimension === dimension && current.id === id ? null : { dimension, id, label: dimensionConfig.name(row) });
          }}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><div className="font-semibold">商品库存明细{selectedScope ? ` · ${selectedScope.label}` : ''}</div><div className="mt-1 text-xs text-muted-foreground">按商品、业务单元、库存主体和仓库分别展示实物与结算数量；点击上方维度行可缩小范围。</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-sm">
            <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">商品名称</th><th className="p-3">业务单元（事业部）</th><th className="p-3">库存主体</th><th className="p-3">仓库位置</th><th className="p-3 text-right">实物数量</th><th className="p-3 text-right">结算数量</th><th className="p-3 text-right">业务预占</th><th className="p-3 text-right">可用实物</th><th className="p-3 text-right">批次数</th></tr></thead>
            <tbody>{materialLocationRows.map((row: any) => <tr key={row.key} className="border-b last:border-0 hover:bg-muted/30">
              <td className="p-3"><div className="font-medium">{row.materialName}</div><div className="mt-1 text-xs text-muted-foreground">{row.materialCode} · {pricingBasisLabel(row.basis)}</div></td>
              <td className="p-3">{row.businessUnitName}</td>
              <td className="p-3">{row.ownerName}</td>
              <td className="p-3">{row.warehouseName}</td>
              <td className="p-3 text-right font-medium tabular-nums">{weight(row.physicalQuantity, row.unit)}</td>
              <td className="p-3 text-right font-semibold text-primary tabular-nums">{weight(row.pricingQuantity, row.unit)}</td>
              <td className="p-3 text-right text-amber-600 tabular-nums">{weight(row.reservedQuantity, row.unit)}</td>
              <td className="p-3 text-right tabular-nums">{weight(row.availableQuantity, row.unit)}</td>
              <td className="p-3 text-right">{row.lotCount}</td>
            </tr>)}</tbody>
          </table>
          {!materialLocationRows.length && <div className="p-10 text-center text-muted-foreground">当前查看范围暂无商品库存</div>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4"><div className="font-semibold">库存批次{selectedScope ? ` · ${selectedScope.label}` : ''}</div><div className="mt-1 text-xs text-muted-foreground">按批次核对商品、货权与仓库，并对照实物余额和结算数量。</div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="min-w-[210px] p-3">商品 / 批次</th>
                <th className="min-w-[160px] p-3">业务归属</th>
                <th className="min-w-[110px] p-3">仓库</th>
                <th className="min-w-[105px] p-3">状态 / 质检</th>
                <th className="min-w-[115px] p-3 text-right">实物余额</th>
                <th className="min-w-[115px] p-3 text-right">结算数量</th>
                <th className="min-w-[115px] p-3 text-right">业务预占</th>
                <th className="min-w-[115px] p-3 text-right">可用实物</th>
                <th className="min-w-[160px] p-3">来源</th>
              </tr>
            </thead>
            <tbody>
              {visibleLots.map((lot: any) => (
                <tr key={lot.id} className="border-b align-top transition-colors hover:bg-muted/30">
                  <td className="p-3"><div className="font-medium">{lot.materialName}</div><div className="mt-1 font-mono text-xs text-primary">{lot.lotNo}</div><div className="mt-1 text-xs text-muted-foreground">{lot.material?.code || '-'} · {pricingBasisLabel(lot.pricingQuantityBasis)}{lot.quantitySource === 'LEGACY_UNVERIFIED' ? ' · 历史待核对' : lot.quantitySource === 'HISTORICAL_RECONCILED' ? ' · 历史已核对' : ''}</div></td>
                  <td className="p-3"><div>{lot.businessUnit?.name || '未归属业务单元'}</div><div className="mt-1 text-xs text-muted-foreground">{lot.inventoryOwner?.name || '未归属库存主体'}</div></td>
                  <td className="p-3">{lot.warehouse?.name || '-'}</td>
                  <td className="p-3"><StatusText status={lot.status}>{lot.status === 'AVAILABLE' ? '可用' : lot.status === 'DEPLETED' ? '已耗尽' : lot.status}</StatusText><div className="mt-1 text-xs text-muted-foreground">{qualityConclusionLabel(lot.qualityConclusion)}</div></td>
                  <td className="p-3 text-right tabular-nums"><div className="font-medium">{weight(lot.availableQuantity, lot.material?.unit)}</div><div className="mt-1 text-xs text-muted-foreground">初始 {weight(lot.initialQuantity, lot.material?.unit)}</div></td>
                  <td className="p-3 text-right font-semibold text-primary tabular-nums">{weight(lot.pricingAvailableQuantity, lot.material?.unit)}</td>
                  <td className="p-3 text-right text-amber-600 tabular-nums"><div>{weight(lot.totalReservedQuantity, lot.material?.unit)}</div><div className="mt-1 text-xs">销售 {weight(lot.reservedOutboundQuantity, lot.material?.unit)} · 生产 {weight(lot.reservedProductionQuantity, lot.material?.unit)}</div></td>
                  <td className="p-3 text-right font-medium tabular-nums">{weight(lot.availableToPromiseQuantity, lot.material?.unit)}</td>
                  <td className="p-3">
                    <div className="font-mono text-xs">{lot.businessInbound?.inboundNo || lot.productionCompletion?.completionNo || '-'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{lot.supplierName || '无供应商'}</div>
                    {lot.productionCompletion?.task && <div className="mt-1 text-xs text-muted-foreground">生产任务 {lot.productionCompletion.task.taskNo}</div>}
                  </td>
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
          <table className="w-full min-w-[1800px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="min-w-44 whitespace-nowrap px-4 py-3 font-medium">时间</th>
                <th className="min-w-24 whitespace-nowrap px-4 py-3 font-medium">类型</th>
                <th className="min-w-48 whitespace-nowrap px-4 py-3 font-medium">业务单号</th>
                <th className="min-w-44 whitespace-nowrap px-4 py-3 font-medium">批次</th>
                <th className="min-w-44 whitespace-nowrap px-4 py-3 font-medium">业务单元（事业部）</th>
                <th className="min-w-40 whitespace-nowrap px-4 py-3 font-medium">仓库</th>
                <th className="min-w-48 whitespace-nowrap px-4 py-3 font-medium">商品名称</th>
                <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right font-medium">实物变动</th>
                <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right font-medium">实物余额</th>
                <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right font-medium">结算数量变动</th>
                <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right font-medium">结算数量余额</th>
                <th className="min-w-28 whitespace-nowrap px-4 py-3 font-medium">操作人</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => {
                const change = Number(entry.quantityChange);
                const pricingChange = Number(entry.pricingQuantityChange);
                return (
                  <tr key={entry.id} className="border-b align-middle transition-colors last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTimeToSecond(entry.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><Badge variant="secondary">{ledgerType(entry.businessType)}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{entry.businessNo || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{entry.lot?.lotNo || '-'}</td>
                    <td className="px-4 py-3">{entry.businessUnit?.name || '未归属业务单元'}</td>
                    <td className="px-4 py-3">{entry.warehouse?.name || '-'}</td>
                    <td className="px-4 py-3 font-medium">{entry.material?.name || '-'}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${change > 0 ? 'text-primary' : change < 0 ? 'text-destructive' : ''}`}>{signedWeight(change, entry.material?.unit)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{weight(entry.balanceAfter, entry.material?.unit)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${pricingChange > 0 ? 'text-primary' : pricingChange < 0 ? 'text-destructive' : ''}`}>{signedWeight(pricingChange, entry.material?.unit)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{weight(entry.pricingBalanceAfter, entry.material?.unit)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{entry.creator?.name || '-'}</td>
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

function Summary({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div>{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}</Card>;
}

function InventorySummaryTable({ title, description, rows, emptyText, name, code, id, extraHeader, extraValue, selectedId, onSelect, quantityUnit }: {
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
  quantityUnit: string | null;
}) {
  return <div className="overflow-hidden">
    <div className="border-b p-4"><div className="font-semibold">{title}</div><div className="mt-1 text-xs text-muted-foreground">{description}</div></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50 text-left"><tr><th className="p-3">{title.replace('各', '').replace('库存', '') || '名称'}</th><th className="p-3 text-right">账面库存</th><th className="p-3 text-right">冻结</th><th className="p-3 text-right">可用</th><th className="p-3 text-right">{extraHeader}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={id(row)} className={`cursor-pointer border-b transition-colors hover:bg-muted/60 ${selectedId === id(row) ? 'bg-primary/5' : ''}`} onClick={() => onSelect(row)}>
          <td className="p-3"><div className="font-medium">{name(row)}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{code(row)}</div></td>
          <td className="p-3 text-right font-medium">{quantityUnit ? weight(row.totalPhysicalQuantity, quantityUnit) : '—'}</td><td className="p-3 text-right text-amber-600">{quantityUnit ? weight(row.totalReservedQuantity, quantityUnit) : '—'}</td><td className="p-3 text-right font-medium text-primary">{quantityUnit ? weight(row.totalAvailableQuantity, quantityUnit) : '—'}</td><td className="p-3 text-right">{extraValue(row)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <div className="p-10 text-center text-muted-foreground">{emptyText}</div>}
    </div>
  </div>;
}

function weight(value: any, unit = '吨') {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unit === 'TON' ? '吨' : unit}`;
}

function signedWeight(value: any, unit = '吨') {
  return `${Number(value || 0) > 0 ? '+' : ''}${weight(value, unit)}`;
}

function pricingBasisLabel(value?: string | null) {
  return value === 'DRY_MATTER' ? '折干计价' : value === 'PHYSICAL' ? '实物计价' : '未设置计价口径';
}

function qualityConclusionLabel(value?: string | null) {
  return ({
    PASS: '质量合格',
    ACCEPT_WITH_DEDUCTION: '扣款接收',
    DEDUCTION_PENDING: '扣款待确认',
    REJECT: '质检异常·人工接收',
    REVIEW_REQUIRED: '待人工判定',
    LEGACY: '历史记录待核对',
  } as Record<string, string>)[value || ''] || '质检结果待核对';
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
