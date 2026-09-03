'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';

interface ContractSummary { id: string; contractNo: string; title: string; type: string; status: string }
interface ContractDetail extends ContractSummary {
  deliveryLocation: string | null;
  lineItems: Array<{ id: string; materialId: string; materialName: string | null; quantity: string; unit: string; unitPrice: string; salesUnitPrice?: string | null; availableQuantity?: number }>;
}

export default function CreateOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [type, setType] = useState('PURCHASE');
  const [name, setName] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ items: ContractSummary[] }>('/contracts?status=APPROVED&pageSize=100'),
      api.get<{ items: ContractSummary[] }>('/contracts?status=EXECUTING&pageSize=100'),
    ]).then(([approved, executing]) => {
      const unique = new Map([...approved.items, ...executing.items].map(item => [item.id, item]));
      setContracts([...unique.values()]);
    }).catch(error => alert(error.message || '合同加载失败'));
  }, []);

  const loadAvailability = useCallback(async (detail: ContractDetail, orderType: string) => {
    const availability = await api.get<{
      lineItems: Array<{ contractLineItemId: string; availableQuantity: number }>;
    }>(`/orders/contracts/${detail.id}/availability?type=${orderType}`);
    const availableById = new Map(availability.lineItems.map(item => [item.contractLineItemId, item.availableQuantity]));
    const next = {
      ...detail,
      lineItems: detail.lineItems.map(item => ({ ...item, availableQuantity: availableById.get(item.id) || 0 })),
    };
    setContract(next);
    setQuantities(Object.fromEntries(next.lineItems.map(item => [item.id, item.availableQuantity || 0])));
  }, []);

  const selectContract = useCallback(async (id: string) => {
    if (!id) {
      setContract(null);
      return;
    }
    try {
      const detail = await api.get<ContractDetail>(`/contracts/${id}`);
      const orderType = detail.type === 'SALES' ? 'SALES' : 'PURCHASE';
      setType(orderType);
      setName(`${detail.title}-${orderType === 'PURCHASE' ? '采购' : '销售'}执行批次`);
      setDeliveryLocation(detail.deliveryLocation || '');
      await loadAvailability(detail, orderType);
    } catch (error: any) {
      alert(error.message || '合同详情加载失败');
    }
  }, [loadAvailability]);

  useEffect(() => {
    const contractId = searchParams.get('contractId');
    if (contractId && !contract && contracts.some(item => item.id === contractId)) {
      void selectContract(contractId);
    }
  }, [contracts, contract, searchParams, selectContract]);

  const changeType = async (orderType: string) => {
    setType(orderType);
    if (contract) setName(`${contract.title}-${orderType === 'PURCHASE' ? '采购' : '销售'}执行批次`);
    if (contract) {
      try {
        await loadAvailability(contract, orderType);
      } catch (error: any) {
        alert(error.message || '剩余数量加载失败');
      }
    }
  };

  const unitPriceFor = useCallback((item: ContractDetail['lineItems'][number]) => (
    contract?.type === 'BILATERAL' && type === 'SALES' ? Number(item.salesUnitPrice || 0) : Number(item.unitPrice)
  ), [contract?.type, type]);

  const total = useMemo(() => contract?.lineItems.reduce(
    (sum, item) => sum + (quantities[item.id] || 0) * unitPriceFor(item),
    0,
  ) || 0, [contract, quantities, unitPriceFor]);

  const submit = async () => {
    if (!contract) return alert('请选择关联合同');
    if (!name.trim()) return alert('请填写执行批次名称');
    const lineItems = contract.lineItems
      .filter(item => (quantities[item.id] || 0) > 0)
      .map(item => ({ contractLineItemId: item.id, quantity: quantities[item.id] }));
    if (!lineItems.length) return alert('请至少填写一个大于 0 的本批次数量');
    setSaving(true);
    try {
      const order = await api.post<{ id: string }>('/orders', {
        name: name.trim(),
        contractId: contract.id,
        type,
        plannedDate: plannedDate || undefined,
        deliveryLocation: deliveryLocation || undefined,
        remarks: remarks || undefined,
        lineItems,
      });
      router.push(`/dashboard/orders/${order.id}`);
    } catch (error: any) {
      alert(error.message || '执行批次创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">新建执行批次</h1>
        <p className="mt-1 text-sm text-muted-foreground">从已通过或执行中的合同引入明细，按实际履约计划建立合同执行批次</p>
      </div>

      <Card className="space-y-5 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">关联合同 *</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={contract?.id || ''} onChange={event => void selectContract(event.target.value)}>
            <option value="">请选择合同</option>
            {contracts.map(item => <option key={item.id} value={item.id}>{item.contractNo} · {item.title}（{item.status === 'APPROVED' ? '已通过' : '执行中'}）</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">执行批次名称 *</label>
          <Input maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：7月第一批采购到货" />
          <p className="mt-1 text-xs text-muted-foreground">选择合同后系统生成建议名称，也可以直接填写或修改；批次编号仍由系统自动生成。</p>
        </div>

        {contract && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">执行批次类型 *</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={event => void changeType(event.target.value)} disabled={contract.type !== 'BILATERAL'}>
                  <option value="PURCHASE">采购执行批次</option>
                  <option value="SALES">销售执行批次</option>
                </select>
                {contract.type === 'BILATERAL' && <p className="mt-1 text-xs text-muted-foreground">双边合同需选择本次生成采购端或销售端执行批次</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">计划履约日期</label>
                <Input type="date" value={plannedDate} onChange={event => setPlannedDate(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">交货地点</label>
                <Input value={deliveryLocation} onChange={event => setDeliveryLocation(event.target.value)} />
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-semibold">批次明细</h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-muted-foreground">
                    <tr><th className="px-4 py-3 text-left">物料</th><th className="px-4 py-3 text-right">合同数量</th><th className="px-4 py-3 text-right">剩余可执行</th><th className="px-4 py-3 text-right">本批次数量</th><th className="px-4 py-3 text-right">{type === 'PURCHASE' ? '采购单价' : '销售单价'}</th><th className="px-4 py-3 text-right">金额</th></tr>
                  </thead>
                  <tbody>
                    {contract.lineItems.map(item => (
                      <tr key={item.id} className="border-b">
                        <td className="px-4 py-3">{item.materialName || item.materialId}</td>
                        <td className="px-4 py-3 text-right">{Number(item.quantity).toLocaleString()} {unitLabel(item.unit)}</td>
                        <td className="px-4 py-3 text-right font-medium">{Number(item.availableQuantity || 0).toLocaleString()} {unitLabel(item.unit)}</td>
                        <td className="px-4 py-3"><Input className="ml-auto w-36 text-right" type="number" min="0" max={item.availableQuantity || 0} step="0.001" value={quantities[item.id] ?? 0} onChange={event => setQuantities(current => ({ ...current, [item.id]: Number(event.target.value) }))} /></td>
                        <td className="px-4 py-3 text-right">¥{unitPriceFor(item).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium">¥{((quantities[item.id] || 0) * unitPriceFor(item)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-right text-lg font-bold">执行批次金额：¥{total.toLocaleString()}</div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">备注</label>
              <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={remarks} onChange={event => setRemarks(event.target.value)} />
            </div>
          </>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push('/dashboard/orders')}>取消</Button>
        <Button onClick={() => void submit()} disabled={!contract || saving}>{saving ? '创建中...' : '创建执行批次'}</Button>
      </div>
    </div>
  );
}
