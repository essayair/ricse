'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface CarrierOption {
  id: string;
  code: string;
  status: string;
  partner: { id: string; name: string; code: string };
}

export default function NewLogisticsContractPage() {
  const router = useRouter();
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carrierPartnerId, setCarrierPartnerId] = useState('');
  const [settlementBasis, setSettlementBasis] = useState('NET_WEIGHT');
  const [signedAt, setSignedAt] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expireAt, setExpireAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api.get<{ items: CarrierOption[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200');
        setCarriers(result.items || []);
      } catch (error: any) { alert(error.message); }
    })();
  }, []);

  const submit = async () => {
    if (!carrierPartnerId) { alert('请选择承运方'); return; }
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/logistics-contracts', {
        carrierPartnerId, settlementBasis,
        signedAt: signedAt || undefined,
        effectiveAt: effectiveAt || undefined,
        expireAt: expireAt || undefined,
        remarks: remarks || undefined,
      });
      router.push(`/dashboard/logistics-contracts/${created.id}`);
    } catch (error: any) { alert(error.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">新建物流合同</h1>
        <p className="mt-1 text-sm text-muted-foreground">仅用于长期约定价的物流公司；运满满、临时车辆不需要在此建档</p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium">承运方 *</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={carrierPartnerId} onChange={(e) => setCarrierPartnerId(e.target.value)}>
            <option value="">请选择物流承运商主数据</option>
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.partner.id}>{carrier.partner.name}（{carrier.code}）</option>
            ))}
          </select>
          {!carriers.length && (
            <p className="text-xs text-muted-foreground">未找到有效物流承运商，请先到服务生态维护承运方档案</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">结算方式</label>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={settlementBasis} onChange={(e) => setSettlementBasis(e.target.value)}>
            <option value="NET_WEIGHT">按净重</option>
            <option value="GROSS_WEIGHT">按毛重</option>
            <option value="TRIP">按车次</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">签约日期</label>
            <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">生效日期</label>
            <Input type="date" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">到期日期</label>
            <Input type="date" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">备注</label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="选填" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={() => void submit()} disabled={submitting}>{submitting ? '提交中...' : '创建'}</Button>
        </div>
      </Card>
    </div>
  );
}
