'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';

interface Order { id: string; orderNo: string; name: string; type: string; status: string; contract: { contractNo: string; title: string } }
interface Available {
  order: Order & { deliveryLocation?: string | null };
  lineItems: Array<{ orderLineItemId: string; materialName: string | null; materialId: string; unit: string; batchQuantity: number; availableQuantity: number }>;
}
interface Warehouse { id: string; code: string; name: string; address?: string; status: string }

function warehouseLocation(warehouse: Warehouse) {
  return warehouse.address?.trim()
    ? `${warehouse.name}（${warehouse.address.trim()}）`
    : warehouse.name;
}

export default function CreateDispatchNoticePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [data, setData] = useState<Available | null>(null);
  const [mode, setMode] = useState('STANDARD');
  const [warehouseId, setWarehouseId] = useState('');
  const [originWarehouseId, setOriginWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [originLocation, setOriginLocation] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      api.get<{ items: Order[] }>('/orders?status=CONFIRMED&pageSize=100'),
      api.get<{ items: Order[] }>('/orders?status=DISPATCHED&pageSize=100'),
      api.get<Warehouse[]>('/master-data/warehouses'),
    ]).then(([confirmed, executing, warehouseData]) => {
      setOrders([...confirmed.items, ...executing.items]);
      setWarehouses(warehouseData.filter(item => item.status === 'ACTIVE'));
    }).catch(error => alert(error.message));
  }, []);

  const selectOrder = async (id: string) => {
    if (!id) {
      setData(null);
      setWarehouseId('');
      setOriginWarehouseId('');
      setDestinationWarehouseId('');
      setOriginLocation('');
      setDestinationLocation('');
      return;
    }
    try {
      const result = await api.get<Available>(`/dispatch-notices/orders/${id}/availability`);
      setData(result);
      setWarehouseId('');
      setOriginWarehouseId('');
      setDestinationWarehouseId('');
      setOriginLocation('');
      setDestinationLocation(result.order.deliveryLocation || '');
      setQuantities(Object.fromEntries(result.lineItems.map(item => [item.orderLineItemId, item.availableQuantity])));
    } catch (error: any) { alert(error.message); }
  };

  useEffect(() => {
    const orderId = params.get('orderId');
    if (orderId && orders.some(item => item.id === orderId) && data?.order.id !== orderId) void selectOrder(orderId);
  }, [orders, params, data]);

  const total = useMemo(() => Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0), [quantities]);

  const selectLocationWarehouse = (target: 'origin' | 'destination', id: string) => {
    const warehouse = warehouses.find(item => item.id === id);
    if (target === 'origin') {
      setOriginWarehouseId(id);
      if (data?.order.type === 'SALES' && mode === 'STANDARD') setWarehouseId(id);
      if (warehouse) setOriginLocation(warehouseLocation(warehouse));
      return;
    }
    setDestinationWarehouseId(id);
    if (warehouse) setDestinationLocation(warehouseLocation(warehouse));
  };

  const submit = async () => {
    if (!data) return alert('请选择执行批次');
    if (!originLocation.trim()) return alert('请填写起运地点，或选择仓库自动带入');
    if (!destinationLocation.trim()) return alert('请填写目的地点，或选择仓库自动带入');
    if (data.order.type === 'SALES' && mode === 'STANDARD' && !warehouseId) return alert('销售常规出库请选择起运仓库');
    const lineItems = data.lineItems.filter(item => quantities[item.orderLineItemId] > 0).map(item => ({ orderLineItemId: item.orderLineItemId, quantity: quantities[item.orderLineItemId] }));
    try {
      const notice = await api.post<{ id: string }>('/dispatch-notices', {
        orderId: data.order.id, mode, warehouseId: warehouseId || undefined, plannedDate: plannedDate || undefined,
        originLocation: originLocation.trim(), destinationLocation: destinationLocation.trim(), remarks: remarks || undefined, lineItems,
      });
      router.push(`/dashboard/dispatch-notices/${notice.id}`);
    } catch (error: any) { alert(error.message); }
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold">新建执行通知</h1><p className="mt-1 text-sm text-muted-foreground">采购生成供应商发货指令，销售生成销售发货通知单</p></div>
    <Card className="space-y-5 p-6">
      <div><label className="mb-1 block text-sm font-medium">合同执行批次 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={data?.order.id || ''} onChange={e => void selectOrder(e.target.value)}><option value="">请选择</option>{orders.map(item => <option key={item.id} value={item.id}>{item.name} · {item.orderNo} · {item.contract.contractNo}</option>)}</select></div>
      {data && <>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="mb-1 block text-sm font-medium">单据类型</label><Input disabled value={data.order.type === 'PURCHASE' ? '供应商发货指令' : '销售发货通知单'} /></div>
          <div><label className="mb-1 block text-sm font-medium">执行模式</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={e => setMode(e.target.value)}><option value="STANDARD">常规</option><option value="DIRECT">直拨</option></select></div>
          <div><label className="mb-1 block text-sm font-medium">计划日期</label><Input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)} /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <LocationField
            label="起运地点"
            value={originLocation}
            onChange={setOriginLocation}
            warehouses={warehouses}
            selectedWarehouseId={originWarehouseId}
            onSelectWarehouse={(id) => selectLocationWarehouse('origin', id)}
            warehouseRequired={data.order.type === 'SALES' && mode === 'STANDARD'}
          />
          <LocationField
            label="目的地点"
            value={destinationLocation}
            onChange={setDestinationLocation}
            warehouses={warehouses}
            selectedWarehouseId={destinationWarehouseId}
            onSelectWarehouse={(id) => selectLocationWarehouse('destination', id)}
          />
        </div>
        <div><h2 className="mb-2 font-semibold">通知明细</h2><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-3 py-2 text-left">物料</th><th className="px-3 py-2 text-right">批次数量</th><th className="px-3 py-2 text-right">剩余可通知</th><th className="px-3 py-2 text-right">本次通知数量</th></tr></thead><tbody>{data.lineItems.map(item => <tr key={item.orderLineItemId} className="border-b"><td className="px-3 py-2">{item.materialName || item.materialId}</td><td className="px-3 py-2 text-right">{item.batchQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2 text-right">{item.availableQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2"><Input className="ml-auto w-36 text-right" type="number" min="0" max={item.availableQuantity} value={quantities[item.orderLineItemId] || 0} onChange={e => setQuantities(current => ({ ...current, [item.orderLineItemId]: Number(e.target.value) }))} /></td></tr>)}</tbody></table><div className="mt-3 text-right font-bold">通知总数量：{total.toLocaleString()} 吨</div></div>
        <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
      </>}
    </Card>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={!data} onClick={() => void submit()}>创建执行通知</Button></div>
  </div>;
}

function LocationField({ label, value, onChange, warehouses, selectedWarehouseId, onSelectWarehouse, warehouseRequired = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onSelectWarehouse: (id: string) => void;
  warehouseRequired?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium">{label} *</label>
        {warehouseRequired && <span className="text-xs text-amber-700">销售常规出库须选择仓库</span>}
      </div>
      <select
        className="mb-2 h-9 w-full rounded-md border bg-muted/30 px-3 text-sm"
        value={selectedWarehouseId}
        onChange={(event) => onSelectWarehouse(event.target.value)}
      >
        <option value="">{warehouseRequired ? '请选择起运仓库' : '选择仓库快速填入（可选）'}</option>
        {warehouses.map(warehouse => (
          <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}{warehouse.address ? ` · ${warehouse.address}` : ''}</option>
        ))}
      </select>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`请输入${label}，或从上方选择仓库`}
        required
      />
    </div>
  );
}
