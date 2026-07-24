'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';

interface Order {
  id: string;
  orderNo: string;
  name: string;
  type: string;
  status: string;
  plannedDate: string | null;
  deliveryLocation: string | null;
  remarks: string | null;
  contract: { id: string; contractNo: string; title: string };
  lineItems: Array<{
    id: string;
    contractLineItemId: string;
    materialName: string | null;
    materialId: string;
    quantity: string;
    unit: string;
    unitPrice: string;
  }>;
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [available, setAvailable] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const detail = await api.get<Order>(`/orders/${id}`);
        if (detail.status !== 'DRAFT') {
          alert('仅草稿执行批次可以修改');
          router.replace(`/dashboard/orders/${id}`);
          return;
        }
        const availability = await api.get<{
          lineItems: Array<{ contractLineItemId: string; availableQuantity: number }>;
        }>(`/orders/contracts/${detail.contract.id}/availability?type=${detail.type}&excludeOrderId=${detail.id}`);
        setOrder(detail);
        setAvailable(Object.fromEntries(availability.lineItems.map(item => [item.contractLineItemId, item.availableQuantity])));
        setQuantities(Object.fromEntries(detail.lineItems.map(item => [item.contractLineItemId, Number(item.quantity)])));
        setName(detail.name);
        setPlannedDate(detail.plannedDate ? detail.plannedDate.slice(0, 10) : '');
        setDeliveryLocation(detail.deliveryLocation || '');
        setRemarks(detail.remarks || '');
      } catch (error: any) {
        alert(error.message || '执行批次加载失败');
        router.replace('/dashboard/orders');
      }
    };
    void load();
  }, [id, router]);

  const total = useMemo(() => order?.lineItems.reduce(
    (sum, item) => sum + (quantities[item.contractLineItemId] || 0) * Number(item.unitPrice),
    0,
  ) || 0, [order, quantities]);

  const save = async () => {
    if (!order) return;
    if (!name.trim()) return alert('请填写执行批次名称');
    const lineItems = order.lineItems
      .filter(item => (quantities[item.contractLineItemId] || 0) > 0)
      .map(item => ({ contractLineItemId: item.contractLineItemId, quantity: quantities[item.contractLineItemId] }));
    if (!lineItems.length) return alert('请至少保留一条批次明细');
    setSaving(true);
    try {
      await api.patch(`/orders/${id}`, {
        name: name.trim(),
        plannedDate: plannedDate || undefined,
        deliveryLocation,
        remarks,
        lineItems,
      });
      router.push(`/dashboard/orders/${id}`);
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!order) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">编辑执行批次</h1>
        <p className="mt-1 text-sm text-muted-foreground">{order.orderNo} · {order.contract.contractNo} · {order.contract.title}</p>
      </div>
      <Card className="space-y-5 p-6">
        <div><label className="mb-1 block text-sm font-medium">执行批次名称 *</label><Input maxLength={100} value={name} onChange={event => setName(event.target.value)} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium">计划履约日期</label><Input type="date" value={plannedDate} onChange={event => setPlannedDate(event.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">交货地点</label><Input value={deliveryLocation} onChange={event => setDeliveryLocation(event.target.value)} /></div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 text-left">物料</th><th className="px-4 py-3 text-right">可用数量</th><th className="px-4 py-3 text-right">本批次数量</th><th className="px-4 py-3 text-right">单价</th><th className="px-4 py-3 text-right">金额</th></tr></thead>
            <tbody>
              {order.lineItems.map(item => {
                const max = available[item.contractLineItemId] || 0;
                const quantity = quantities[item.contractLineItemId] || 0;
                return <tr key={item.id} className="border-b">
                  <td className="px-4 py-3">{item.materialName || item.materialId}</td>
                  <td className="px-4 py-3 text-right">{max.toLocaleString()} {unitLabel(item.unit)}</td>
                  <td className="px-4 py-3"><Input className="ml-auto w-36 text-right" type="number" min="0" max={max} step="0.001" value={quantity} onChange={event => setQuantities(current => ({ ...current, [item.contractLineItemId]: Number(event.target.value) }))} /></td>
                  <td className="px-4 py-3 text-right">¥{Number(item.unitPrice).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium">¥{(quantity * Number(item.unitPrice)).toLocaleString()}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="text-right text-lg font-bold">执行批次金额：¥{total.toLocaleString()}</div>
        <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={remarks} onChange={event => setRemarks(event.target.value)} /></div>
      </Card>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push(`/dashboard/orders/${id}`)}>取消</Button>
        <Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存修改'}</Button>
      </div>
    </div>
  );
}
