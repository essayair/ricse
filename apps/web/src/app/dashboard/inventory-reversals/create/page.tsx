'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CreateInventoryReversalPage() {
  const router = useRouter();
  const [type, setType] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSourceId('');
    setQuantities({});
    setLoading(true);
    api.get<any[]>(`/inventory-reversals/eligible-sources?type=${type}`)
      .then(setSources)
      .catch((error) => alert(error.message))
      .finally(() => setLoading(false));
  }, [type]);

  const source = sources.find((item) => item.id === sourceId);
  const sourceLines = useMemo<any[]>(() => {
    if (!source) return [];
    if (type === 'INBOUND') {
      return [{
        key: source.inventoryLot.id,
        inventoryLotId: source.inventoryLot.id,
        sourceSalesOutboundLineId: undefined,
        lotNo: source.inventoryLot.lotNo,
        sourceQuantity: Number(source.quantity),
        reversibleQuantity: Number(source.reversibleQuantity),
        availableQuantity: Number(source.inventoryLot.availableQuantity),
        supplierName: source.supplierName,
      }];
    }
    return source.lines.filter((line: any) => Number(line.reversibleQuantity) > 0).map((line: any) => ({
      key: line.id,
      inventoryLotId: line.inventoryLotId,
      sourceSalesOutboundLineId: line.id,
      lotNo: line.inventoryLot.lotNo,
      sourceQuantity: Number(line.quantity),
      reversibleQuantity: Number(line.reversibleQuantity),
      availableQuantity: Number(line.inventoryLot.availableQuantity),
      supplierName: line.inventoryLot.supplierName,
    }));
  }, [source, type]);

  const total = Object.values(quantities).reduce((sum, value) => sum + Number(value || 0), 0);

  const selectSource = (id: string) => {
    setSourceId(id);
    setQuantities({});
  };

  const fillMaximum = () => {
    const next: Record<string, string> = {};
    for (const line of sourceLines) {
      next[line.key] = String(line.reversibleQuantity);
    }
    setQuantities(next);
  };

  const submit = async () => {
    if (!sourceId) return alert('请选择需要冲销的原业务单');
    if (!reason.trim()) return alert('请填写冲销原因');
    const lines = sourceLines
      .filter((line: any) => Number(quantities[line.key] || 0) > 0)
      .map((line: any) => ({
        inventoryLotId: line.inventoryLotId,
        sourceSalesOutboundLineId: line.sourceSalesOutboundLineId,
        quantity: Number(quantities[line.key]),
      }));
    if (!lines.length) return alert('请填写本次冲销数量');
    for (const line of sourceLines as any[]) {
      const quantity = Number(quantities[line.key] || 0);
      if (quantity > line.reversibleQuantity + 0.0005) {
        return alert(`库存批次 ${line.lotNo} 本次最多可冲销 ${line.reversibleQuantity} 吨`);
      }
    }
    setSaving(true);
    try {
      const created = await api.post<any>('/inventory-reversals', {
        type,
        sourceId,
        reason,
        remarks: remarks || undefined,
        lines,
      });
      router.push(`/dashboard/inventory-reversals/${created.id}`);
    } catch (error: any) {
      alert(error.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/inventory-reversals')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">新建库存冲销单</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择已入账原单，严格按照原库存批次生成反向库存申请</p>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">冲销类型</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={type === 'INBOUND'}
            title="入库冲销"
            description="减少原业务入库批次的初始数量和当前可用库存"
            onClick={() => setType('INBOUND')}
          />
          <TypeCard
            active={type === 'OUTBOUND'}
            title="出库冲销"
            description="按照原销售出库明细恢复到原库存批次"
            onClick={() => setType('OUTBOUND')}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">选择原业务单</h2>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : !sources.length ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            暂无可冲销的{type === 'INBOUND' ? '业务入库单' : '销售出库单'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">选择</th>
                  <th className="p-3">原业务单</th>
                  <th className="p-3">关联物流单</th>
                  <th className="p-3">物料</th>
                  <th className="p-3">仓库</th>
                  <th className="p-3">供应商 / 客户</th>
                  <th className="p-3 text-right">原数量</th>
                  <th className="p-3 text-right">当前可冲销</th>
                  <th className="p-3">入账时间</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((item) => (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-b ${item.id === sourceId ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => selectSource(item.id)}
                  >
                    <td className="p-3"><input type="radio" checked={item.id === sourceId} readOnly /></td>
                    <td className="p-3 font-mono text-primary">{type === 'INBOUND' ? item.inboundNo : item.outboundNo}</td>
                    <td className="p-3 font-mono text-xs">{item.receipt.receiptNo}</td>
                    <td className="p-3">{item.materialName}</td>
                    <td className="p-3">{item.warehouse.name}</td>
                    <td className="p-3">{type === 'INBOUND' ? item.supplierName || '-' : item.customerName || '-'}</td>
                    <td className="p-3 text-right">{weight(item.quantity)}</td>
                    <td className="p-3 text-right font-medium">{weight(item.reversibleQuantity)}</td>
                    <td className="p-3">{formatDateTimeToSecond(item.postedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {source && (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">按原批次填写冲销数量</h2>
              <p className="mt-1 text-xs text-muted-foreground">本次冲销合计：{weight(total)}</p>
            </div>
            <Button variant="outline" onClick={fillMaximum}><RotateCcw className="mr-2 h-4 w-4" />填写最大可冲销量</Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">库存批次</th>
                  <th className="p-3">供应商</th>
                  <th className="p-3 text-right">原业务数量</th>
                  <th className="p-3 text-right">当前批次可用</th>
                  <th className="p-3 text-right">最大可冲销</th>
                  <th className="p-3 text-right">本次冲销（吨）</th>
                </tr>
              </thead>
              <tbody>
                {sourceLines.map((line: any) => (
                  <tr key={line.key} className="border-b">
                    <td className="p-3 font-mono text-primary">{line.lotNo}</td>
                    <td className="p-3">{line.supplierName || '-'}</td>
                    <td className="p-3 text-right">{weight(line.sourceQuantity)}</td>
                    <td className="p-3 text-right">{weight(line.availableQuantity)}</td>
                    <td className="p-3 text-right font-medium">{weight(line.reversibleQuantity)}</td>
                    <td className="p-3">
                      <Input
                        className="ml-auto w-36 text-right"
                        type="number"
                        min="0"
                        max={line.reversibleQuantity}
                        step="0.001"
                        value={quantities[line.key] || ''}
                        onChange={(event) => setQuantities((current) => ({ ...current, [line.key]: event.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">申请说明</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">冲销原因 *</label>
          <textarea
            className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="说明重复入账、数量录错、销售撤销等具体原因"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">备注</label>
          <Input value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void submit()}>
          <CheckCircle2 className="mr-2 h-4 w-4" />{saving ? '创建中...' : '创建冲销单'}
        </Button>
      </div>
    </div>
  );
}

function TypeCard({ active, title, description, onClick }: {
  active: boolean; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg border p-4 text-left transition ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
      onClick={onClick}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function weight(value: any) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
