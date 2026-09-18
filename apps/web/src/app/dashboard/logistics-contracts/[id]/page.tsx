'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface PriceTerm {
  id: string;
  originLocation: string;
  destinationLocation: string;
  unitPrice: string;
  effectiveAt: string;
  expiresAt: string | null;
}

interface ContractDetail {
  id: string;
  contractNo: string;
  status: string;
  settlementBasis: string;
  signedAt: string | null;
  effectiveAt: string | null;
  expireAt: string | null;
  remarks: string | null;
  carrierPartner: { id: string; name: string; code: string };
  priceTerms: PriceTerm[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', ACTIVE: '生效中', EXPIRED: '已到期', TERMINATED: '已终止',
};

const NEXT_STATUS: Record<string, string> = { DRAFT: 'ACTIVE', ACTIVE: 'TERMINATED' };
const NEXT_STATUS_LABEL: Record<string, string> = { ACTIVE: '启用合同', TERMINATED: '终止合同' };

export default function LogisticsContractDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get<ContractDetail>(`/logistics-contracts/${id}`);
      setContract(result);
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  const updateStatus = async (status: string) => {
    if (!confirm(`确认${NEXT_STATUS_LABEL[status]}？`)) return;
    setBusy(true);
    try { await api.patch(`/logistics-contracts/${id}/status`, { status }); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const addPriceTerm = async () => {
    if (!origin.trim() || !destination.trim() || !unitPrice || !effectiveAt) {
      alert('请填写起运地、目的地、单价和生效日期'); return;
    }
    setBusy(true);
    try {
      await api.post(`/logistics-contracts/${id}/price-terms`, {
        originLocation: origin.trim(), destinationLocation: destination.trim(),
        unitPrice: Number(unitPrice), effectiveAt, expiresAt: expiresAt || undefined,
      });
      setOrigin(''); setDestination(''); setUnitPrice(''); setEffectiveAt(''); setExpiresAt('');
      await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
  if (!contract) return <div className="p-12 text-center text-muted-foreground">物流合同不存在</div>;

  const nextStatus = NEXT_STATUS[contract.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono">{contract.contractNo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">承运方：{contract.carrierPartner.name}（{contract.carrierPartner.code}）</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusText status={contract.status}>{STATUS_LABEL[contract.status] || contract.status}</StatusText>
          {nextStatus && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateStatus(nextStatus)}>
              {NEXT_STATUS_LABEL[nextStatus]}
            </Button>
          )}
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-6 text-sm md:grid-cols-4">
        <div><div className="text-muted-foreground">结算方式</div><div className="mt-1">{contract.settlementBasis === 'NET_WEIGHT' ? '按净重' : contract.settlementBasis === 'GROSS_WEIGHT' ? '按毛重' : '按车次'}</div></div>
        <div><div className="text-muted-foreground">签约日期</div><div className="mt-1">{contract.signedAt?.slice(0, 10) || '—'}</div></div>
        <div><div className="text-muted-foreground">生效日期</div><div className="mt-1">{contract.effectiveAt?.slice(0, 10) || '—'}</div></div>
        <div><div className="text-muted-foreground">到期日期</div><div className="mt-1">{contract.expireAt?.slice(0, 10) || '不限'}</div></div>
        {contract.remarks && <div className="col-span-2 md:col-span-4"><div className="text-muted-foreground">备注</div><div className="mt-1">{contract.remarks}</div></div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-medium">运价条款（不分货物品类，按路线分生效期维护）</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3">起运地</th>
                <th className="p-3">目的地</th>
                <th className="p-3">单价（元/吨，含税）</th>
                <th className="p-3">生效期</th>
              </tr>
            </thead>
            <tbody>
              {contract.priceTerms.map((term) => (
                <tr key={term.id} className="border-b">
                  <td className="p-3">{term.originLocation}</td>
                  <td className="p-3">{term.destinationLocation}</td>
                  <td className="p-3">{term.unitPrice}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {term.effectiveAt.slice(0, 10)} ~ {term.expiresAt ? term.expiresAt.slice(0, 10) : '当前生效'}
                  </td>
                </tr>
              ))}
              {!contract.priceTerms.length && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">暂无运价条款</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t p-4 md:grid-cols-5">
          <Input placeholder="起运地" value={origin} onChange={(e) => setOrigin(e.target.value)} />
          <Input placeholder="目的地" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <Input placeholder="单价（元/吨）" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          <Input type="date" placeholder="生效日期" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} />
          <div className="flex gap-2">
            <Input type="date" placeholder="失效日期（选填）" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <Button disabled={busy} onClick={() => void addPriceTerm()}>新增</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
