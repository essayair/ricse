'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, WandSparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { toLocalDateTimeInput } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function CreateOutboundPage() {
  const router = useRouter();
  const [waybills, setWaybills] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [waybillId, setWaybillId] = useState('');
  const [weighTicketId, setWeighTicketId] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [departedAt, setDepartedAt] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDepartedAt(toLocalDateTimeInput());
    const user = localStorage.getItem('user');
    if (user) {
      try { setOperatorName(JSON.parse(user).name || ''); } catch {}
    }
    api.get<any[]>('/outbound-receipts/eligible-waybills')
      .then(setWaybills)
      .catch((error) => alert(error.message));
  }, []);

  const waybill = waybills.find((item) => item.id === waybillId);
  const tickets = waybill?.weighTickets || [];
  const ticket = tickets.find((item: any) => item.id === weighTicketId);
  const quantity = Number(ticket?.settlementWeight || 0);
  const allocatedQuantity = useMemo(
    () => Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0),
    [allocations],
  );

  useEffect(() => {
    setWeighTicketId('');
    setLots([]);
    setAllocations({});
    if (!waybillId) return;
    api.get<any[]>(`/outbound-receipts/eligible-lots?waybillId=${encodeURIComponent(waybillId)}`)
      .then(setLots)
      .catch((error) => alert(error.message));
  }, [waybillId]);

  useEffect(() => {
    setAllocations({});
  }, [weighTicketId]);

  const autoAllocate = () => {
    let remaining = quantity;
    const next: Record<string, string> = {};
    for (const lot of lots) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, Number(lot.availableQuantity));
      if (amount > 0) next[lot.id] = amount.toFixed(3).replace(/\.?0+$/, '');
      remaining = Number((remaining - amount).toFixed(3));
    }
    setAllocations(next);
    if (remaining > 0) alert(`当前仓库可用库存不足，还缺 ${remaining} 吨`);
  };

  const submit = async () => {
    if (!waybillId || !weighTicketId || !departedAt || !operatorName.trim()) {
      return alert('请选择销售运单、出库磅单并填写离场信息');
    }
    if (Math.abs(allocatedQuantity - quantity) > 0.0005) {
      return alert(`批次分配数量必须等于出库重量 ${quantity} 吨`);
    }
    const selected = Object.entries(allocations)
      .filter(([, value]) => Number(value) > 0)
      .map(([inventoryLotId, value]) => ({ inventoryLotId, quantity: Number(value) }));
    if (!selected.length) return alert('请至少选择一个库存批次');
    setSaving(true);
    try {
      const created = await api.post<any>('/outbound-receipts', {
        waybillId,
        weighTicketId,
        departedAt,
        operatorName,
        remarks: remarks || undefined,
        allocations: selected,
      });
      router.push(`/dashboard/outbound/${created.id}`);
    } catch (error: any) {
      alert(error.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/outbound')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">新建物流出库单</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择销售常规运单、已复核出库磅单，并按库存批次拣配</p>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">选择待发运销售运单</h2>
        {!waybills.length ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            暂无符合条件的销售运单：运单需待发运、属于常规出库，且已完成出库磅单复核。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">选择</th>
                  <th className="p-3">运单</th>
                  <th className="p-3">执行批次</th>
                  <th className="p-3">物料</th>
                  <th className="p-3">发货仓库</th>
                  <th className="p-3">车牌</th>
                  <th className="p-3">计划数量</th>
                </tr>
              </thead>
              <tbody>
                {waybills.map((item) => (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-b ${item.id === waybillId ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => setWaybillId(item.id)}
                  >
                    <td className="p-3"><input type="radio" checked={item.id === waybillId} readOnly /></td>
                    <td className="p-3 font-mono text-primary">{item.waybillNo}</td>
                    <td className="p-3">{item.dispatchNotice.order.name}</td>
                    <td className="p-3">{item.lineItems.map((line: any) => line.materialName).join('、')}</td>
                    <td className="p-3">{item.dispatchNotice.warehouse?.name || '-'}</td>
                    <td className="p-3">{item.plateNo || '-'}</td>
                    <td className="p-3">{weight(item.totalQuantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className="font-semibold">出库依据与离场信息</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="已复核出库磅单 *">
            <select
              value={weighTicketId}
              onChange={(event) => setWeighTicketId(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="">请选择</option>
              {tickets.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.ticketNo} · 结算重量 {Number(item.settlementWeight)} 吨
                </option>
              ))}
            </select>
          </Field>
          <Field label="离场时间 *">
            <Input type="datetime-local" step="1" value={departedAt} onChange={(event) => setDepartedAt(event.target.value)} />
          </Field>
          <Field label="出库操作人 *">
            <Input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} />
          </Field>
          <Field label="备注">
            <Input value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">库存批次拣配</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              出库重量 {weight(quantity)}，已分配 {weight(allocatedQuantity)}，差额 {weight(quantity - allocatedQuantity)}
            </p>
          </div>
          <Button variant="outline" disabled={!quantity || !lots.length} onClick={autoAllocate}>
            <WandSparkles className="mr-2 h-4 w-4" />按入库时间自动分配
          </Button>
        </div>
        {!waybillId ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">请先选择销售运单</div>
        ) : !lots.length ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-destructive">该发货仓库没有对应物料的可用库存</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">库存批次</th>
                  <th className="p-3">业务入库单</th>
                  <th className="p-3">供应商</th>
                  <th className="p-3">入库时间</th>
                  <th className="p-3 text-right">可用数量</th>
                  <th className="p-3 text-right">本次分配（吨）</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} className="border-b">
                    <td className="p-3 font-mono text-primary">{lot.lotNo}</td>
                    <td className="p-3 font-mono text-xs">{lot.businessInbound.inboundNo}</td>
                    <td className="p-3">{lot.supplierName || '-'}</td>
                    <td className="p-3">{new Date(lot.businessInbound.postedAt).toLocaleString('zh-CN')}</td>
                    <td className="p-3 text-right">{weight(lot.availableQuantity)}</td>
                    <td className="p-3">
                      <Input
                        className="ml-auto w-36 text-right"
                        type="number"
                        min="0"
                        max={Number(lot.availableQuantity)}
                        step="0.001"
                        value={allocations[lot.id] || ''}
                        onChange={(event) => setAllocations((current) => ({ ...current, [lot.id]: event.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void submit()}>
          <CheckCircle2 className="mr-2 h-4 w-4" />{saving ? '创建中...' : '创建物流出库单'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>;
}

function weight(value: any) {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}
